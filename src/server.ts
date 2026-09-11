import cluster from "node:cluster";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import os from "node:os";
import { assertProductionConfiguration, config } from "./config.js";
import { checkAuth, handleGoogleCallback, logout, requireAuth, sendLoginOTP, startGoogleLogin, verifyLoginOTP } from "./auth.js";
import { renderAdminDashboard } from "./adminUi.js";
import { getStats, resetStats, saveStats } from "./analytics.js";
import { renderSettingsPage } from "./settingsUi.js";
import { renderLoginPage } from "./authUi.js";
import { renderDashboard } from "./dashboardUi.js";
import { dnsManager } from "./dnsManager.js";
import { domainManager } from "./domainManager.js";
import { startHealthMonitor } from "./healthMonitor.js";
import { hostnameFromRequest, readJsonBody, sendJson } from "./http.js";
import { renderLandingPage } from "./landing.js";
import { logger } from "./logger.js";
import { activeConnections, httpRequestDuration, httpRequestTotal, register as metricsRegister } from "./metrics.js";
import { cleanupExpiredCache, handleRequest, purgeCache } from "./proxy.js";
import { addSecurityHeaders, checkIPWhitelist, handleCORS, verifyRequestSignature } from "./security.js";
import { secureServerManager } from "./secureServer.js";
import { sslManager } from "./sslManager.js";
import { wsProxy } from "./websocketProxy.js";

type AppServer = ReturnType<typeof http.createServer>;
const adminPaths = new Set(["/admin-dashboard", "/admin-settings", "/cdn-dashboard", "/cdn-purge"]);

export function createRequestHandler() {
    return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        const startedAt = performance.now();
        activeConnections.inc();
        try {
            const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
            addSecurityHeaders(req, res);

            if (url.pathname === "/healthz" || url.pathname === "/health") return plain(res, 200, "OK");
            if (url.pathname === "/readyz") return plain(res, 200, "READY");

            if (url.pathname === "/login" && req.method === "GET") return html(res, 200, renderLoginPage());
            if (url.pathname === "/auth/login" && req.method === "POST") return await sendLoginOTP(req, res);
            if (url.pathname === "/auth/verify" && req.method === "POST") return await verifyLoginOTP(req, res);
            if (url.pathname === "/auth/google" && req.method === "GET") return await startGoogleLogin(req, res);
            if (url.pathname === "/auth/google/callback" && req.method === "GET") return await handleGoogleCallback(req, res);
            if (url.pathname === "/auth/logout" && req.method === "POST") return await logout(req, res);
            if (url.pathname.startsWith("/auth/")) return plain(res, 404, "Not Found");

            const isAdminRoute = url.pathname.startsWith("/admin/") || adminPaths.has(url.pathname);
            if (isAdminRoute && !(await authorizeAdmin(req, res))) return;

            if (url.pathname === "/admin/domains" && req.method === "GET") return sendJson(res, 200, domainManager.getAll());
            if (url.pathname === "/admin/domains" && req.method === "POST") return await addDomain(req, res);
            if (url.pathname === "/admin/domains" && req.method === "DELETE") return await removeDomain(req, res);
            if (url.pathname === "/admin/dns-verify" && req.method === "POST") return await verifyDns(req, res);
            if (url.pathname === "/admin/ssl-provision" && req.method === "POST") return await provisionSsl(req, res);
            if (url.pathname === "/admin/analytics/reset" && req.method === "POST") return sendJson(res, 200, { success: true, ...resetAnalytics() });
            if (url.pathname.startsWith("/admin/")) return plain(res, 404, "Not Found");

            if (url.pathname === "/admin-dashboard") return html(res, 200, renderAdminDashboard());
            if (url.pathname === "/admin-settings") return html(res, 200, renderSettingsPage(buildSettingsSnapshot()));
            if (url.pathname === "/cdn-dashboard") return html(res, 200, renderDashboard(getStats()));
            if (url.pathname === "/cdn-purge" && req.method === "POST") {
                const body = await readJsonBody(req);
                const path = typeof body.path === "string" ? body.path : "";
                const domain = typeof body.domain === "string" ? body.domain : undefined;
                if (!path) return sendJson(res, 400, { success: false, error: "path is required" });
                return sendJson(res, 200, await purgeCache(path, domain));
            }
            if (url.pathname === "/cdn-purge") return plain(res, 405, "Method Not Allowed");
            if (url.pathname === "/" || url.pathname === "/landing") return html(res, 200, renderLandingPage());

            const domain = domainManager.getConfig(hostnameFromRequest(req));
            if (handleCORS(req, res, domain ?? {})) return;
            await handleRequest(req, res);
        } catch (error) {
            logger.error("Request failed", { error: error instanceof Error ? error.message : "unknown", stack: error instanceof Error ? error.stack : undefined });
            if (!res.headersSent) plain(res, 500, "Internal Server Error");
            else if (!res.writableEnded) res.end();
        } finally {
            observeRequest(req, res, startedAt);
            activeConnections.dec();
        }
    };
}

async function authorizeAdmin(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (!checkIPWhitelist(req)) { plain(res, 403, "Forbidden"); return false; }
    if (!(await checkAuth(req))) { requireAuth(req, res); return false; }
    if (config.security.requireSignedRequests && !verifyRequestSignature(req)) { plain(res, 401, "Invalid request signature"); return false; }
    return true;
}

