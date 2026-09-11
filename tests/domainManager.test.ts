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
        const created = await domainManager.addDomain(hostname, "https://origin.example.com", { plan: "pro" });
        assert.equal(created.hostname, hostname);
        assert.equal(created.plan, "pro");
        assert.equal(await domainManager.getOrigin(hostname), "https://origin.example.com");
        assert.equal(await domainManager.removeDomain(hostname), true);
        assert.equal(await domainManager.getOrigin(hostname), null);
    });
});
