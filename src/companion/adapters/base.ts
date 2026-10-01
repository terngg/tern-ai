import { spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { execFile as nodeExecFile } from "node:child_process";

const execFileAsync = promisify(nodeExecFile);

export async function findBinary(name: string): Promise<string | null> {
  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await execFileAsync(cmd, [name], { timeout: 3000 });
    const line = stdout.trim().split(/\r?\n/)[0];
    return line && line.length > 0 ? line : null;
  } catch {
    return null;
  }
}

export async function runCommand(
  bin: string,
  args: string[],
  timeoutMs = 5000,
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: String(e.stdout || "").trim(),
      stderr: String(e.stderr || "").trim(),
      code: typeof e.code === "number" ? e.code : 1,
    };
  }
}

export function spawnStreaming(
  bin: string,
  args: string[],
  signal?: AbortSignal,
): {
  process: ChildProcess;
  stream: AsyncIterable<string>;
  kill: () => void;
} {
  const child = spawn(bin, args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (signal) {
    if (signal.aborted) {
      child.kill("SIGKILL");
    } else {
      signal.addEventListener("abort", () => {
        child.kill("SIGKILL");
      });
    }
  }

  async function* readStdout(): AsyncIterable<string> {
    if (!child.stdout) return;
    for await (const chunk of child.stdout) {
      yield (chunk as Buffer).toString("utf8");
    }
  }

  return {
    process: child,
    stream: readStdout(),
    kill: () => {
      try {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 1000).unref();
      } catch {
        /* ignore */
      }
    },
  };
}
