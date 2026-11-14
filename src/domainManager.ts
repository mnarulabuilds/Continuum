import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import { config } from "./config.js";
import { isSafeHostname } from "./http.js";
import { logger } from "./logger.js";
import { createRedisClient, type RedisClient } from "./redisClient.js";

export type Origin = string | string[];
export type CachePolicy = { defaultTtl: number; maxTtl: number };
export type DomainConfig = {
    hostname: string;
    origin: Origin;
    cachePolicy: CachePolicy;
    plan: "free" | "pro" | "enterprise";
    active: boolean;
    wafRules: Array<{ name?: string; pattern: string; active?: boolean }>;
    edgeRules: Array<{ id?: string; script: string }>;
    blockedIPs: string[];
    health: Array<{ origin: string; healthy: boolean; lastChecked: string; error?: string }> | undefined;
    cors: { allowedOrigins?: string[]; allowedMethods?: string; allowedHeaders?: string; maxAge?: string; allowCredentials?: boolean } | undefined;
    createdAt: string;
};

const DOMAINS_FILE = path.resolve("./src/domains.json");
const REDIS_KEY = "Continuum:domains";
let redis: RedisClient | null = null;
let redisConnected = false;
let domains: Record<string, DomainConfig> = loadDomains();
let lastSync = 0;
const syncIntervalMs = 5_000;

if (config.redis.enabled) {
    redis = createRedisClient();
    redis.on("ready", () => { redisConnected = true; });
    redis.on("close", () => { redisConnected = false; });
    redis.on("error", (error: Error) => { redisConnected = false; logger.warn("Domain state store error", { error: error.message }); });
    redis.connect().catch((error: Error) => logger.warn("Domain state store unavailable", { error: error.message }));
}