async function addDomain(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = await readJsonBody(req);
        if (typeof body.hostname !== "string" || (!Array.isArray(body.origin) && typeof body.origin !== "string")) throw new Error("hostname and origin are required");
        const domain = await domainManager.addDomain(body.hostname, body.origin, { plan: body.plan === "pro" || body.plan === "enterprise" ? body.plan : "free" });
        sendJson(res, 201, { success: true, domain });
    } catch (error) { sendJson(res, 400, { success: false, error: error instanceof Error ? error.message : "Invalid domain" }); }
}
async function removeDomain(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = await readJsonBody(req);
        if (typeof body.hostname !== "string") throw new Error("hostname is required");
        const removed = await domainManager.removeDomain(body.hostname);
        sendJson(res, removed ? 200 : 404, { success: removed });
    } catch (error) { sendJson(res, 400, { success: false, error: error instanceof Error ? error.message : "Invalid domain" }); }
}
async function verifyDns(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = await readJsonBody(req);
        if (typeof body.hostname !== "string") throw new Error("hostname is required");
        sendJson(res, 200, await dnsManager.verifyCNAME(body.hostname, hostnameFromRequest(req)));
    } catch (error) { sendJson(res, 400, { success: false, error: error instanceof Error ? error.message : "Invalid request" }); }
}
async function provisionSsl(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = await readJsonBody(req);
        if (typeof body.hostname !== "string" || !domainManager.getConfig(body.hostname)) throw new Error("Configured hostname is required");
        await sslManager.getCertificate(body.hostname);
        sendJson(res, 200, { success: true, message: "Certificate ready" });
    } catch (error) { sendJson(res, 400, { success: false, error: error instanceof Error ? error.message : "Certificate provisioning failed" }); }
}

function buildSettingsSnapshot() {
    return {
        environment: config.environment,
        port: config.https.enabled ? config.https.port : config.port,
        redisEnabled: config.redis.enabled,
        clusterEnabled: config.cluster,
        analyticsEnabled: config.analyticsEnabled,
        compressionEnabled: config.compression,
        defaultTtl: config.defaultTTL,
        cacheMaxSizeMb: config.cacheMaxSizeMB,
        httpsEnabled: config.https.enabled,
        websocketEnabled: config.websocket.enabled,
    };
}

function resetAnalytics(): { reset: true } {
    resetStats();
    return { reset: true };
}

function plain(res: ServerResponse, statusCode: number, message: string): void { res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }); res.end(message); }
function html(res: ServerResponse, statusCode: number, document: string): void { res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); res.end(document); }
function observeRequest(req: IncomingMessage, res: ServerResponse, startedAt: number): void {
    if (!config.prometheus.enabled) return;
    const cacheStatus = String(res.getHeader("x-cache") ?? "BYPASS");
    const labels = { method: req.method ?? "UNKNOWN", route: "proxy", status_code: String(res.statusCode), cache_status: cacheStatus };
    httpRequestDuration.observe(labels, (performance.now() - startedAt) / 1_000);
    httpRequestTotal.inc(labels);
}

function startMetricsServer(): AppServer | undefined {
    if (!config.prometheus.enabled) return undefined;
    const server = http.createServer(async (req, res) => {
        if (req.url !== config.prometheus.path) return plain(res, 404, "Not Found");
        try { res.writeHead(200, { "Content-Type": metricsRegister.contentType, "Cache-Control": "no-store" }); res.end(await metricsRegister.metrics()); }
        catch (error) { logger.error("Unable to render metrics", { error: error instanceof Error ? error.message : "unknown" }); plain(res, 500, "Internal Server Error"); }
    });
    server.listen(config.prometheus.port, "127.0.0.1", () => logger.info("Metrics server listening", { port: config.prometheus.port }));
    return server;
}

function startWorker(): void {
    const handler = createRequestHandler();
    const server = config.https.enabled ? secureServerManager.createServer(handler) : http.createServer(handler);
    if (config.websocket.enabled) wsProxy.initialize(server);
    const port = config.https.enabled ? config.https.port : config.port;
    server.listen(port, () => logger.info("Continuum worker listening", { port, pid: process.pid }));
    server.on("error", (error) => { logger.error("Server failure", { error: error.message, port }); process.exitCode = 1; });
    process.on("message", (message) => {
        if (message !== "shutdown") return;
        wsProxy.closeAll();
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(1), 10_000).unref();
    });
}

function startPrimary(): void {
    const workers = Math.min(config.maxWorkers, os.availableParallelism());
    for (let index = 0; index < workers; index += 1) cluster.fork();
    if (config.healthCheck.enabled) startHealthMonitor();
    const cacheCleanup = setInterval(() => void cleanupExpiredCache(), 10 * 60 * 1_000);
    cacheCleanup.unref();
    const metricsServer = startMetricsServer();
    let shuttingDown = false;
    cluster.on("exit", (worker, code, signal) => { if (!shuttingDown) { logger.warn("Worker exited; replacing", { pid: worker.process.pid, code, signal }); cluster.fork(); } });
    const shutdown = (signal: string) => {
        if (shuttingDown) return;
        shuttingDown = true; logger.info("Graceful shutdown requested", { signal }); saveStats(); metricsServer?.close();
        for (const worker of Object.values(cluster.workers ?? {})) worker?.send("shutdown");
        setTimeout(() => process.exit(0), 12_000).unref();
    };
    process.once("SIGINT", () => shutdown("SIGINT")); process.once("SIGTERM", () => shutdown("SIGTERM"));
}

if (process.argv[1]?.endsWith("server.js") || process.argv[1]?.endsWith("server.ts")) {
    assertProductionConfiguration();
    if (config.cluster && cluster.isPrimary) startPrimary(); else startWorker();
}
