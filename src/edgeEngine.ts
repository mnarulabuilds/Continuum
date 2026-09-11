import vm from "node:vm";
import type { IncomingMessage, ServerResponse } from "node:http";
import { logger } from "./logger.js";
import type { DomainConfig } from "./domainManager.js";

type EdgeRule = DomainConfig["edgeRules"][number];
type EdgePhase = "request" | "response";
type EdgeResult = { stop: boolean };

export async function executeEdgeRule(
    rule: EdgeRule,
    req: IncomingMessage,
    res: ServerResponse,
    _phase: EdgePhase = "request",
): Promise<EdgeResult | undefined> {
    if (!rule?.script) return;
    const sandbox: Record<string, unknown> = {
        request: { url: req.url, method: req.method, headers: req.headers, ip: req.socket.remoteAddress },
        response: { headers: typeof res.getHeaders === "function" ? res.getHeaders() : {}, statusCode: res.statusCode },
        console: {
            log: (...args: unknown[]) => logger.debug("Edge Script Log:", { args }),
            error: (...args: unknown[]) => logger.error("Edge Script Error:", { args }),
        },
        setResponseHeader: (name: string, value: string | number | readonly string[]) => { res.setHeader(name, value); },
        redirect: (url: string, code = 302) => {
            res.writeHead(code, { Location: url });
            res.end();
            return "STOP";
        },
    };
    try {
        const script = new vm.Script(rule.script);
        const context = vm.createContext(sandbox);
        const result = script.runInContext(context, { timeout: 100 });
        if (result === "STOP" || sandbox.STOP === true) return { stop: true };
    } catch (error) {
        logger.error("Edge Rule Execution Failed", { error: error instanceof Error ? error.message : "unknown", ruleId: rule.id });
    }
    return { stop: false };
}