function loadDomains(): Record<string, DomainConfig> {
    try {
        if (!fs.existsSync(DOMAINS_FILE)) return {};
        const parsed: unknown = JSON.parse(fs.readFileSync(DOMAINS_FILE, "utf8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("domain configuration must be an object");
        const result: Record<string, DomainConfig> = {};
        for (const [hostname, entry] of Object.entries(parsed)) {
            try { result[normalizeHostname(hostname)] = normalizeDomainConfig(hostname, entry); }
            catch (error) { logger.warn("Ignoring invalid configured domain", { hostname, error: error instanceof Error ? error.message : "invalid config" }); }
        }
        return result;
    } catch (error) {
        logger.error("Failed to load domain configuration", { error: error instanceof Error ? error.message : "unknown error" });
        return {};
    }
}

function normalizeHostname(hostname: string): string {
    const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
    if (!isSafeHostname(normalized)) throw new Error("invalid hostname");
    return normalized;
}

function validateOrigin(value: unknown): string {
    if (typeof value !== "string") throw new Error("origin must be a URL");
    const origin = new URL(value);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
        throw new Error("origin must be an http(s) origin without credentials or a path");
    }
    return origin.origin;
}

function normalizeCachePolicy(value: unknown): CachePolicy {
    if (value === undefined) return { defaultTtl: config.defaultTTL, maxTtl: config.defaultTTL };
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("cachePolicy must be an object");
    const raw = value as { defaultTtl?: unknown; maxTtl?: unknown };
    const defaultTtl = raw.defaultTtl ?? config.defaultTTL;
    const maxTtl = raw.maxTtl ?? config.defaultTTL;
    if (typeof defaultTtl !== "number" || !Number.isInteger(defaultTtl) || defaultTtl < 0 || defaultTtl > 31_536_000) {
        throw new Error("cachePolicy.defaultTtl must be an integer between 0 and 31536000");
    }
    if (typeof maxTtl !== "number" || !Number.isInteger(maxTtl) || maxTtl < 0 || maxTtl > 31_536_000) {
        throw new Error("cachePolicy.maxTtl must be an integer between 0 and 31536000");
    }
    if (defaultTtl > maxTtl) throw new Error("cachePolicy.defaultTtl cannot exceed cachePolicy.maxTtl");
    return { defaultTtl, maxTtl };
}

function normalizeDomainConfig(hostname: string, value: unknown): DomainConfig {
    if (typeof value === "string") {
        return { hostname: normalizeHostname(hostname), origin: validateOrigin(value), cachePolicy: normalizeCachePolicy(undefined), plan: "free", active: true, wafRules: [], edgeRules: [], blockedIPs: [], health: undefined, cors: undefined, createdAt: new Date(0).toISOString() };
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid domain config");
    const raw = value as Partial<DomainConfig>;
    const origins = Array.isArray(raw.origin) ? raw.origin.map(validateOrigin) : validateOrigin(raw.origin);
    const cachePolicy = normalizeCachePolicy(raw.cachePolicy);
    const plan = raw.plan === "pro" || raw.plan === "enterprise" ? raw.plan : "free";
    return {
        hostname: normalizeHostname(hostname), origin: origins, cachePolicy, plan, active: raw.active !== false,
        wafRules: Array.isArray(raw.wafRules) ? raw.wafRules.filter(isWafRule) : [],
        edgeRules: Array.isArray(raw.edgeRules) ? raw.edgeRules.filter(isEdgeRule) : [],
        blockedIPs: Array.isArray(raw.blockedIPs) ? raw.blockedIPs.filter((ip): ip is string => typeof ip === "string") : [],
        health: Array.isArray(raw.health) ? raw.health : undefined,
        cors: raw.cors,
        createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    };
}

function isWafRule(value: unknown): value is { name?: string; pattern: string; active?: boolean } {
    return Boolean(value && typeof value === "object" && typeof (value as { pattern?: unknown }).pattern === "string" && (value as { pattern: string }).pattern.length <= 512);
}
function isEdgeRule(value: unknown): value is { id?: string; script: string } {
    return Boolean(value && typeof value === "object" && typeof (value as { script?: unknown }).script === "string" && (value as { script: string }).script.length <= 10_000);
}

function persistDomains(): void {
    const temporaryPath = `${DOMAINS_FILE}.${process.pid}.${Date.now()}.tmp`;
    const persistedDomains = Object.fromEntries(Object.entries(domains).map(([hostname, domain]) => {
        const { cachePolicy, ...legacyFields } = domain;
        const isDefaultPolicy = cachePolicy.defaultTtl === config.defaultTTL && cachePolicy.maxTtl === config.defaultTTL;
        return [hostname, isDefaultPolicy ? legacyFields : domain];
    }));
    fs.writeFileSync(temporaryPath, JSON.stringify(persistedDomains, null, 2), { mode: 0o600 });
    fs.renameSync(temporaryPath, DOMAINS_FILE);
}

async function syncFromRedis(): Promise<void> {
    if (!redis || !redisConnected) return;
    const data = await redis.hgetall(REDIS_KEY);
    const next: Record<string, DomainConfig> = {};
    for (const [hostname, value] of Object.entries(data)) {
        try { next[normalizeHostname(hostname)] = normalizeDomainConfig(hostname, JSON.parse(String(value))); }
        catch (error) { logger.warn("Ignoring invalid distributed domain", { hostname, error: error instanceof Error ? error.message : "invalid config" }); }
    }
    domains = next;
}

export const domainManager = {
    async getOrigin(hostname: string): Promise<string | null> {
        if (redis && Date.now() - lastSync > syncIntervalMs) {
            lastSync = Date.now();
            await syncFromRedis().catch((error: Error) => logger.warn("Domain sync failed", { error: error.message }));
        }
        const entry = domains[hostname.toLowerCase()];
        if (!entry || !entry.active) return null;
        if (!Array.isArray(entry.origin)) return entry.origin;
        const healthy = entry.origin.find((origin, index) => entry.health?.[index]?.healthy);
        return healthy ?? entry.origin[0] ?? null;
    },
    getConfig(hostname: string): DomainConfig | null { return domains[hostname.toLowerCase()] ?? null; },
    updateHealthStatus(hostname: string, status: DomainConfig["health"]): void {
        const domain = domains[hostname.toLowerCase()];
        if (domain) domain.health = status;
    },
    async addDomain(hostname: string, origin: unknown, options: Omit<Partial<DomainConfig>, "cachePolicy"> & { cachePolicy?: unknown } = {}): Promise<DomainConfig> {
        const normalizedHostname = normalizeHostname(hostname);
        const next = normalizeDomainConfig(normalizedHostname, { ...options, origin, hostname: normalizedHostname, createdAt: new Date().toISOString() });
        domains[normalizedHostname] = next;
        persistDomains();
        if (redis && redisConnected) {
            await redis.hset(REDIS_KEY, normalizedHostname, JSON.stringify(next));
            await redis.publish("Continuum:config_update", JSON.stringify({ hostname: normalizedHostname }));
        }
        return next;
    },
    async updateCachePolicy(hostname: string, policy: unknown): Promise<DomainConfig | null> {
        const normalizedHostname = normalizeHostname(hostname);
        const existing = domains[normalizedHostname];
        if (!existing) return null;
        const next = normalizeDomainConfig(normalizedHostname, { ...existing, cachePolicy: policy });
        domains[normalizedHostname] = next;
        persistDomains();
        if (redis && redisConnected) {
            await redis.hset(REDIS_KEY, normalizedHostname, JSON.stringify(next));
            await redis.publish("Continuum:config_update", JSON.stringify({ hostname: normalizedHostname }));
        }
        return next;
    },
    async removeDomain(hostname: string): Promise<boolean> {
        const normalizedHostname = normalizeHostname(hostname);
        if (!domains[normalizedHostname]) return false;
        delete domains[normalizedHostname];
        persistDomains();
        if (redis && redisConnected) {
            await redis.hdel(REDIS_KEY, normalizedHostname);
            await redis.publish("Continuum:config_update", JSON.stringify({ hostname: normalizedHostname }));
        }
        return true;
    },
    async loadFromRedis(): Promise<void> { await syncFromRedis(); },
    getAll(): Readonly<Record<string, DomainConfig>> { return { ...domains }; },
};
