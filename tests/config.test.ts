import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectProductionConfigurationProblems } from "../src/config.js";

describe("production configuration guard", () => {
    it("returns no problems outside production", () => {
        assert.deepEqual(collectProductionConfigurationProblems({
            isProduction: false,
        } as never), []);
    });

    it("collects missing production requirements", () => {
        const problems = collectProductionConfigurationProblems({
            isProduction: true,
            security: { sessionSecret: "short", adminEmailAllowlist: [], cookieSecure: false },
            redis: { enabled: false },
            cluster: true,
            smtp: {},
            google: {},
            https: { enabled: true },
        } as never);
        assert.ok(problems.some((problem) => problem.includes("SESSION_SECRET")));
        assert.ok(problems.some((problem) => problem.includes("ADMIN_EMAIL_ALLOWLIST")));
        assert.ok(problems.some((problem) => problem.includes("REDIS_ENABLED")));
    });
});
