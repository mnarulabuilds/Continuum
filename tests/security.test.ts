import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";

process.env.SESSION_SECRET = "test-session-secret-with-32-characters-minimum";
process.env.ADMIN_WHITELIST_IPS = "203.0.113.0/24";

const { checkIPWhitelist, generateRequestSignature, handleCORS, verifyRequestSignature } = await import("../src/security.js");

function mockRequest(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
    return {
        method: "GET",
        url: "/admin/domains",
        headers: {},
        socket: { remoteAddress: "203.0.113.10" },
        ...overrides,
    } as IncomingMessage;
}

describe("security", () => {
    it("handles CORS preflight for allowed origins", () => {
        let status = 0;
        const res = {
            setHeader() { /* no-op */ },
            writeHead(code: number) { status = code; },
            end() { /* no-op */ },
        } as unknown as ServerResponse;
        const handled = handleCORS(
            mockRequest({ method: "OPTIONS", headers: { origin: "https://app.example.com" } }),
            res,
            { cors: { allowedOrigins: ["https://app.example.com"] } },
        );
        assert.equal(handled, true);
        assert.equal(status, 204);
    });

    it("rejects disallowed CORS origins", () => {
        let status = 0;
        const res = {
            setHeader() { /* no-op */ },
            writeHead(code: number) { status = code; },
            end() { /* no-op */ },
        } as unknown as ServerResponse;
        handleCORS(
            mockRequest({ method: "OPTIONS", headers: { origin: "https://evil.example.com" } }),
            res,
            { cors: { allowedOrigins: ["https://app.example.com"] } },
        );
        assert.equal(status, 403);
    });

    it("verifies signed admin requests", () => {
        const headers = generateRequestSignature("GET", "/admin/domains");
        const req = mockRequest({
            headers: {
                "x-continuum-signature": headers["X-Continuum-Signature"],
                "x-continuum-timestamp": headers["X-Continuum-Timestamp"],
            },
        });
        assert.equal(verifyRequestSignature(req), true);
    });

    it("matches IPv4 CIDR entries in the admin whitelist", () => {
        assert.equal(checkIPWhitelist(mockRequest()), true);
        assert.equal(checkIPWhitelist(mockRequest({ socket: { remoteAddress: "198.51.100.1" } } as IncomingMessage)), false);
    });
});
