import fs from "node:fs";

const ANALYTICS_FILE = "./analytics.json";
const HISTORY_LIMIT = 60;

export type RequestType = "HIT" | "MISS" | "ERROR" | "BLOCKED";

export type DomainStats = {
    totalRequests: number;
    hits: number;
    misses: number;
    errors: number;
    blocked: number;
    bandwidth: number;
};

export type UrlStats = {
    total: number;
    hits: number;
    misses: number;
    errors: number;
    blocked: number;
    bandwidth: number;
    regions: Record<string, number>;
};

export type HistoryPoint = {
    timestamp: number;
    hits: number;
    misses: number;
    errors: number;
    blocked: number;
    bandwidth: number;
};

export type AnalyticsStats = {
    totalRequests: number;
    hits: number;
    misses: number;
    errors: number;
    blocked: number;
    bandwidth: number;
    lastUpdate: number;
    history: HistoryPoint[];
    domains: Record<string, DomainStats>;
    regions: Record<string, number>;
    urlStats: Record<string, UrlStats>;
};

function createEmptyStats(): AnalyticsStats {
    return {
        totalRequests: 0,
        hits: 0,
        misses: 0,
        errors: 0,
        blocked: 0,
        bandwidth: 0,
        lastUpdate: Date.now(),
        history: [],
        domains: {},
        regions: {},
        urlStats: {},
    };
}

let stats: AnalyticsStats = createEmptyStats();

function lookupGeo(ip: string): { country: string; region: string } {
    if (!ip || ip === "127.0.0.1" || ip === "::1") return { country: "US", region: "Local" };
    const firstPart = Number.parseInt(ip.split(".")[0] ?? "", 10);
    if (Number.isNaN(firstPart)) return { country: "GB", region: "Europe" };
    if (firstPart < 64) return { country: "US", region: "North America" };
    if (firstPart < 128) return { country: "DE", region: "Europe" };
    if (firstPart < 192) return { country: "IN", region: "Asia" };
    if (firstPart < 224) return { country: "SG", region: "Asia" };
    return { country: "BR", region: "South America" };
}

function loadStats(): AnalyticsStats {
    if (!fs.existsSync(ANALYTICS_FILE)) return createEmptyStats();
    try {
        const parsed = JSON.parse(fs.readFileSync(ANALYTICS_FILE, "utf8")) as Partial<AnalyticsStats>;
        return { ...createEmptyStats(), ...parsed, domains: parsed.domains ?? {}, history: parsed.history ?? [], regions: parsed.regions ?? {}, urlStats: parsed.urlStats ?? {} };
    } catch {
        return createEmptyStats();
    }
}

stats = loadStats();

function initDomainStats(hostname: string): void {
    stats.domains[hostname] ??= { totalRequests: 0, hits: 0, misses: 0, errors: 0, blocked: 0, bandwidth: 0 };
}

function initUrlStats(url: string): void {
    stats.urlStats[url] ??= { total: 0, hits: 0, misses: 0, errors: 0, blocked: 0, bandwidth: 0, regions: {} };
}

function incrementTypeCounters(target: { hits: number; misses: number; errors: number; blocked: number }, type: RequestType): void {
    if (type === "HIT") target.hits += 1;
    else if (type === "MISS") target.misses += 1;
    else if (type === "ERROR") target.errors += 1;
    else if (type === "BLOCKED") target.blocked += 1;
}

function updateHistory(type: RequestType | null, bytes = 0): void {
    const now = Math.floor(Date.now() / 60_000) * 60_000;
    let currentPoint = stats.history.find((point) => point.timestamp === now);
    if (!currentPoint) {
        currentPoint = { timestamp: now, hits: 0, misses: 0, errors: 0, blocked: 0, bandwidth: 0 };
        stats.history.push(currentPoint);
        if (stats.history.length > HISTORY_LIMIT) stats.history.shift();
    }
    if (type) incrementTypeCounters(currentPoint, type);
    currentPoint.bandwidth += bytes;
}

export function logRequest(type: RequestType, hostname = "unknown", url = "/", ip = "127.0.0.1"): void {
    stats.totalRequests += 1;
    const country = lookupGeo(ip).country;
    stats.regions[country] = (stats.regions[country] ?? 0) + 1;
    incrementTypeCounters(stats, type);
    initDomainStats(hostname);
    const domainEntry = stats.domains[hostname];
    if (!domainEntry) return;
    domainEntry.totalRequests += 1;
    incrementTypeCounters(domainEntry, type);
    initUrlStats(url);
    const urlEntry = stats.urlStats[url];
    if (!urlEntry) return;
    urlEntry.total += 1;
    incrementTypeCounters(urlEntry, type);
    urlEntry.regions[country] = (urlEntry.regions[country] ?? 0) + 1;
    updateHistory(type);
    saveStats();
}

export function logBandwidth(bytes: number, hostname = "unknown", url = "/", _ip = "127.0.0.1"): void {
    stats.bandwidth += bytes;
    initDomainStats(hostname);
    const domainEntry = stats.domains[hostname];
    if (domainEntry) domainEntry.bandwidth += bytes;
    initUrlStats(url);
    const urlEntry = stats.urlStats[url];
    if (urlEntry) urlEntry.bandwidth += bytes;
    updateHistory(null, bytes);
    saveStats();
}

export function saveStats(): void {
    stats.lastUpdate = Date.now();
    try { fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(stats, null, 2)); } catch { /* analytics persistence is best effort */ }
}

export function getStats(): Readonly<AnalyticsStats> {
    return stats;
}

export function resetStats(): void {
    stats = createEmptyStats();
    saveStats();
}

/** Resets in-memory stats — intended for tests only. */
export function resetStatsForTests(next: AnalyticsStats = createEmptyStats()): void {
    stats = next;
}
