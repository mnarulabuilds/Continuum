import prom from "prom-client";

export const register = new prom.Registry();
prom.collectDefaultMetrics({ register });

export const httpRequestDuration = new prom.Histogram({
    name: "continuum_http_request_duration_seconds",
    help: "Duration of HTTP requests in seconds",
    labelNames: ["method", "route", "status_code", "cache_status"],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
});

export const httpRequestTotal = new prom.Counter({
    name: "continuum_http_requests_total",
    help: "Total number of HTTP requests",
    labelNames: ["method", "route", "status_code", "cache_status"],
});

export const cacheHitRate = new prom.Gauge({
    name: "continuum_cache_hit_rate",
    help: "Cache hit rate percentage",
    labelNames: ["domain"],
});

export const bandwidthBytes = new prom.Counter({
    name: "continuum_bandwidth_bytes_total",
    help: "Total bandwidth served in bytes",
    labelNames: ["domain", "cache_status"],
});

export const activeConnections = new prom.Gauge({
    name: "continuum_active_connections",
    help: "Number of active connections",
});

export const wafBlockedRequests = new prom.Counter({
    name: "continuum_waf_blocked_requests_total",
    help: "Total number of requests blocked by WAF",
    labelNames: ["reason", "domain"],
});

export const rateLimitExceeded = new prom.Counter({
    name: "continuum_rate_limit_exceeded_total",
    help: "Total number of rate limit violations",
    labelNames: ["ip"],
});

export const originResponseTime = new prom.Histogram({
    name: "continuum_origin_response_time_seconds",
    help: "Response time from origin servers",
    labelNames: ["domain", "status_code"],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
});

export const cacheSize = new prom.Gauge({
    name: "continuum_cache_size_bytes",
    help: "Current cache size in bytes",
    labelNames: ["type"],
});

export const imageOptimizations = new prom.Counter({
    name: "continuum_image_optimizations_total",
    help: "Total number of image optimizations performed",
    labelNames: ["format", "domain"],
});

export const sslCertificates = new prom.Gauge({
    name: "continuum_ssl_certificates_total",
    help: "Number of active SSL certificates",
    labelNames: ["status"],
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);
register.registerMetric(cacheHitRate);
register.registerMetric(bandwidthBytes);
register.registerMetric(activeConnections);
register.registerMetric(wafBlockedRequests);
register.registerMetric(rateLimitExceeded);
register.registerMetric(originResponseTime);
register.registerMetric(cacheSize);
register.registerMetric(imageOptimizations);
register.registerMetric(sslCertificates);

export function updateCacheMetrics(domain: string, hits: number, total: number): void {
    cacheHitRate.set({ domain }, total > 0 ? (hits / total) * 100 : 0);
}
