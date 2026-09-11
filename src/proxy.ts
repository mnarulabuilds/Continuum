import crypto from "node:crypto";
import fs from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import https from "node:https";
import path from "node:path";
import { promisify } from "node:util";
import zlib from "node:zlib";
import { config } from "./config.js";
import { domainManager } from "./domainManager.js";
import { clientIp, hostnameFromRequest, removeHopByHopHeaders } from "./http.js";
import { optimizeImage } from "./imageProcessor.js";
import { logger } from "./logger.js";
import { logBandwidth, logRequest } from "./analytics.js";
import { checkWAF } from "./waf.js";
import { executeEdgeRule } from "./edgeEngine.js";
import { createRedisClient, type RedisClient } from "./redisClient.js";

type CacheMetadata = { headers: Record<string, string | string[]>; statusCode: number; expiresAt: number };
const brotliCompress = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);
const deflate = promisify(zlib.deflate);
const cacheDir = config.cacheDir;
const cachePrefix = "continuum:cache:";
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

fs.mkdirSync(cacheDir, { recursive: true, mode: 0o750 });

let redis: RedisClient | null = null;
let redisConnected = false;
if (config.redis.enabled) {
    redis = createRedisClient();
    redis.on("ready", () => { redisConnected = true; });
    redis.on("close", () => { redisConnected = false; });
    redis.on("error", (error: Error) => { redisConnected = false; logger.warn("Cache store error", { error: error.message }); });
    redis.connect().catch((error: Error) => logger.warn("Cache store unavailable; using disk cache", { error: error.message }));
}

function cacheKey(hostname: string, requestTarget: string): string {
    return crypto.createHash("sha256").update(`${hostname}\n${requestTarget}`).digest("hex");
}
function cachePaths(key: string): { body: string; meta: string } {
    return { body: path.join(cacheDir, key), meta: path.join(cacheDir, `${key}.json`) };
}
function cacheableRequest(req: IncomingMessage): boolean {
    return (req.method === "GET" || req.method === "HEAD")
        && !req.headers.authorization
        && !req.headers.cookie
        && !req.headers.range
        && !/no-cache|no-store/i.test(req.headers["cache-control"] ?? "");
}
function cacheableResponse(req: IncomingMessage, statusCode: number, headers: Record<string, string | string[]>, ttl: number): boolean {
    const cacheControl = headers["cache-control"]?.toString() ?? "";
    return req.method === "GET" && statusCode === 200 && ttl > 0 && !headers["set-cookie"] && !/private|no-store/i.test(cacheControl);
}
function cacheTtl(headers: Record<string, string | string[]>): number {
    const cacheControl = headers["cache-control"]?.toString() ?? "";
    if (/no-store|private/i.test(cacheControl)) return 0;
    const match = /(?:s-maxage|max-age)=(\d+)/i.exec(cacheControl);
    return match ? Math.min(Number(match[1]), config.defaultTTL) : config.defaultTTL;
}
function cachedHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | string[]> {
    const result = removeHopByHopHeaders(headers);
    delete result["set-cookie"];
    delete result["content-length"];
    return result;
}

async function checkRateLimit(req: IncomingMessage): Promise<boolean> {
    const ip = clientIp(req) || "unknown";
    if (redis && redisConnected) {
        try {
            const key = `${config.rateLimit.redisPrefix}${ip}`;
            const count = await redis.incr(key);
            if (count === 1) await redis.pexpire(key, config.rateLimit.windowMs);
            return count <= config.rateLimit.max;
        } catch (error) { logger.warn("Distributed rate limiter failed", { error: error instanceof Error ? error.message : "unknown" }); }
    }
    const now = Date.now();
    const current = rateLimitMap.get(ip);
    if (!current || now - current.windowStart >= config.rateLimit.windowMs) {
        rateLimitMap.set(ip, { count: 1, windowStart: now });
        if (rateLimitMap.size > 10_000) for (const [key, value] of rateLimitMap) if (now - value.windowStart >= config.rateLimit.windowMs) rateLimitMap.delete(key);
        return true;
    }
    current.count += 1;
    return current.count <= config.rateLimit.max;
}

