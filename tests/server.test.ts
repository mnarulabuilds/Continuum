import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { createRequestHandler } from "../src/server.js";

describe("server routes", () => {
    let server: http.Server;
    let baseUrl: string;

    before(async () => {
        server = http.createServer(createRequestHandler());
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Unable to bind test server");
        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    after(async () => {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    });

    it("serves health checks", async () => {
        const response = await fetch(`${baseUrl}/healthz`);
        assert.equal(response.status, 200);
        assert.equal(await response.text(), "OK");
    });

    it("serves the landing page", async () => {
        const response = await fetch(`${baseUrl}/`);
        assert.equal(response.status, 200);
        assert.match(await response.text(), /Continuum CDN/);
    });
});
