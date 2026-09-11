import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getStats, logBandwidth, logRequest, resetStatsForTests } from "../src/analytics.js";

describe("analytics", () => {
    it("tracks request and bandwidth counters", () => {
        resetStatsForTests();
        logRequest("MISS", "example.com", "/index.html", "127.0.0.1");
        logBandwidth(1024, "example.com", "/index.html");
        const stats = getStats();
        assert.equal(stats.totalRequests, 1);
        assert.equal(stats.misses, 1);
        assert.equal(stats.bandwidth, 1024);
        assert.equal(stats.domains["example.com"]?.misses, 1);
    });
});
