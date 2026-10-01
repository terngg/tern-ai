import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const CONFIG_DIR = join(homedir(), ".tern");
const CONFIG_FILE = join(CONFIG_DIR, "companion.json");
export function loadCompanionConfig() {
    try {
        if (!existsSync(CONFIG_FILE))
            return null;
        const content = readFileSync(CONFIG_FILE, "utf8");
        const data = JSON.parse(content);
        if (data.companionId && data.token && data.serverUrl) {
            return data;
        }
        return null;
    }
    catch {
        return null;
    }
}
export function saveCompanionConfig(config) {
    try {
        if (!existsSync(CONFIG_DIR)) {
            mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
        }
        writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
            encoding: "utf8",
            mode: 0o600,
        });
    }
    catch (err) {
        throw new Error(`Cannot save companion config to ~/.tern/companion.json: ${err?.message}`);
    }
}
export const PID_FILE = join(CONFIG_DIR, "companion.pid");
export const LOG_FILE = join(CONFIG_DIR, "companion.log");
export function getDaemonPid() {
    try {
        if (!existsSync(PID_FILE))
            return null;
        const pid = parseInt(readFileSync(PID_FILE, "utf8").trim(), 10);
        if (!pid || isNaN(pid))
            return null;
        // Check if process is still running
        process.kill(pid, 0);
        return pid;
    }
    catch {
        return null;
    }
}
export function saveDaemonPid(pid) {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    writeFileSync(PID_FILE, String(pid), { encoding: "utf8", mode: 0o600 });
}
export function clearDaemonPid() {
    try {
        if (existsSync(PID_FILE)) {
            unlinkSync(PID_FILE);
        }
    }
    catch {
        /* ignore */
    }
}
//# sourceMappingURL=config.js.map