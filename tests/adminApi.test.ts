import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import { after, before, describe, it } from "node:test";
import { handleAdminApiRequest } from "../src/adminApi.js";
import { domainManager } from "../src/domainManager.js";

type MockResponse = {
    statusCode: number;
    body: string;
};

function requestWithJson(method: string, value: unknown): IncomingMessage {
    const request = new PassThrough() as IncomingMessage;
    request.method = method;
    request.headers = {};
    request.end(JSON.stringify(value));
    return request;
}

function mockResponse(): { response: ServerResponse; result: MockResponse } {
    const result: MockResponse = { statusCode: 0, body: "" };
    const response = {
        writeHead(statusCode: number) { result.statusCode = statusCode; },
        end(body?: string) { result.body = body ?? ""; },
    } as unknown as ServerResponse;
    return { response, result };
}

describe("admin API", () => {
    const hostname = `admin-api-${Date.now()}.example.com`;

    before(async () => {
        await domainManager.addDomain(hostname, "https://origin.example.com");
    });

    after(async () => {
        await domainManager.removeDomain(hostname);
    });

    it("validates cache policies on update", async () => {
        const { response, result } = mockResponse();
        const handled = await handleAdminApiRequest(
            requestWithJson("PUT", { hostname, cachePolicy: { defaultTtl: 301, maxTtl: 300 } }),
            response,
            "/admin/domains",
        );

        assert.equal(handled, true);
        assert.equal(result.statusCode, 400);
        assert.match(result.body, /cannot exceed/);
        assert.deepEqual(domainManager.getConfig(hostname)?.cachePolicy, { defaultTtl: 3600, maxTtl: 3600 });
    });

    it("updates a domain cache policy through the admin API", async () => {
        const { response, result } = mockResponse();
        const handled = await handleAdminApiRequest(
            requestWithJson("PUT", { hostname, cachePolicy: { defaultTtl: 60, maxTtl: 180 } }),
            response,
            "/admin/domains",
        );

        assert.equal(handled, true);
        assert.equal(result.statusCode, 200);
        assert.deepEqual(domainManager.getConfig(hostname)?.cachePolicy, { defaultTtl: 60, maxTtl: 180 });
    });
});
