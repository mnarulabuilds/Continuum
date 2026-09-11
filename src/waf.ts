import type { IncomingMessage } from "node:http";
import { clientIp } from "./http.js";
import type { DomainConfig } from "./domainManager.js";

export const wafRules = {
    sqlInjection: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION)\b)|(')|(--)|(;\s*(?:SELECT|INSERT|UPDATE|DELETE))/i,
    xss: /(<script\b|javascript\s*:|on\w+\s*=)/i,
    pathTraversal: /(?:\.\.[\\/]|%2e%2e(?:%2f|%5c))/i,
    git: /(?:^|\/)\.git(?:\/|$)/i,
};

const threatIps = new Set<string>();

function normalizedRequestTarget(requestTarget: string): string {
    try {
        return decodeURIComponent(requestTarget);
    } catch {
        return requestTarget;
    }
}

export function checkWAF(req: IncomingMessage, domainConfig: Pick<DomainConfig, "wafRules" | "blockedIPs"> | Record<string, never> = {}): { blocked: boolean; reason?: string } {
    const requestTarget = normalizedRequestTarget(req.url ?? "/");
    const ip = clientIp(req);
    if (requestTarget.length > 8_192) return { blocked: true, reason: "Request target too large" };
    if (threatIps.has(ip)) return { blocked: true, reason: "Threat intelligence block" };
    if (wafRules.sqlInjection.test(requestTarget)) return { blocked: true, reason: "SQL injection attempt" };
    if (wafRules.xss.test(requestTarget)) return { blocked: true, reason: "XSS attempt" };
    if (wafRules.pathTraversal.test(requestTarget)) return { blocked: true, reason: "Path traversal" };
    if (wafRules.git.test(requestTarget)) return { blocked: true, reason: "Repository metadata access" };
    if (domainConfig.blockedIPs?.includes(ip)) return { blocked: true, reason: "IP blocked for this domain" };

    for (const rule of domainConfig.wafRules ?? []) {
        if (rule.active === false) continue;
        try {
            if (new RegExp(rule.pattern, "i").test(requestTarget)) return { blocked: true, reason: rule.name ?? "Custom WAF rule" };
        } catch {
            // Invalid configuration must never take down traffic processing.
        }
    }
    return { blocked: false };
}
