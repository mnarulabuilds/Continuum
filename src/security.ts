import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";
import { config } from "./config.js";
import { clientIp } from "./http.js";

export type CorsConfig = {
    allowedOrigins?: string[];
    allowedMethods?: string;
    allowedHeaders?: string;
    maxAge?: string;
    allowCredentials?: boolean;
};

export function addSecurityHeaders(req: IncomingMessage, res: ServerResponse): void {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
    if (config.https.enabled || ("encrypted" in req.socket && Boolean(req.socket.encrypted))) {
        res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
}

export function handleCORS(req: IncomingMessage, res: ServerResponse, domainConfig: { cors?: CorsConfig | undefined } = {}): boolean {
    const cors = domainConfig.cors;
    const origin = req.headers.origin;
    if (!cors || !origin) return req.method === "OPTIONS" ? respondPreflight(res, 404) : false;

    const allowedOrigins = cors.allowedOrigins ?? [];
    const allowsAnyOrigin = allowedOrigins.includes("*") && !cors.allowCredentials;
    if (!allowsAnyOrigin && !allowedOrigins.includes(origin)) {
        return req.method === "OPTIONS" ? respondPreflight(res, 403) : false;
    }

    res.setHeader("Access-Control-Allow-Origin", allowsAnyOrigin ? "*" : origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", cors.allowedMethods ?? "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", cors.allowedHeaders ?? "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", cors.maxAge ?? "86400");
    if (cors.allowCredentials) res.setHeader("Access-Control-Allow-Credentials", "true");
    return req.method === "OPTIONS" ? respondPreflight(res, 204) : false;
}

function respondPreflight(res: ServerResponse, statusCode: number): true {
    res.writeHead(statusCode);
    res.end();
    return true;
}

export function checkIPWhitelist(req: IncomingMessage): boolean {
    const whitelist = config.security.adminWhitelist;
    if (whitelist.length === 0) return true;
    const ip = normalizeIp(clientIp(req));
    return whitelist.some((entry) => ipMatchesCidr(ip, entry));
}

function normalizeIp(ip: string): string {
    return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

function ipMatchesCidr(ip: string, entry: string): boolean {
    const [range, rawBits] = entry.split("/");
    const normalizedRange = normalizeIp(range ?? "");
    if (!rawBits) return ip === normalizedRange;
    if (!isIP(ip) || isIP(ip) !== 4 || isIP(normalizedRange) !== 4) return false;
    const bits = Number(rawBits);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;
    return ipv4ToNumber(ip) >>> (32 - bits) === ipv4ToNumber(normalizedRange) >>> (32 - bits);
}

function ipv4ToNumber(ip: string): number {
    return ip.split(".").reduce((number, octet) => (number << 8) | Number(octet), 0) >>> 0;
}

export function verifyRequestSignature(req: IncomingMessage): boolean {
    const signature = req.headers["x-continuum-signature"];
    const timestamp = req.headers["x-continuum-timestamp"];
    if (typeof signature !== "string" || typeof timestamp !== "string" || !config.security.sessionSecret) return false;
    const requestTime = Number(timestamp);
    if (!Number.isSafeInteger(requestTime) || Math.abs(Date.now() - requestTime) > 5 * 60 * 1000) return false;
    const expected = crypto.createHmac("sha256", config.security.sessionSecret).update(`${req.method}${req.url}${timestamp}`).digest();
    let actual: Buffer;
    try { actual = Buffer.from(signature, "hex"); } catch { return false; }
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function generateRequestSignature(method: string, url: string): Record<string, string> {
    if (!config.security.sessionSecret) throw new Error("SESSION_SECRET is not configured");
    const timestamp = String(Date.now());
    return {
        "X-Continuum-Signature": crypto.createHmac("sha256", config.security.sessionSecret).update(`${method}${url}${timestamp}`).digest("hex"),
        "X-Continuum-Timestamp": timestamp,
    };
}
