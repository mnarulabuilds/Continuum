import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const analyticsDir = fs.mkdtempSync(path.join(os.tmpdir(), "continuum-analytics-"));
process.env.ANALYTICS_FILE = path.join(analyticsDir, "analytics.json");
const { getStats, logBandwidth, logRequest, resetStatsForTests } = await import("../src/analytics.js");

after(() => {
    fs.rmSync(analyticsDir, { recursive: true, force: true });
    delete process.env.ANALYTICS_FILE;
});

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
