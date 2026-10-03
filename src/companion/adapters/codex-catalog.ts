import { spawn } from "node:child_process";
import { parseCodexModels, type CodexModel } from "./codex-stream.js";

/** Read the account's official picker catalog without starting an inference turn. */
export function discoverCodexModels(
  bin: string,
  timeoutMs = 8000,
  args = ["app-server"],
): Promise<CodexModel[]> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "ignore"] });
    let buffer = "",
      finished = false,
      id = 0,
      pages = 0;
    const models = new Map<string, CodexModel>(),
      cursors = new Set<string>();
    const finish = (success: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.stdin.destroy();
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
      }, 1000).unref();
      resolve(success ? [...models.values()] : []);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const send = (message: unknown) =>
      child.stdin.write(JSON.stringify(message) + "\n");
    const next = (cursor?: string) => {
      if (++pages > 100) return finish(false);
      send({
        method: "model/list",
        id: ++id,
        params: {
          limit: 100,
          includeHidden: false,
          ...(cursor ? { cursor } : {}),
        },
      });
    };
    child.on("error", () => finish(false));
    child.on("close", () => finish(false));
    child.stdin.on("error", () => finish(false));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (finished) return;
      buffer += chunk;
      if (buffer.length > 2_000_000) return finish(false);
      let end: number;
      while (!finished && (end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          finish(false);
          return;
        }
        // Notifications and unrelated replies are never exposed as model metadata.
        if (!message || typeof message !== "object") return finish(false);
        if (message.id !== id || (!message.result && !message.error)) continue;
        if (message.error) return finish(false);
        if (id === 0) {
          send({ method: "initialized", params: {} });
          next();
          continue;
        }
        const result = message.result;
        if (!Array.isArray(result.data)) return finish(false);
        const normalized = result.data
          .filter((m: { hidden?: boolean }) => m && m.hidden !== true)
          .map((m: Record<string, unknown>) => ({
            slug: m.model,
            display_name: m.displayName,
            visibility: "list",
            default_reasoning_level: m.defaultReasoningEffort,
            supported_reasoning_levels: Array.isArray(
              m.supportedReasoningEfforts,
            )
              ? m.supportedReasoningEfforts.map(
                  (e: { reasoningEffort?: string }) => ({
                    effort: e?.reasoningEffort,
                  }),
                )
              : [],
          }));
        for (const model of parseCodexModels(
          JSON.stringify({ models: normalized }),
        ))
          models.set(model.id, model);
        const cursor = result.nextCursor;
        if (cursor == null) return finish(true);
        if (
          typeof cursor !== "string" ||
          !cursor ||
          cursor.length > 4096 ||
          cursors.has(cursor)
        )
          return finish(false);
        cursors.add(cursor);
        next(cursor);
      }
    });
    send({
      method: "initialize",
      id,
      params: {
        clientInfo: { name: "tern_ai", title: "Tern AI", version: "0.3.0" },
      },
    });
  });
}
