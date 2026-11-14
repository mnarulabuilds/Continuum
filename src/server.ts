import { randomUUID } from "node:crypto";
import cluster from "node:cluster";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import os from "node:os";
import { assertProductionConfiguration, config } from "./config.js";
import { checkAuth, handleGoogleCallback, logout, requireAuth, sendLoginOTP, startGoogleLogin, verifyLoginOTP } from "./auth.js";
import { handleAdminApiRequest } from "./adminApi.js";
import { renderAdminDashboard } from "./adminUi.js";
import { getStats, saveStats } from "./analytics.js";
import { renderSettingsPage } from "./settingsUi.js";
import { renderLoginPage } from "./authUi.js";
import { renderDashboard } from "./dashboardUi.js";
import { domainManager } from "./domainManager.js";
import { startHealthMonitor } from "./healthMonitor.js";
import { hostnameFromRequest } from "./http.js";
import { renderLandingPage } from "./landing.js";
import { logger, withLogContext } from "./logger.js";
import { activeConnections, aggregatorRegistry, httpRequestDuration, httpRequestTotal, register as metricsRegister } from "./metrics.js";
import { cleanupExpiredCache, handleRequest } from "./proxy.js";
import { addSecurityHeaders, checkIPWhitelist, handleCORS, isSameOriginMutation, verifyRequestSignature } from "./security.js";
import { secureServerManager } from "./secureServer.js";
import { wsProxy } from "./websocketProxy.js";

type AppServer = ReturnType<typeof http.createServer>;
const adminPaths = new Set(["/admin-dashboard", "/admin-settings", "/cdn-dashboard", "/cdn-purge"]);

export function createRequestHandler() {
    return (req: IncomingMessage, res: ServerResponse): Promise<void> => {
        const requestId = randomUUID();
        res.setHeader("x-request-id", requestId);
        return withLogContext({ requestId }, async () => {
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
                if (url.pathname === "/auth/logout" && req.method === "POST") {
                    if (!isSameOriginMutation(req)) return plain(res, 403, "Cross-origin request rejected");
                    return await logout(req, res);
                }
                if (url.pathname.startsWith("/auth/")) return plain(res, 404, "Not Found");

                const isAdminRoute = url.pathname.startsWith("/admin/") || adminPaths.has(url.pathname);
                if (isAdminRoute && !(await authorizeAdmin(req, res))) return;

                if (await handleAdminApiRequest(req, res, url.pathname)) return;

                if (url.pathname === "/admin-dashboard") return html(res, 200, renderAdminDashboard(config.defaultTTL));
                if (url.pathname === "/admin-settings") return html(res, 200, renderSettingsPage(buildSettingsSnapshot()));
                if (url.pathname === "/cdn-dashboard") return html(res, 200, renderDashboard(getStats()));
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
        });
    };
}

async function authorizeAdmin(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (!isSameOriginMutation(req)) { plain(res, 403, "Cross-origin request rejected"); return false; }
    if (!checkIPWhitelist(req)) { plain(res, 403, "Forbidden"); return false; }
    if (!(await checkAuth(req))) { requireAuth(req, res); return false; }
    if (config.security.requireSignedRequests && !verifyRequestSignature(req)) { plain(res, 401, "Invalid request signature"); return false; }
    return true;
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

function plain(res: ServerResponse, statusCode: number, message: string): void { res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }); res.end(message); }
function html(res: ServerResponse, statusCode: number, document: string): void { res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); res.end(document); }
function observeRequest(req: IncomingMessage, res: ServerResponse, startedAt: number): void {
    if (!config.prometheus.enabled) return;
    const cacheStatus = String(res.getHeader("x-cache") ?? "BYPASS");
    const labels = { method: req.method ?? "UNKNOWN", route: metricRoute(req.url), status_code: String(res.statusCode), cache_status: cacheStatus };
    httpRequestDuration.observe(labels, (performance.now() - startedAt) / 1_000);
    httpRequestTotal.inc(labels);
}
function metricRoute(target: string | undefined): string {
    const pathname = target?.split("?", 1)[0] ?? "/";
    if (pathname === "/health" || pathname === "/healthz" || pathname === "/readyz") return "health";
    if (pathname.startsWith("/auth/")) return "auth";
    if (pathname === "/cdn-purge") return "cache_purge";
    if (pathname.startsWith("/admin/") || adminPaths.has(pathname)) return "admin";
    if (pathname === "/" || pathname === "/landing") return "landing";
    return "proxy";
}

function startMetricsServer(): AppServer | undefined {
    if (!config.prometheus.enabled) return undefined;
    const server = http.createServer(async (req, res) => {
        if (req.url !== config.prometheus.path) return plain(res, 404, "Not Found");
        try {
            const metrics = config.cluster ? await aggregatorRegistry.clusterMetrics() : await metricsRegister.metrics();
            res.writeHead(200, { "Content-Type": metricsRegister.contentType, "Cache-Control": "no-store" });
            res.end(metrics);
        }
        catch (error) { logger.error("Unable to render metrics", { error: error instanceof Error ? error.message : "unknown" }); plain(res, 500, "Internal Server Error"); }
    });
    server.listen(config.prometheus.port, config.prometheus.host, () => logger.info("Metrics server listening", { host: config.prometheus.host, port: config.prometheus.port }));
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
