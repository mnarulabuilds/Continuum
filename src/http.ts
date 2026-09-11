import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";
import { config } from "./config.js";

const HOP_BY_HOP_HEADERS = new Set([
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te",
    "trailer", "transfer-encoding", "upgrade",
]);

export function hostnameFromRequest(req: IncomingMessage): string {
    const host = req.headers.host?.trim().toLowerCase();
    if (!host) return "";
    if (host.startsWith("[")) return host.slice(1, host.indexOf("]"));
    return host.split(":", 1)[0] ?? "";
}

export function clientIp(req: IncomingMessage): string {
    if (config.trustProxy) {
        const forwarded = req.headers["x-forwarded-for"];
        const candidate = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
        if (candidate && isIP(candidate)) return candidate;
    }
    return req.socket.remoteAddress ?? "";
}

export function isSafeHostname(hostname: string): boolean {
    return hostname.length <= 253
        && /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i.test(hostname);
}

export function removeHopByHopHeaders(headers: IncomingHttpHeaders | Record<string, string | string[] | number | undefined>): Record<string, string | string[]> {
    const result: Record<string, string | string[]> = {};
    const connectionValues = headers.connection?.toString().split(",").map((value) => value.trim().toLowerCase()) ?? [];
    for (const [name, value] of Object.entries(headers)) {
        if (value === undefined || HOP_BY_HOP_HEADERS.has(name.toLowerCase()) || connectionValues.includes(name.toLowerCase())) continue;
        if (typeof value === "number") result[name] = String(value);
        else result[name] = value;
    }
    return result;
}

export function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(payload),
        "Cache-Control": "no-store",
    });
    res.end(payload);
}

export async function readJsonBody(req: IncomingMessage, maxBytes = config.maxRequestBodyBytes): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let completed = false;
        const fail = (error: Error) => {
            if (completed) return;
            completed = true;
            req.resume();
            reject(error);
        };
        req.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) return fail(new Error("Request body is too large"));
            chunks.push(chunk);
        });
        req.on("error", fail);
        req.on("end", () => {
            if (completed) return;
            completed = true;
            try {
                const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON object expected");
                resolve(parsed as Record<string, unknown>);
            } catch {
                reject(new Error("Invalid JSON request body"));
            }
        });
    });
}
