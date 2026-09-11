import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import type { IncomingMessage } from "node:http";
import { clientIp, hostnameFromRequest, isSafeHostname, readJsonBody, removeHopByHopHeaders, sendJson } from "../src/http.js";

function mockRequest(overrides: Partial<IncomingMessage> & { headers?: Record<string, string | string[] | undefined> } = {}): IncomingMessage {
    return {
        method: "GET",
        url: "/",
        headers: {},
        socket: { remoteAddress: "203.0.113.10" },
        ...overrides,
    } as IncomingMessage;
}

describe("http utilities", () => {
    it("extracts hostname from Host header", () => {
        assert.equal(hostnameFromRequest(mockRequest({ headers: { host: "Example.COM:443" } })), "example.com");
        assert.equal(hostnameFromRequest(mockRequest({ headers: { host: "[2001:db8::1]:8080" } })), "2001:db8::1");
    });

    it("validates hostnames", () => {
        assert.equal(isSafeHostname("cdn.example.com"), true);
        assert.equal(isSafeHostname("not a hostname"), false);
    });

    it("removes hop-by-hop headers", () => {
        const cleaned = removeHopByHopHeaders({
            host: "example.com",
            connection: "close, x-custom",
            "x-custom": "1",
            "content-type": "text/plain",
        });
        assert.equal(cleaned.host, "example.com");
        assert.equal(cleaned.connection, undefined);
        assert.equal(cleaned["x-custom"], undefined);
        assert.equal(cleaned["content-type"], "text/plain");
    });

    it("reads JSON bodies with size limits", async () => {
        const payload = Buffer.from(JSON.stringify({ ok: true }));
        const req = Readable.from([payload]) as IncomingMessage;
        req.method = "POST";
        const parsed = await readJsonBody(req, 1024);
        assert.deepEqual(parsed, { ok: true });
    });

    it("rejects oversized JSON bodies", async () => {
        const req = Readable.from([Buffer.alloc(2048, "a")]) as IncomingMessage;
        await assert.rejects(() => readJsonBody(req, 512), /too large/);
    });

    it("writes JSON responses", () => {
        const chunks: Buffer[] = [];
        const res = {
            statusCode: 0,
            writeHead(code: number, headers: Record<string, unknown>) {
                this.statusCode = code;
                this.headers = headers;
            },
            end(body: string) { chunks.push(Buffer.from(body)); },
            headers: {} as Record<string, unknown>,
        };
        sendJson(res as never, 201, { created: true });
        assert.equal(res.statusCode, 201);
        assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), { created: true });
    });

    it("uses socket address when proxy trust is disabled", () => {
        assert.equal(clientIp(mockRequest()), "203.0.113.10");
    });
});
