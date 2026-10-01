import { hostname } from "node:os";
import { openSync } from "node:fs";
import { spawn } from "node:child_process";
import { loadCompanionConfig, saveCompanionConfig, getDaemonPid, saveDaemonPid, clearDaemonPid, LOG_FILE, } from "../companion/config.js";
import { detectAllLocalProviders } from "../companion/detector.js";
import { CompanionClient } from "../companion/client.js";
import { output, info } from "../cli/io.js";
import { TernError } from "../utils/errors.js";
const DEFAULT_SERVER_URL = process.env.TERN_SERVER_URL ||
    (process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : "https://tern-ai-swart.vercel.app");
export async function startCompanionDaemon() {
    const config = loadCompanionConfig();
    if (!config) {
        throw new TernError("Tern Companion is not paired. Run `tern companion pair <code>` first.");
    }
    const existingPid = getDaemonPid();
    if (existingPid) {
        output(`Tern Companion daemon is already running (PID: ${existingPid}).`);
        return;
    }
    const outFd = openSync(LOG_FILE, "a");
    const errFd = openSync(LOG_FILE, "a");
    const binPath = process.argv[1] || "tern";
    const child = spawn(process.execPath, [binPath, "companion", "_daemon"], {
        detached: true,
        stdio: ["ignore", outFd, errFd],
        env: process.env,
    });
    if (child.pid) {
        saveDaemonPid(child.pid);
        child.unref();
        output(`✓ Tern Companion daemon started in background (PID: ${child.pid}).`);
        output(`  Logs: ${LOG_FILE}`);
    }
    else {
        throw new TernError("Failed to start companion background daemon.");
    }
}
export async function stopCompanionDaemon() {
    const pid = getDaemonPid();
    if (!pid) {
        output("Tern Companion daemon is not running.");
        clearDaemonPid();
        return;
    }
    try {
        process.kill(pid, "SIGTERM");
        output(`✓ Tern Companion daemon (PID: ${pid}) stopped.`);
    }
    catch (err) {
        output(`Failed to stop daemon PID ${pid}: ${err?.message}`);
    }
    finally {
        clearDaemonPid();
    }
}
export async function pairCompanion(code, options) {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode)
        throw new TernError("Pairing code is required.");
    const serverUrl = (options.server || DEFAULT_SERVER_URL).replace(/\/+$/, "");
    info(`Pairing with Tern AI at ${serverUrl}...`);
    const response = await fetch(`${serverUrl}/api/router/companion/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            code: cleanCode,
            platform: process.platform,
            label: hostname() || "local-companion",
        }),
        signal: AbortSignal.timeout(15000),
    }).catch((err) => {
        throw new TernError(`Cannot connect to Tern AI server: ${err?.message}`);
    });
    if (!response.ok) {
        const error = (await response.json().catch(() => ({})));
        throw new TernError(error.error || `Pairing failed with HTTP ${response.status}`);
    }
    const data = (await response.json());
    saveCompanionConfig({
        companionId: data.companionId,
        token: data.token,
        serverUrl,
        userId: data.userId,
        label: data.label || hostname() || "local-companion",
        pairedAt: Date.now(),
    });
    output(`✓ Tern Companion paired successfully!`);
    output(`  Companion ID : ${data.companionId}`);
    output(`  Server       : ${serverUrl}`);
    info("Syncing detected local AI providers with your Tern AI account...");
    try {
        const client = new CompanionClient({
            companionId: data.companionId,
            token: data.token,
            serverUrl,
            userId: data.userId,
            label: data.label || hostname() || "local-companion",
            pairedAt: Date.now(),
        });
        await client.reportStatus();
        output("✓ Local providers synced!");
    }
    catch (err) {
        output(`  Warning: initial provider sync: ${err?.message}`);
    }
    await startCompanionDaemon();
}
export async function companionStatus() {
    const config = loadCompanionConfig();
    if (!config) {
        output("Tern Companion: Not paired");
        output("To pair your local machine, run:");
        output("  tern companion pair <code>");
        return;
    }
    const daemonPid = getDaemonPid();
    output("Tern Companion: Paired");
    output(`  ID     : ${config.companionId}`);
    output(`  Server : ${config.serverUrl}`);
    output(`  Label  : ${config.label}`);
    output(`  Daemon : ${daemonPid ? `Active (PID: ${daemonPid})` : "Stopped"}`);
    output(`  Paired : ${new Date(config.pairedAt).toLocaleString()}`);
    output("\nLocal Provider Probing:");
    const detected = await detectAllLocalProviders();
    for (const p of detected) {
        const status = !p.installed
            ? "Not installed"
            : p.authenticated
                ? `Ready (${p.models.length} models)`
                : `Auth required (${p.authDetails || "login needed"})`;
        output(`  • ${p.name.padEnd(16)} : ${status}`);
    }
}
export async function companionProviders() {
    const detected = await detectAllLocalProviders();
    output("Local Provider Catalog & Capabilities:\n");
    for (const p of detected) {
        output(`[${p.name}] (${p.id})`);
        output(`  Installed     : ${p.installed ? "Yes" : "No"}`);
        if (p.version)
            output(`  Version       : ${p.version}`);
        output(`  Authenticated : ${p.authenticated ? "Yes" : "No"}`);
        if (p.authDetails)
            output(`  Auth Details  : ${p.authDetails}`);
        output(`  Health        : ${p.health.ok ? "Healthy" : "Offline / Unhealthy"}`);
        if (p.health.latencyMs !== undefined)
            output(`  Latency       : ${p.health.latencyMs}ms`);
        if (p.models.length > 0) {
            output(`  Models        : ${p.models.map((m) => m.id).join(", ")}`);
        }
        output("");
    }
}
export async function runCompanion() {
    const config = loadCompanionConfig();
    if (!config) {
        throw new TernError("Tern Companion is not paired. Run `tern companion pair <code>` first.");
    }
    const isInternalDaemon = process.argv.includes("_daemon");
    const existingPid = getDaemonPid();
    if (!isInternalDaemon && existingPid && existingPid !== process.pid) {
        output(`Tern Companion daemon is already running in background (PID: ${existingPid}).`);
        output("To view status : tern companion status");
        output("To stop daemon : tern companion stop");
        return;
    }
    saveDaemonPid(process.pid);
    const client = new CompanionClient(config);
    const cleanup = () => {
        client.stop();
        clearDaemonPid();
        process.stdout.write("\nTern Companion stopped.\n");
        process.exit(0);
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    try {
        await client.start();
    }
    finally {
        clearDaemonPid();
    }
}
//# sourceMappingURL=companion.js.map