import path from "node:path";

function booleanEnv(name: string, defaultValue = false): boolean {
    const value = process.env[name];
    if (value === undefined) return defaultValue;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`${name} must be either true or false`);
}

function integerEnv(name: string, defaultValue: number, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
    const raw = process.env[name];
    if (raw === undefined || raw === "") return defaultValue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
    }
    return value;
}

function listEnv(name: string): string[] {
    return (process.env[name] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

const isProduction = process.env.NODE_ENV === "production";

export const config = {
    environment: process.env.NODE_ENV ?? "development",
    isProduction,
    port: integerEnv("PORT", 5000, 1, 65535),
    trustProxy: booleanEnv("TRUST_PROXY", false),

    https: {
        enabled: booleanEnv("HTTPS_ENABLED", false),
        port: integerEnv("HTTPS_PORT", 443, 1, 65535),
        redirectHTTP: booleanEnv("HTTPS_REDIRECT", false),
    },
    http2: {
        enabled: booleanEnv("ENABLE_HTTP2", false),
        pushEnabled: false,
        maxConcurrentStreams: integerEnv("HTTP2_MAX_CONCURRENT_STREAMS", 100, 1, 10_000),
    },

    cacheDir: path.resolve(process.env.CACHE_DIR ?? "./cache-data"),
    defaultTTL: integerEnv("DEFAULT_TTL", 3600, 0, 31_536_000),
    cacheMaxSizeMB: integerEnv("CACHE_MAX_SIZE_MB", 10_240, 1),
    compression: booleanEnv("COMPRESSION_ENABLED", true),
    originTimeoutMs: integerEnv("ORIGIN_TIMEOUT_MS", 10_000, 100, 120_000),
    maxRequestBodyBytes: integerEnv("MAX_REQUEST_BODY_BYTES", 1_048_576, 1_024, 104_857_600),
    maxOriginResponseBytes: integerEnv("MAX_ORIGIN_RESPONSE_BYTES", 52_428_800, 1_024, 1_073_741_824),

    cluster: booleanEnv("CLUSTER_ENABLED", !isProduction ? false : true),
    maxWorkers: integerEnv("MAX_WORKERS", 4, 1, 256),

    rateLimit: {
        windowMs: integerEnv("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000, 1_000, 86_400_000),
        max: integerEnv("RATE_LIMIT_MAX", 100, 1, 10_000_000),
        redisPrefix: process.env.RATE_LIMIT_REDIS_PREFIX ?? "continuum:ratelimit:",
    },

    redis: {
        enabled: booleanEnv("REDIS_ENABLED", false),
        host: process.env.REDIS_HOST ?? "localhost",
        port: integerEnv("REDIS_PORT", 6379, 1, 65535),
        password: process.env.REDIS_PASSWORD || undefined,
        tls: booleanEnv("REDIS_TLS", false) ? {} : undefined,
        db: integerEnv("REDIS_DB", 0, 0, 15),
    },

    analyticsEnabled: booleanEnv("ANALYTICS_ENABLED", true),
    prometheus: {
        enabled: booleanEnv("PROMETHEUS_ENABLED", false),
        port: integerEnv("PROMETHEUS_PORT", 9090, 1, 65535),
        path: "/metrics",
    },
    healthCheck: {
        enabled: booleanEnv("HEALTH_CHECK_ENABLED", true),
        interval: integerEnv("HEALTH_CHECK_INTERVAL", 30_000, 1_000, 86_400_000),
        timeout: integerEnv("HEALTH_CHECK_TIMEOUT", 5_000, 100, 120_000),
    },

    optimization: {
        autoWebp: booleanEnv("AUTO_WEBP", true),
        autoAvif: booleanEnv("AUTO_AVIF", true),
        minify: booleanEnv("MINIFY_ENABLED", true),
        maxImageSize: integerEnv("MAX_IMAGE_SIZE_MB", 50, 1, 1_024),
    },

    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI ?? `http://localhost:${process.env.PORT ?? 5000}/auth/google/callback`,
    },
    smtp: {
        host: process.env.SMTP_HOST,
        port: integerEnv("SMTP_PORT", 587, 1, 65535),
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.SMTP_FROM ?? "noreply@continuum-cdn.com",
    },
    acme: {
        directory: process.env.ACME_DIRECTORY === "production" ? "production" : "staging",
        email: process.env.ACME_EMAIL,
        renewDays: integerEnv("ACME_RENEW_DAYS", 30, 1, 365),
    },
    security: {
        adminWhitelist: listEnv("ADMIN_WHITELIST_IPS"),
        adminEmailAllowlist: listEnv("ADMIN_EMAIL_ALLOWLIST").map((email) => email.toLowerCase()),
        sessionSecret: process.env.SESSION_SECRET,
        cookieSecure: booleanEnv("COOKIE_SECURE", isProduction),
        requireSignedRequests: booleanEnv("REQUIRE_SIGNED_REQUESTS", false),
        edgeScriptsEnabled: booleanEnv("EDGE_SCRIPTS_ENABLED", false),
    },
    logging: {
        level: process.env.LOG_LEVEL ?? "info",
        format: process.env.LOG_FORMAT ?? "text",
        sentry: { enabled: Boolean(process.env.SENTRY_DSN), dsn: process.env.SENTRY_DSN },
    },
    websocket: {
        enabled: booleanEnv("WEBSOCKET_ENABLED", false),
        path: "/ws",
        maxConnections: integerEnv("WS_MAX_CONNECTIONS", 1_000, 1, 100_000),
    },
};

export function collectProductionConfigurationProblems(source: typeof config = config): string[] {
    if (!source.isProduction) return [];
    const problems: string[] = [];
    if (!source.security.sessionSecret || source.security.sessionSecret.length < 32) problems.push("SESSION_SECRET must be at least 32 characters");
    if (source.security.adminEmailAllowlist.length === 0) problems.push("ADMIN_EMAIL_ALLOWLIST must contain at least one administrator");
    if (!source.redis.enabled && source.cluster) problems.push("REDIS_ENABLED=true is required when CLUSTER_ENABLED=true");
    if (!source.smtp.host && !source.google.clientId) problems.push("configure SMTP or Google OAuth for administrator authentication");
    if (source.https.enabled && !source.security.cookieSecure) problems.push("COOKIE_SECURE must be true when HTTPS_ENABLED=true");
    return problems;
}

export function assertProductionConfiguration(): void {
    const problems = collectProductionConfigurationProblems();
    if (problems.length > 0) throw new Error(`Invalid production configuration: ${problems.join("; ")}`);
}
