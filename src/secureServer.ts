import https from "node:https";
import http2 from "node:http2";
import http from "node:http";
import tls from "node:tls";
import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { sslManager } from "./sslManager.js";

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
type CachedCertificate = { context: tls.SecureContext; loadedAt: number };

export class SecureServerManager {
    private readonly http2Enabled: boolean;
    private readonly activeCertificates = new Map<string, CachedCertificate>();

    constructor() {
        this.http2Enabled = config.http2.enabled;
        this.sniCallback = this.sniCallback.bind(this);
    }

    sniCallback(hostname: string, callback: (error: Error | null, context?: tls.SecureContext) => void): void {
        void this.loadCertificate(hostname)
            .then((context) => callback(null, context))
            .catch((error: Error) => {
                logger.error("SNI Callback Error", { hostname, error: error.message });
                callback(error);
            });
    }

    private async loadCertificate(hostname: string): Promise<tls.SecureContext> {
        const cached = this.activeCertificates.get(hostname);
        if (cached && Date.now() - cached.loadedAt < 3_600_000) return cached.context;
        const { cert, key } = await sslManager.getCertificate(hostname);
        const context = tls.createSecureContext({ cert, key });
        this.activeCertificates.set(hostname, { context, loadedAt: Date.now() });
        return context;
    }

    createHTTPSServer(requestHandler: RequestHandler): https.Server {
        return https.createServer({ SNICallback: this.sniCallback }, requestHandler);
    }

    createHTTP2Server(requestHandler: RequestHandler): http2.Http2SecureServer {
        const server = http2.createSecureServer({ SNICallback: this.sniCallback, allowHTTP1: true });
        server.on("stream", (stream, headers) => {
            const req = {
                method: headers[":method"],
                url: headers[":path"],
                headers,
                httpVersion: "2.0",
                socket: stream.session?.socket,
                on: stream.on.bind(stream),
                pipe: stream.pipe.bind(stream),
            } as unknown as IncomingMessage;
            const responseHeaders: Record<string, string | number | string[]> = {};
            const res = {
                writeHead: (status: number, nextHeaders?: Record<string, string | number | readonly string[]>) => {
                    stream.respond({ ":status": status, ...nextHeaders, ...responseHeaders });
                },
                write: stream.write.bind(stream),
                end: stream.end.bind(stream),
                setHeader: (name: string, value: string | number | readonly string[]) => { responseHeaders[name] = value as string; },
                getHeaders: () => responseHeaders,
                statusCode: 200,
            } as unknown as ServerResponse;
            void requestHandler(req, res);
        });
        return server;
    }

    createServer(requestHandler: RequestHandler): https.Server | http2.Http2SecureServer | http.Server {
        if (config.https.enabled) {
            if (this.http2Enabled) {
                logger.info("Creating HTTP/2 server with TLS");
                return this.createHTTP2Server(requestHandler);
            }
            logger.info("Creating HTTPS server");
            return this.createHTTPSServer(requestHandler);
        }
        logger.info("Creating HTTP server");
        return http.createServer(requestHandler);
    }
}

export const secureServerManager = new SecureServerManager();