async function readCache(key: string): Promise<{ body: Buffer; metadata: CacheMetadata } | null> {
    if (redis && redisConnected) {
        try {
            const values = await redis.mgetBuffer(`${cachePrefix}${key}:meta`, `${cachePrefix}${key}:body`);
            if (values[0] && values[1]) {
                const metadata = JSON.parse(values[0].toString()) as CacheMetadata;
                return { body: values[1], metadata };
            }
        } catch (error) { logger.warn("Distributed cache read failed", { error: error instanceof Error ? error.message : "unknown" }); }
    }
    const paths = cachePaths(key);
    try {
        const metadata = JSON.parse(fs.readFileSync(paths.meta, "utf8")) as CacheMetadata;
        if (metadata.expiresAt <= Date.now()) { safelyUnlink(paths.body); safelyUnlink(paths.meta); return null; }
        return { body: fs.readFileSync(paths.body), metadata };
    } catch { return null; }
}

async function writeCache(key: string, body: Buffer, metadata: CacheMetadata): Promise<void> {
    const paths = cachePaths(key);
    const temporaryBody = `${paths.body}.${process.pid}.tmp`;
    const temporaryMeta = `${paths.meta}.${process.pid}.tmp`;
    try {
        fs.writeFileSync(temporaryBody, body, { mode: 0o640 });
        fs.writeFileSync(temporaryMeta, JSON.stringify(metadata), { mode: 0o640 });
        fs.renameSync(temporaryBody, paths.body);
        fs.renameSync(temporaryMeta, paths.meta);
    } catch (error) {
        safelyUnlink(temporaryBody); safelyUnlink(temporaryMeta);
        logger.warn("Disk cache write failed", { error: error instanceof Error ? error.message : "unknown" });
    }
    if (redis && redisConnected) {
        const ttlSeconds = Math.max(1, Math.ceil((metadata.expiresAt - Date.now()) / 1_000));
        await redis.multi()
            .set(`${cachePrefix}${key}:meta`, JSON.stringify(metadata), "EX", ttlSeconds)
            .set(`${cachePrefix}${key}:body`, body, "EX", ttlSeconds)
            .exec()
            .catch((error: Error) => logger.warn("Distributed cache write failed", { error: error.message }));
    }
}

function safelyUnlink(file: string): void { try { fs.unlinkSync(file); } catch { /* cache cleanup is best effort */ } }

export async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const hostname = hostnameFromRequest(req);
    const requestTarget = req.url ?? "/";
    const domain = domainManager.getConfig(hostname);
    const wafResult = checkWAF(req, domain ?? {});
    if (wafResult.blocked) {
        logRequest("BLOCKED", hostname, requestTarget, clientIp(req));
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
        return void res.end("Forbidden");
    }
    if (!await checkRateLimit(req)) {
        res.writeHead(429, { "Content-Type": "text/plain; charset=utf-8", "Retry-After": String(Math.ceil(config.rateLimit.windowMs / 1_000)), "Cache-Control": "no-store" });
        return void res.end("Too Many Requests");
    }
    const origin = await domainManager.getOrigin(hostname);
    if (!origin) {
        logRequest("ERROR", hostname, requestTarget, clientIp(req));
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
        return void res.end("Domain Not Configured");
    }
    if (config.security.edgeScriptsEnabled) {
        for (const rule of domain?.edgeRules ?? []) if ((await executeEdgeRule(rule, req, res, "request"))?.stop) return;
    }

    const key = cacheKey(hostname, requestTarget);
    if (cacheableRequest(req)) {
        const cached = await readCache(key);
        if (cached) {
            logRequest("HIT", hostname, requestTarget, clientIp(req));
            await sendResponse(req, res, cached.body, cached.metadata.headers, cached.metadata.statusCode, "HIT", hostname);
            return;
        }
    }
    logRequest("MISS", hostname, requestTarget, clientIp(req));
    await requestOrigin(req, res, origin, hostname, key);
}

