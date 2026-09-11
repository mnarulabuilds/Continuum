import WebSocket, { WebSocketServer } from "ws";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Server as HttpsServer } from "node:https";
import type { Http2SecureServer } from "node:http2";
import { logger } from "./logger.js";
import { domainManager } from "./domainManager.js";
import { checkWAF } from "./waf.js";
import { config } from "./config.js";
import { hostnameFromRequest } from "./http.js";

type ProxyServer = HttpServer | HttpsServer | Http2SecureServer;

type ActiveConnection = {
    client: WebSocket;
    origin: WebSocket;
    hostname: string;
    connectedAt: number;
};

export class WebSocketProxy {
    private wss: WebSocketServer | null = null;
    private readonly activeConnections = new Map<string, ActiveConnection>();

    initialize(server: ProxyServer): void {
        this.wss = new WebSocketServer({ server: server as HttpServer, path: config.websocket.path, verifyClient: this.verifyClient.bind(this) });
        this.wss.on("connection", (clientWs, req) => void this.handleConnection(clientWs, req));
        logger.info("WebSocket proxy initialized");
    }

    verifyClient(info: { origin: string; secure: boolean; req: IncomingMessage }, callback: (result: boolean, code?: number, message?: string) => void): void {
        const req = info.req;
        const hostname = hostnameFromRequest(req);
        const wafResult = checkWAF(req, domainManager.getConfig(hostname) ?? {});
        if (wafResult.blocked) {
            logger.warn("WebSocket blocked by WAF", { hostname, reason: wafResult.reason });
            callback(false, 403, "Forbidden");
            return;
        }
        const domain = domainManager.getConfig(hostname);
        if (!domain?.active) {
            logger.warn("WebSocket connection to unknown domain", { hostname });
            callback(false, 404, "Domain not found");
            return;
        }
        callback(true);
    }

    async handleConnection(clientWs: WebSocket, req: IncomingMessage): Promise<void> {
        const hostname = hostnameFromRequest(req);
        const connectionId = generateConnectionId();
        logger.info("WebSocket connection established", { connectionId, hostname });
        try {
            const originUrl = await domainManager.getOrigin(hostname);
            if (!originUrl) {
                clientWs.close(1008, "Domain not configured");
                return;
            }
            const wsOrigin = `${originUrl.replace(/^http/, "ws")}${req.url ?? ""}`;
            const originWs = new WebSocket(wsOrigin, { headers: { ...req.headers, host: new URL(originUrl).hostname } });
            this.activeConnections.set(connectionId, { client: clientWs, origin: originWs, hostname, connectedAt: Date.now() });
            this.setupForwarding(clientWs, originWs, connectionId);
        } catch (error) {
            logger.error("WebSocket proxy error", { error: error instanceof Error ? error.message : "unknown", hostname });
            clientWs.close(1011, "Internal error");
        }
    }

    private setupForwarding(clientWs: WebSocket, originWs: WebSocket, connectionId: string): void {
        clientWs.on("message", (data, isBinary) => {
            if (originWs.readyState === WebSocket.OPEN) originWs.send(data, { binary: isBinary });
        });
        originWs.on("message", (data, isBinary) => {
            if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: isBinary });
        });
        clientWs.on("error", (error) => logger.error("Client WebSocket error", { connectionId, error: error.message }));
        originWs.on("error", (error) => logger.error("Origin WebSocket error", { connectionId, error: error.message }));
        clientWs.on("close", (code, reason) => {
            logger.debug("Client WebSocket closed", { connectionId, code, reason: reason.toString() });
            originWs.close();
            this.activeConnections.delete(connectionId);
        });
        originWs.on("close", (code, reason) => {
            logger.debug("Origin WebSocket closed", { connectionId, code, reason: reason.toString() });
            clientWs.close();
            this.activeConnections.delete(connectionId);
        });
        originWs.on("open", () => logger.debug("Origin WebSocket connected", { connectionId }));
    }

    getActiveConnectionsCount(): number {
        return this.activeConnections.size;
    }

    closeAll(): void {
        logger.info("Closing all WebSocket connections", { count: this.activeConnections.size });
        for (const connection of this.activeConnections.values()) {
            connection.client.close(1001, "Server shutting down");
            connection.origin.close(1001, "Server shutting down");
        }
        this.activeConnections.clear();
    }
}

function generateConnectionId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export const wsProxy = new WebSocketProxy();
