import dns from "node:dns/promises";
import { logger } from "./logger.js";

export type DnsVerificationResult =
    | { success: true; records: string[] }
    | { success: false; error: string; found?: string[] };

export const dnsManager = {
    async verifyCNAME(hostname: string, targetHost: string): Promise<DnsVerificationResult> {
        try {
            const records = await dns.resolveCname(hostname);
            const isPointed = records.some((record) => record.toLowerCase() === targetHost.toLowerCase());
            if (isPointed) {
                logger.info("DNS Verification SUCCESS", { hostname, targetHost });
                return { success: true, records };
            }
            logger.warn("DNS Verification FAILED: CNAME mismatch", { hostname, found: records, expected: targetHost });
            return { success: false, error: "CNAME points to elsewhere", found: records };
        } catch (error) {
            const message = error instanceof Error ? error.message : "unknown error";
            const code = error instanceof Error && "code" in error ? String(error.code) : "";
            logger.error("DNS Verification ERROR", { hostname, error: message });
            return { success: false, error: code === "ENOTFOUND" ? "Domain not found" : message };
        }
    },

    async getIPs(hostname: string): Promise<string[]> {
        try { return await dns.resolve(hostname); } catch { return []; }
    },
};