async function requestOrigin(req: IncomingMessage, res: ServerResponse, origin: string, hostname: string, key: string): Promise<void> {
    const originUrl = new URL(origin);
    const transport = originUrl.protocol === "https:" ? https : http;
    const headers = removeHopByHopHeaders(req.headers);
    delete headers.host;
    headers.host = originUrl.host;
    headers["x-forwarded-for"] = clientIp(req);
    headers["x-forwarded-host"] = req.headers.host ?? "";
    headers["x-forwarded-proto"] = "encrypted" in req.socket && req.socket.encrypted ? "https" : "http";

    await new Promise<void>((resolve) => {
        let completed = false;
        const finish = () => { if (!completed) { completed = true; resolve(); } };
        const proxyRequest = transport.request({ hostname: originUrl.hostname, port: originUrl.port || undefined, path: req.url, method: req.method, headers, timeout: config.originTimeoutMs }, (originResponse) => {
            const statusCode = originResponse.statusCode ?? 502;
            const responseHeaders = cachedHeaders(originResponse.headers);
            const declaredLength = Number(originResponse.headers["content-length"] ?? 0);
            if (Number.isFinite(declaredLength) && declaredLength > config.maxOriginResponseBytes) {
                originResponse.destroy();
                sendGatewayError(res, 502, "Origin response is too large");
                return finish();
            }
            const chunks: Buffer[] = [];
            let length = 0;
            originResponse.on("data", (chunk: Buffer) => {
                length += chunk.length;
                if (length > config.maxOriginResponseBytes) {
                    originResponse.destroy(new Error("Origin response exceeded configured size limit"));
                    return;
                }
                chunks.push(chunk);
            });
            originResponse.on("error", (error) => {
                logger.warn("Origin response failed", { hostname, error: error.message });
                if (!res.headersSent) sendGatewayError(res, 502, "Bad Gateway");
                finish();
            });
            originResponse.on("end", async () => {
                const body = Buffer.concat(chunks);
                const ttl = cacheTtl(responseHeaders);
                if (cacheableResponse(req, statusCode, responseHeaders, ttl)) {
                    await writeCache(key, body, { headers: responseHeaders, statusCode, expiresAt: Date.now() + ttl * 1_000 });
                }
                await sendResponse(req, res, body, responseHeaders, statusCode, "MISS", hostname);
                finish();
            });
        });
        proxyRequest.on("timeout", () => proxyRequest.destroy(new Error("Origin timeout")));
        proxyRequest.on("error", (error) => {
            logger.warn("Origin request failed", { hostname, origin, error: error.message });
            if (!res.headersSent) sendGatewayError(res, 502, "Bad Gateway");
            finish();
        });
        req.on("aborted", () => proxyRequest.destroy());
        req.pipe(proxyRequest);
    });
}

function sendGatewayError(res: ServerResponse, statusCode: number, message: string): void {
    if (!res.writableEnded) { res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }); res.end(message); }
}

