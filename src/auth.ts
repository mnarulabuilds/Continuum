import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import cookie from "cookie";
import { OAuth2Client } from "google-auth-library";
import nodemailer from "nodemailer";
import { config } from "./config.js";
import { readJsonBody, sendJson } from "./http.js";
import { logger } from "./logger.js";
import { createRedisClient, type RedisClient } from "./redisClient.js";

const sessionTtlSeconds = 24 * 60 * 60;
const otpTtlSeconds = 5 * 60;
const oauthStateTtlSeconds = 10 * 60;
const cookieName = "Continuum_session";
type RecordValue = { value: string; expiresAt: number };
const localStore = new Map<string, RecordValue>();
let redis: RedisClient | null = null;
let redisConnected = false;

const googleClient = new OAuth2Client(config.google.clientId, config.google.clientSecret, config.google.redirectUri);
const transporter = config.smtp.host && config.smtp.user && config.smtp.pass
    ? nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465, auth: { user: config.smtp.user, pass: config.smtp.pass } })
    : null;

if (config.redis.enabled) {
    redis = createRedisClient();
    redis.on("ready", () => { redisConnected = true; });
    redis.on("close", () => { redisConnected = false; });
    redis.on("error", (error: Error) => { redisConnected = false; logger.warn("Authentication store error", { error: error.message }); });
    redis.connect().catch((error: Error) => logger.warn("Authentication store unavailable", { error: error.message }));
}

function isAuthorizedEmail(email: string): boolean {
    return config.security.adminEmailAllowlist.includes(email.trim().toLowerCase());
}
function otpHash(email: string, otp: string): string {
    return crypto.createHmac("sha256", config.security.sessionSecret ?? "development-only-secret").update(`${email.toLowerCase()}\n${otp}`).digest("hex");
}
function randomToken(): string { return crypto.randomBytes(32).toString("base64url"); }
function storeKey(kind: string, value: string): string { return `continuum:auth:${kind}:${value}`; }

async function put(kind: string, key: string, value: string, ttlSeconds: number): Promise<void> {
    if (redis && redisConnected) { await redis.set(storeKey(kind, key), value, "EX", ttlSeconds); return; }
    if (config.isProduction) throw new Error("Authentication storage is unavailable");
    localStore.set(storeKey(kind, key), { value, expiresAt: Date.now() + ttlSeconds * 1_000 });
}
async function take(kind: string, key: string): Promise<string | null> {
    const storageKey = storeKey(kind, key);
    if (redis && redisConnected) return redis.getdel(storageKey);
    if (config.isProduction) return null;
    const record = localStore.get(storageKey);
    localStore.delete(storageKey);
    return record && record.expiresAt > Date.now() ? record.value : null;
}
async function get(kind: string, key: string): Promise<string | null> {
    const storageKey = storeKey(kind, key);
    if (redis && redisConnected) return redis.get(storageKey);
    if (config.isProduction) return null;
    const record = localStore.get(storageKey);
    if (!record || record.expiresAt <= Date.now()) { localStore.delete(storageKey); return null; }
    return record.value;
}
async function remove(kind: string, key: string): Promise<void> {
    const storageKey = storeKey(kind, key);
    if (redis && redisConnected) { await redis.del(storageKey); return; }
    localStore.delete(storageKey);
}

function sessionCookie(sessionId: string): string {
    return cookie.serialize(cookieName, sessionId, {
        httpOnly: true, secure: config.security.cookieSecure, sameSite: "lax", maxAge: sessionTtlSeconds, path: "/",
    });
}

async function createSession(email: string): Promise<string> {
    const sessionId = randomToken();
    await put("session", sessionId, email, sessionTtlSeconds);
    return sessionId;
}

export async function checkAuth(req: IncomingMessage): Promise<boolean> {
    try {
        const sessionId = cookie.parse(req.headers.cookie ?? "")[cookieName];
        if (!sessionId || sessionId.length > 128) return false;
        const email = await get("session", sessionId);
        return Boolean(email && isAuthorizedEmail(email));
    } catch (error) {
        logger.warn("Authentication lookup failed", { error: error instanceof Error ? error.message : "unknown" });
        return false;
    }
}

export function requireAuth(_req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(302, { Location: "/login", "Cache-Control": "no-store" });
    res.end();
}

