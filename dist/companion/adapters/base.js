import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { execFile as nodeExecFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const execFileAsync = promisify(nodeExecFile);
export async function findBinary(name) {
    const commonPaths = [
        join(homedir(), ".local", "bin", name),
        join(homedir(), "bin", name),
        join("/usr", "local", "bin", name),
        join("/usr", "bin", name),
    ];
    for (const p of commonPaths) {
        if (existsSync(p))
            return p;
    }
    const cmd = process.platform === "win32" ? "where" : "which";
    try {
        const { stdout } = await execFileAsync(cmd, [name], { timeout: 3000 });
        const line = stdout.trim().split(/\r?\n/)[0];
        return line && line.length > 0 ? line : null;
    }
    catch {
        return null;
    }
}
export async function runCommand(bin, args, timeoutMs = 5000) {
    try {
        const { stdout, stderr } = await execFileAsync(bin, args, {
            timeout: timeoutMs,
            maxBuffer: 1024 * 1024,
        });
        return { stdout: stdout.trim(), stderr: stderr.trim(), code: 0 };
    }
    catch (err) {
        const e = err;
        return {
            stdout: String(e.stdout || "").trim(),
            stderr: String(e.stderr || "").trim(),
            code: typeof e.code === "number" ? e.code : 1,
        };
    }
}
export function spawnStreaming(bin, args, signal, cwd) {
    const child = spawn(bin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        ...(cwd ? { cwd } : {}),
    });
    let closed = false;
    // Drain diagnostics without retaining or exposing credentials and prompts.
    child.stderr?.resume();
    const completion = new Promise((resolve) => {
        child.once("error", () => resolve(false));
        child.once("close", (code) => {
            closed = true;
            resolve(code === 0);
        });
    });
    const kill = () => {
        if (closed)
            return;
        child.kill("SIGTERM");
        setTimeout(() => { if (!closed)
            child.kill("SIGKILL"); }, 1000).unref();
    };
    const abort = () => kill();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted)
        kill();
    async function* readStdout() {
        try {
            child.stdout?.setEncoding("utf8");
            if (child.stdout)
                for await (const chunk of child.stdout)
                    yield String(chunk);
            const success = await completion;
            if (signal?.aborted)
                throw new Error("Local provider request cancelled.");
            if (!success)
                throw new Error("Local provider process failed. Check CLI sign-in and diagnostics locally.");
        }
        finally {
            signal?.removeEventListener("abort", abort);
            kill();
        }
    }
    return { process: child, stream: readStdout(), kill };
}
//# sourceMappingURL=base.js.map