import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { domainManager } from "../src/domainManager.js";

describe("domain manager", () => {
    it("rejects invalid hostnames", async () => {
        await assert.rejects(
            () => domainManager.addDomain("not a hostname", "https://origin.example.com"),
            /invalid hostname/,
        );
    });

    it("rejects origins with paths or credentials", async () => {
        await assert.rejects(
            () => domainManager.addDomain("cdn.example.com", "https://origin.example.com/private"),
            /origin must be an http\(s\) origin/,
        );
    });

    it("adds and removes domains", async () => {
        const hostname = `test-${Date.now()}.example.com`;
        const created = await domainManager.addDomain(hostname, "https://origin.example.com", {
            plan: "pro",
            cachePolicy: { defaultTtl: 120, maxTtl: 300 },
        });
        assert.equal(created.hostname, hostname);
        assert.equal(created.plan, "pro");
        assert.deepEqual(created.cachePolicy, { defaultTtl: 120, maxTtl: 300 });
        assert.equal(await domainManager.getOrigin(hostname), "https://origin.example.com");
        const updated = await domainManager.updateCachePolicy(hostname, { defaultTtl: 60, maxTtl: 180 });
        assert.deepEqual(updated?.cachePolicy, { defaultTtl: 60, maxTtl: 180 });
        await assert.rejects(
            () => domainManager.updateCachePolicy(hostname, { defaultTtl: 181, maxTtl: 180 }),
            /cannot exceed/,
        );
        assert.equal(await domainManager.removeDomain(hostname), true);
        assert.equal(await domainManager.getOrigin(hostname), null);
    });
});
