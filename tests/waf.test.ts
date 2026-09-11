import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IncomingMessage } from "node:http";
import { checkWAF } from "../src/waf.js";

function request(url: string, ip = "203.0.113.10"): IncomingMessage {
    return { url, headers: {}, socket: { remoteAddress: ip } } as IncomingMessage;
}

describe("WAF", () => {
    it("allows normal traffic", () => {
        assert.deepEqual(checkWAF(request("/assets/app.js"), {}), { blocked: false });
    });

    it("blocks SQL injection patterns", () => {
        assert.equal(checkWAF(request("/product?id=1' OR 1=1--"), {}).blocked, true);
    });

    it("blocks XSS patterns", () => {
        assert.equal(checkWAF(request("/search?q=<script>alert(1)</script>"), {}).blocked, true);
        assert.equal(checkWAF(request("/search?q=%3Cscript%3Ealert(1)%3C/script%3E"), {}).blocked, true);
    });

    it("blocks path traversal", () => {
        assert.equal(checkWAF(request("/files/../../etc/passwd"), {}).blocked, true);
    });

    it("honors domain-specific blocked IPs", () => {
        const result = checkWAF(request("/"), { blockedIPs: ["203.0.113.10"] });
        assert.equal(result.blocked, true);
    });

    it("ignores invalid custom regex rules", () => {
        const result = checkWAF(request("/safe"), { wafRules: [{ pattern: "(", name: "broken" }] });
        assert.equal(result.blocked, false);
    });
});
