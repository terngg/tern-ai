import { loadCompanionConfig } from "./config.js";
import { getLocalAdapter } from "./registry.js";
import { detectAllLocalProviders } from "./detector.js";
import { relayStream, postRelayEvent } from "./relay-stream.js";
export class CompanionClient {
    config;
    running = false;
    activeJobs = new Map();
    constructor(config) {
        const loaded = config || loadCompanionConfig();
        if (!loaded) {
            throw new Error("Tern Companion is not paired. Run `tern companion pair <code>` first.");
        }
        this.config = loaded;
    }
    async reportStatus() {
        const providers = await detectAllLocalProviders();
        const url = `${this.config.serverUrl}/api/router/companion/heartbeat`;
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.config.token}`,
                },
                body: JSON.stringify({
                    companionId: this.config.companionId,
                    platform: process.platform,
                    label: this.config.label,
                    detectedProviders: providers,
                }),
                signal: AbortSignal.timeout(10000),
            });
            if (!res.ok) {
                process.stderr.write(`[companion] Heartbeat warning: HTTP ${res.status}\n`);
            }
        }
        catch (err) {
            process.stderr.write(`[companion] Heartbeat error: ${err?.message}\n`);
        }
    }
    async start() {
        this.running = true;
        process.stdout.write(`✓ Tern Companion running as [${this.config.label}] (${this.config.companionId})\n`);
        process.stdout.write(`  Connected to: ${this.config.serverUrl}\n`);
        process.stdout.write("  Outbound relay listener active. Ready for local requests.\n");
        // Initial registration
        await this.reportStatus();
        // Heartbeat every 30 seconds
        const heartbeatTimer = setInterval(() => {
            if (this.running)
                void this.reportStatus();
        }, 30000);
        heartbeatTimer.unref();
        // Event loop for polling/SSE jobs
        while (this.running) {
            try {
                await this.pollEvents();
            }
            catch (err) {
                if (!this.running)
                    break;
                process.stderr.write(`[companion] Relay poll error: ${err?.message}. Retrying in 3s...\n`);
                await new Promise((r) => setTimeout(r, 3000));
            }
        }
    }
    stop() {
        this.running = false;
        for (const [, controller] of this.activeJobs) {
            controller.abort();
        }
        this.activeJobs.clear();
    }
    async pollEvents() {
        const url = `${this.config.serverUrl}/api/router/companion/events?companionId=${encodeURIComponent(this.config.companionId)}`;
        const res = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${this.config.token}`,
            },
            signal: AbortSignal.timeout(35000),
        });
        if (!res.ok) {
            throw new Error(`Relay returned status ${res.status}`);
        }
        const data = (await res.json());
        if (Array.isArray(data.cancels)) {
            for (const cancelId of data.cancels) {
                const controller = this.activeJobs.get(cancelId);
                if (controller) {
                    controller.abort();
                    this.activeJobs.delete(cancelId);
                }
            }
        }
        if (Array.isArray(data.jobs) && data.jobs.length > 0) {
            for (const job of data.jobs) {
                if (!this.activeJobs.has(job.id))
                    void this.handleJob(job).catch(() => {
                        process.stderr.write("[companion] Job delivery failed; no completion was acknowledged.\n");
                    });
            }
        }
    }
    async handleJob(job) {
        const adapter = getLocalAdapter(job.provider);
        if (!adapter) {
            await this.sendJobEvent(job.id, {
                type: "error",
                error: `No local adapter for provider ${job.provider}`,
            });
            return;
        }
        const controller = new AbortController();
        this.activeJobs.set(job.id, controller);
        const chatReq = {
            id: job.id,
            model: job.model,
            messages: job.request.messages,
            temperature: job.request.temperature,
            maxTokens: job.request.maxTokens,
            signal: controller.signal,
        };
        try {
            await relayStream(adapter.chat(chatReq), (event, sequence) => this.sendJobEvent(job.id, event, sequence, controller.signal), controller);
        }
        catch {
            // A failed delivery is never silently treated as success. Terminal errors
            // are idempotent even if a previous acknowledgement was lost.
            controller.abort();
            await this.sendJobEvent(job.id, {
                type: "error", category: "network", error: "Local stream delivery failed.",
            });
        }
        finally {
            this.activeJobs.delete(job.id);
        }
    }
    async sendJobEvent(jobId, event, sequence, signal) {
        await postRelayEvent(`${this.config.serverUrl}/api/router/companion/events`, this.config.token, {
            companionId: this.config.companionId, jobId, ...event,
            ...(sequence === undefined ? {} : { sequence }),
        }, signal);
    }
}
//# sourceMappingURL=client.js.map