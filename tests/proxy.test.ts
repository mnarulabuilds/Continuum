import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuum-cache-"));
process.env.CACHE_DIR = cacheDir;
process.env.REDIS_ENABLED = "false";
process.env.RATE_LIMIT_MAX = "1000";

const { handleRequest } = await import("../src/proxy.js");
const { domainManager } = await import("../src/domainManager.js");

type ProxyResponse = { status: number; body: string; cache: string | null };

function request(port: number, pathname: string, host: string): Promise<ProxyResponse> {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: "127.0.0.1",
            port,
            path: pathname,
            method: "GET",
            headers: { Host: host },
        }, (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
                const cacheHeader = res.headers["x-cache"];
                resolve({
                    status: res.statusCode ?? 0,
                    body: Buffer.concat(chunks).toString(),
                    cache: typeof cacheHeader === "string" ? cacheHeader : null,
                });
            });
        });
        req.on("error", reject);
        req.end();
    });
}

describe("proxy", () => {
    let originServer: http.Server;
    let proxyServer: http.Server;
    let proxyPort = 0;
    const hostname = `proxy-${Date.now()}.example.com`;

    before(async () => {
        originServer = http.createServer((_req, res) => {
            res.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "public, max-age=60" });
            res.end("origin-response");
        });
        await new Promise<void>((resolve) => originServer.listen(0, "127.0.0.1", resolve));
        const originAddress = originServer.address();
        if (!originAddress || typeof originAddress === "string") throw new Error("origin bind failed");

        await domainManager.addDomain(hostname, `http://127.0.0.1:${originAddress.port}`);

        proxyServer = http.createServer((req, res) => void handleRequest(req, res));
        await new Promise<void>((resolve) => proxyServer.listen(0, "127.0.0.1", resolve));
        const proxyAddress = proxyServer.address();
        if (!proxyAddress || typeof proxyAddress === "string") throw new Error("proxy bind failed");
        proxyPort = proxyAddress.port;
    });

    after(async () => {
        await domainManager.removeDomain(hostname);
        await new Promise<void>((resolve, reject) => proxyServer.close((error) => error ? reject(error) : resolve()));
        await new Promise<void>((resolve, reject) => originServer.close((error) => error ? reject(error) : resolve()));
        fs.rmSync(cacheDir, { recursive: true, force: true });
        delete process.env.CACHE_DIR;
        delete process.env.REDIS_ENABLED;
        delete process.env.RATE_LIMIT_MAX;
    });

    it("returns 404 for unknown domains", async () => {
        const response = await request(proxyPort, "/missing", "unknown.com");
        assert.equal(response.status, 404);
        assert.match(response.body, /Domain Not Configured/);
    });

    it("proxies configured domains", async () => {
        const response = await request(proxyPort, "/hello", hostname);
        assert.equal(response.status, 200);
        assert.equal(response.body, "origin-response");
        assert.equal(response.cache, "MISS");
    });

    it("blocks SQL injection attempts", async () => {
        const response = await request(proxyPort, `/product?id=${encodeURIComponent("1' OR 1=1--")}`, hostname);
        assert.equal(response.status, 403);
    });

    it("blocks XSS attempts", async () => {
        const response = await request(proxyPort, "/search?q=%3Cscript%3Ealert(1)%3C/script%3E", hostname);
        assert.equal(response.status, 403);
    });

    it("serves cached responses on repeat GET requests", async () => {
        const first = await request(proxyPort, "/cached", hostname);
        const second = await request(proxyPort, "/cached", hostname);
        assert.equal(first.cache, "MISS");
        assert.equal(second.cache, "HIT");
        assert.equal(second.body, "origin-response");
    });
});