export async function sendLoginOTP(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = await readJsonBody(req);
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        if (!isValidEmail(email) || !isAuthorizedEmail(email)) { sendJson(res, 403, { success: false, error: "Login is not permitted" }); return; }
        const otp = crypto.randomInt(100_000, 1_000_000).toString();
        await put("otp", email, otpHash(email, otp), otpTtlSeconds);
        if (transporter) {
            await transporter.sendMail({ from: `Continuum Admin <${config.smtp.from}>`, to: email, subject: "Continuum administrator login code", text: `Your one-time login code is ${otp}. It expires in 5 minutes.` });
        } else if (config.isProduction) {
            sendJson(res, 503, { success: false, error: "Email login is not configured" });
            return;
        } else {
            logger.info("Development login code", { email, otp });
        }
        sendJson(res, 200, { success: true });
    } catch (error) {
        logger.warn("Unable to send login OTP", { error: error instanceof Error ? error.message : "unknown" });
        sendJson(res, 400, { success: false, error: "Unable to process login request" });
    }
}

export async function verifyLoginOTP(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = await readJsonBody(req);
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const otp = typeof body.otp === "string" ? body.otp.trim() : "";
        if (!isValidEmail(email) || !/^\d{6}$/.test(otp) || !isAuthorizedEmail(email)) { sendJson(res, 401, { success: false, error: "Invalid login code" }); return; }
        const expected = await take("otp", email);
        if (!expected || !timingSafeEqual(expected, otpHash(email, otp))) { sendJson(res, 401, { success: false, error: "Invalid login code" }); return; }
        const sessionId = await createSession(email);
        res.writeHead(200, { "Set-Cookie": sessionCookie(sessionId), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ success: true }));
    } catch (error) {
        logger.warn("Unable to verify login OTP", { error: error instanceof Error ? error.message : "unknown" });
        sendJson(res, 401, { success: false, error: "Invalid login code" });
    }
}

export async function startGoogleLogin(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!config.google.clientId || !config.google.clientSecret) { sendJson(res, 503, { success: false, error: "Google login is not configured" }); return; }
    try {
        const state = randomToken();
        await put("oauth-state", state, "1", oauthStateTtlSeconds);
        const authorizeUrl = googleClient.generateAuthUrl({ access_type: "offline", scope: ["openid", "email", "profile"], state, prompt: "select_account" });
        res.writeHead(302, { Location: authorizeUrl, "Cache-Control": "no-store" });
        res.end();
    } catch (error) {
        logger.warn("Unable to initiate Google login", { error: error instanceof Error ? error.message : "unknown" });
        sendJson(res, 503, { success: false, error: "Authentication is temporarily unavailable" });
    }
}

export async function handleGoogleCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state || !(await take("oauth-state", state))) throw new Error("Invalid OAuth state");
        const clientId = config.google.clientId;
        if (!clientId) throw new Error("Google login is not configured");
        const { tokens } = await googleClient.getToken(code);
        if (!tokens.id_token) throw new Error("Missing ID token");
        const ticket = await googleClient.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
        const payload = ticket.getPayload();
        const email = payload?.email?.toLowerCase();
        if (!email || !payload?.email_verified || !isAuthorizedEmail(email)) throw new Error("Email is not authorized");
        const sessionId = await createSession(email);
        res.writeHead(302, { "Set-Cookie": sessionCookie(sessionId), Location: "/admin-dashboard", "Cache-Control": "no-store" });
        res.end();
    } catch (error) {
        logger.warn("Google login failed", { error: error instanceof Error ? error.message : "unknown" });
        res.writeHead(302, { Location: "/login?error=authentication_failed", "Cache-Control": "no-store" });
        res.end();
    }
}

export async function logout(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = cookie.parse(req.headers.cookie ?? "")[cookieName];
    if (sessionId) await remove("session", sessionId).catch(() => undefined);
    res.writeHead(204, { "Set-Cookie": cookie.serialize(cookieName, "", { httpOnly: true, secure: config.security.cookieSecure, sameSite: "lax", path: "/", maxAge: 0 }), "Cache-Control": "no-store" });
    res.end();
}

function isValidEmail(value: string): boolean { return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function timingSafeEqual(left: string, right: string): boolean {
    const a = Buffer.from(left); const b = Buffer.from(right);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