async function sendResponse(req: IncomingMessage, res: ServerResponse, originalBody: Buffer, sourceHeaders: Record<string, string | string[]>, statusCode: number, cacheStatus: string, hostname: string): Promise<void> {
    let body = originalBody;
    const headers: Record<string, string | string[]> = { ...sourceHeaders, "x-cache": cacheStatus, "x-continuum-worker": String(process.pid) };
    const contentType = String(headers["content-type"] ?? "").toLowerCase();
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const width = url.searchParams.get("w") ?? url.searchParams.get("width");
    const height = url.searchParams.get("h") ?? url.searchParams.get("height");
    const quality = url.searchParams.get("q") ?? url.searchParams.get("quality");
    const format = url.searchParams.get("f") ?? url.searchParams.get("format");
    const isImage = contentType.startsWith("image/") || /\.(?:jpe?g|png|webp|avif)$/i.test(url.pathname);
    if (isImage && (width || height || quality || format || config.optimization.autoAvif || config.optimization.autoWebp)) {
        const optimized = await optimizeImage(body, { width, height, quality, format, accept: req.headers.accept });
        body = optimized.buffer;
        if (optimized.contentType) headers["content-type"] = optimized.contentType;
        headers["x-continuum-optimized"] = "true";
        appendVary(headers, "Accept");
    }
    const encodable = config.compression && body.length > 1_024 && !headers["content-encoding"] && !/^(?:image\/|video\/|audio\/|application\/(?:zip|gzip|pdf))/i.test(String(headers["content-type"] ?? ""));
    let encoding: string | undefined;
    if (encodable && req.method !== "HEAD") {
        const accepted = req.headers["accept-encoding"] ?? "";
        if (/\bbr\b/.test(accepted)) { body = await brotliCompress(body); encoding = "br"; }
        else if (/\bgzip\b/.test(accepted)) { body = await gzip(body); encoding = "gzip"; }
        else if (/\bdeflate\b/.test(accepted)) { body = await deflate(body); encoding = "deflate"; }
        if (encoding) appendVary(headers, "Accept-Encoding");
    }
    delete headers["content-length"];
    if (encoding) headers["content-encoding"] = encoding;
    headers["content-length"] = String(body.length);
    res.writeHead(statusCode, headers);
    res.end(req.method === "HEAD" ? undefined : body);
    logBandwidth(body.length, hostname, req.url ?? "/", clientIp(req));
}

function appendVary(headers: Record<string, string | string[]>, value: string): void {
    const existing = String(headers.vary ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
    if (!existing.some((entry) => entry.toLowerCase() === value.toLowerCase())) existing.push(value);
    headers.vary = existing.join(", ");
}

export async function purgeCache(pathOrUrl: string, domain?: string): Promise<{ success: boolean; count: number; error?: string }> {
    if (pathOrUrl === "all") {
        const files = fs.readdirSync(cacheDir);
        for (const file of files) safelyUnlink(path.join(cacheDir, file));
        if (redis && redisConnected) await deleteRedisCacheByPattern(`${cachePrefix}*`);
        return { success: true, count: files.length };
    }
    let hostname = domain?.toLowerCase();
    let resource = pathOrUrl;
    try {
        const url = new URL(pathOrUrl);
        hostname ??= url.hostname.toLowerCase();
        resource = `${url.pathname}${url.search}`;
    } catch { /* path with explicit domain is allowed */ }
    if (!hostname || !resource.startsWith("/")) return { success: false, count: 0, error: "A domain and absolute path are required" };
    const key = cacheKey(hostname, resource);
    const paths = cachePaths(key);
    let count = 0;
    if (fs.existsSync(paths.body)) { safelyUnlink(paths.body); count += 1; }
    if (fs.existsSync(paths.meta)) { safelyUnlink(paths.meta); count += 1; }
    if (redis && redisConnected) { count += await redis.del(`${cachePrefix}${key}:meta`, `${cachePrefix}${key}:body`); }
    return { success: count > 0, count };
}

async function deleteRedisCacheByPattern(pattern: string): Promise<void> {
    if (!redis) return;
    let cursor = "0";
    do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 500);
        cursor = nextCursor;
        if (keys.length) await redis.del(...keys);
    } while (cursor !== "0");
}

export async function cleanupExpiredCache(): Promise<void> {
    for (const file of fs.readdirSync(cacheDir)) {
        if (!file.endsWith(".json")) continue;
        const meta = path.join(cacheDir, file);
        const body = meta.slice(0, -5);
        try { if ((JSON.parse(fs.readFileSync(meta, "utf8")) as CacheMetadata).expiresAt <= Date.now()) { safelyUnlink(body); safelyUnlink(meta); } }
        catch { safelyUnlink(body); safelyUnlink(meta); }
    }
}
