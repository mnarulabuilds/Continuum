import type { IncomingMessage, ServerResponse } from "node:http";
import { resetStats } from "./analytics.js";
import { dnsManager } from "./dnsManager.js";
import { domainManager } from "./domainManager.js";
import { hostnameFromRequest, readJsonBody, sendJson } from "./http.js";
import { purgeCache } from "./proxy.js";
import { sslManager } from "./sslManager.js";

export async function handleAdminApiRequest(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<boolean> {
    if (pathname === "/admin/domains" && req.method === "GET") {
        sendJson(res, 200, domainManager.getAll());
        return true;
    }
    if (pathname === "/admin/domains" && req.method === "POST") {
        await addDomain(req, res);
        return true;
    }
    if (pathname === "/admin/domains" && req.method === "PUT") {
        await updateDomainCachePolicy(req, res);
        return true;
    }
    if (pathname === "/admin/domains" && req.method === "DELETE") {
        await removeDomain(req, res);
        return true;
    }
    if (pathname === "/admin/dns-verify" && req.method === "POST") {
        await verifyDns(req, res);
        return true;
    }
    if (pathname === "/admin/ssl-provision" && req.method === "POST") {
        await provisionSsl(req, res);
        return true;
    }
    if (pathname === "/admin/analytics/reset" && req.method === "POST") {
        resetStats();
        sendJson(res, 200, { success: true, reset: true });
        return true;
    }
    if (pathname.startsWith("/admin/")) {
        plain(res, 404, "Not Found");
        return true;
    }
    if (pathname === "/cdn-purge" && req.method === "POST") {
        const body = await readJsonBody(req);
        const path = typeof body.path === "string" ? body.path : "";
        const domain = typeof body.domain === "string" ? body.domain : undefined;
        if (!path) {
            sendJson(res, 400, { success: false, error: "path is required" });
            return true;
        }
        sendJson(res, 200, await purgeCache(path, domain));
        return true;
    }
    if (pathname === "/cdn-purge") {
        plain(res, 405, "Method Not Allowed");
        return true;
    }
    return false;
}

async function addDomain(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = await readJsonBody(req);
        if (typeof body.hostname !== "string" || (!Array.isArray(body.origin) && typeof body.origin !== "string")) {
            throw new Error("hostname and origin are required");
        }
        const domain = await domainManager.addDomain(body.hostname, body.origin, {
            plan: body.plan === "pro" || body.plan === "enterprise" ? body.plan : "free",
            ...(body.cachePolicy === undefined ? {} : { cachePolicy: body.cachePolicy }),
        });
        sendJson(res, 201, { success: true, domain });
    } catch (error) {
        sendJson(res, 400, { success: false, error: error instanceof Error ? error.message : "Invalid domain" });
    }
}

async function updateDomainCachePolicy(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = await readJsonBody(req);
        if (typeof body.hostname !== "string" || body.cachePolicy === undefined) {
            throw new Error("hostname and cachePolicy are required");
        }
        const domain = await domainManager.updateCachePolicy(body.hostname, body.cachePolicy);
        if (!domain) {
            sendJson(res, 404, { success: false, error: "Domain not found" });
            return;
        }
        sendJson(res, 200, { success: true, domain });
    } catch (error) {
        sendJson(res, 400, { success: false, error: error instanceof Error ? error.message : "Invalid cache policy" });
    }
}

async function removeDomain(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = await readJsonBody(req);
        if (typeof body.hostname !== "string") throw new Error("hostname is required");
        const removed = await domainManager.removeDomain(body.hostname);
        sendJson(res, removed ? 200 : 404, { success: removed });
    } catch (error) {
        sendJson(res, 400, { success: false, error: error instanceof Error ? error.message : "Invalid domain" });
    }
}

async function verifyDns(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = await readJsonBody(req);
        if (typeof body.hostname !== "string") throw new Error("hostname is required");
        sendJson(res, 200, await dnsManager.verifyCNAME(body.hostname, hostnameFromRequest(req)));
    } catch (error) {
        sendJson(res, 400, { success: false, error: error instanceof Error ? error.message : "Invalid request" });
    }
}

async function provisionSsl(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
        const body = await readJsonBody(req);
        if (typeof body.hostname !== "string" || !domainManager.getConfig(body.hostname)) {
            throw new Error("Configured hostname is required");
        }
        await sslManager.getCertificate(body.hostname);
        sendJson(res, 200, { success: true, message: "Certificate ready" });
    } catch (error) {
        sendJson(res, 400, { success: false, error: error instanceof Error ? error.message : "Certificate provisioning failed" });
    }
}

function plain(res: ServerResponse, statusCode: number, message: string): void {
    res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end(message);
}
