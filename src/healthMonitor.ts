import http from "node:http";
import https from "node:https";
import { domainManager } from "./domainManager.js";
import { logger } from "./logger.js";
import { config } from "./config.js";
import type { DomainConfig } from "./domainManager.js";

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startHealthMonitor(): void {
    if (intervalId) return;
    logger.info("Health Monitor started");
    if (!config.healthCheck.enabled) return;
    intervalId = setInterval(() => void checkAllOrigins(), config.healthCheck.interval);
    intervalId.unref?.();
    void checkAllOrigins();
}

async function checkAllOrigins(): Promise<void> {
    const domains = domainManager.getAll();
    for (const [hostname, domainConfig] of Object.entries(domains)) {
        if (!domainConfig.active) continue;
        const origins = Array.isArray(domainConfig.origin) ? domainConfig.origin : [domainConfig.origin];
        const healthStatus: NonNullable<DomainConfig["health"]> = [];
        for (const originUrl of origins) {
            try {
                const isHealthy = await pingOrigin(originUrl);
                healthStatus.push({ origin: originUrl, healthy: isHealthy, lastChecked: new Date().toISOString() });
            } catch (error) {
                healthStatus.push({
                    origin: originUrl,
                    healthy: false,
                    lastChecked: new Date().toISOString(),
                    error: error instanceof Error ? error.message : "unknown error",
                });
            }
        }
        domainManager.updateHealthStatus(hostname, healthStatus);
    }
}

function pingOrigin(urlStr: string): Promise<boolean> {
    return new Promise((resolve) => {
        try {
            const url = new URL(urlStr);
            const transport = url.protocol === "https:" ? https : http;
            const req = transport.get(urlStr, { timeout: config.healthCheck.timeout }, (res) => {
                res.resume();
                resolve((res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 400);
            });
            req.on("error", () => resolve(false));
            req.on("timeout", () => { req.destroy(); resolve(false); });
        } catch {
            resolve(false);
        }
    });
}
