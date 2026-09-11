import { config } from "./config.js";

type LogLevel = "debug" | "info" | "warn" | "error" | "http";
type LogMetadata = Record<string, unknown>;

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    http: 1,
};

const configuredLevel = config.logging.level as LogLevel;
const currentLevel = LOG_LEVELS[configuredLevel] ?? LOG_LEVELS.info;
const useJSON = config.logging.format === "json";

function formatMessage(level: LogLevel, message: string, metadata: LogMetadata = {}): string {
    const timestamp = new Date().toISOString();
    if (useJSON) {
        return JSON.stringify({ timestamp, level, message, ...metadata, pid: process.pid });
    }
    const metaStr = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] [PID:${process.pid}] ${message}${metaStr}`;
}

function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= currentLevel;
}

export const logger = {
    debug(message: string, metadata?: LogMetadata): void {
        if (!shouldLog("debug")) return;
        console.log(formatMessage("debug", message, metadata));
    },
    info(message: string, metadata?: LogMetadata): void {
        if (!shouldLog("info")) return;
        console.log(formatMessage("info", message, metadata));
    },
    warn(message: string, metadata?: LogMetadata): void {
        if (!shouldLog("warn")) return;
        console.warn(formatMessage("warn", message, metadata));
    },
    error(message: string, metadata?: LogMetadata): void {
        if (!shouldLog("error")) return;
        console.error(formatMessage("error", message, metadata));
    },
    http(req: { method?: string; url?: string; socket: { remoteAddress?: string | null } }, res: { statusCode: number }, duration: number, meta: LogMetadata = {}): void {
        if (!shouldLog("info")) return;
        console.log(formatMessage("http", "HTTP Request", {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.socket.remoteAddress,
            ...meta,
        }));
    },
};
