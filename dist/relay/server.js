import { createServer } from "node:http";
import { parse as parseUrl } from "node:url";
export class DedicatedRelayServer {
    options;
    server = createServer(this.handleRequest.bind(this));
    companions = new Map();
    pendingJobs = new Map();
    constructor(options) {
        this.options = options;
    }
    start() {
        return new Promise((resolve) => {
            this.server.listen(this.options.port, this.options.host || "0.0.0.0", () => {
                resolve();
            });
        });
    }
    stop() {
        return new Promise((resolve, reject) => {
            this.server.close((err) => (err ? reject(err) : resolve()));
        });
    }
    handleRequest(req, res) {
        const url = parseUrl(req.url || "", true);
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }
        if (url.pathname === "/health") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok", activeCompanions: this.companions.size }));
            return;
        }
        // Companion SSE stream endpoint
        if (url.pathname === "/companion/stream" && req.method === "GET") {
            const companionId = String(url.query.companionId || "");
            if (!companionId) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "companionId required" }));
                return;
            }
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            });
            res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
            this.companions.set(companionId, { id: companionId, res, lastSeen: Date.now() });
            const keepAlive = setInterval(() => {
                res.write(": keep-alive\n\n");
            }, 15000);
            req.on("close", () => {
                clearInterval(keepAlive);
                this.companions.delete(companionId);
            });
            return;
        }
        // Dispatch job from web to companion
        if (url.pathname === "/relay/dispatch" && req.method === "POST") {
            let body = "";
            req.on("data", (c) => (body += c));
            req.on("end", () => {
                try {
                    const payload = JSON.parse(body);
                    const companion = this.companions.get(payload.companionId);
                    if (!companion || !companion.res) {
                        res.writeHead(503, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "Companion offline" }));
                        return;
                    }
                    companion.res.write(`data: ${JSON.stringify({ type: "job", ...payload })}\n\n`);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ dispatched: true }));
                }
                catch {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Invalid JSON" }));
                }
            });
            return;
        }
        // Chunks from companion to relay
        if (url.pathname === "/relay/chunk" && req.method === "POST") {
            let body = "";
            req.on("data", (c) => (body += c));
            req.on("end", () => {
                try {
                    const chunk = JSON.parse(body);
                    const handler = this.pendingJobs.get(chunk.jobId);
                    if (handler) {
                        handler(chunk);
                    }
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ ok: true }));
                }
                catch {
                    res.writeHead(400);
                    res.end();
                }
            });
            return;
        }
        res.writeHead(404);
        res.end();
    }
}
//# sourceMappingURL=server.js.map