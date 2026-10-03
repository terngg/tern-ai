import { Assistant, defaults, type Config } from "@tern-ai/core";
import { readJson, localIndex, MAX_UPLOAD } from "../../../../lib/server.js";
import { authenticate } from "../../../../lib/router/auth.js";
import { RouterStore, rateLimit } from "../../../../lib/router/store.js";
import { RoutedClient } from "../../../../lib/router/engine.js";
import { preferredProvider } from "../../../../lib/router/preferences.js";
import {
  PublicError,
  RouteError,
  safeError,
} from "../../../../lib/router/errors.js";
import type { FileContext } from "../../../../../../src/utils/files.js";
import type { Message } from "../../../../../../src/openrouter/client.js";

export const runtime = "nodejs";
export const maxDuration = 300;
const headers = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
  "X-Content-Type-Options": "nosniff",
};
function event(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  type: string,
  data: unknown,
): void {
  controller.enqueue(
    encoder.encode(
      `data: ${JSON.stringify({ type, ...(data && typeof data === "object" ? data : { value: data }) })}\n\n`,
    ),
  );
}
function messages(value: unknown): Message[] {
  if (!Array.isArray(value) || value.length > 30)
    throw new Error("Conversation has too many messages.");
  let size = 0;
  return value.map((item): Message => {
    if (!item || typeof item !== "object")
      throw new Error("Invalid conversation context.");
    const m = item as Record<string, unknown>;
    if (
      !["user", "assistant"].includes(String(m.role)) ||
      typeof m.content !== "string" ||
      m.content.length > 40_000
    )
      throw new Error("Invalid conversation context.");
    size += m.content.length;
    if (size > 80_000) throw new Error("Conversation context is too large.");
    return { role: m.role as "user" | "assistant", content: m.content };
  });
}
function attachments(value: unknown): FileContext[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 5)
    throw new Error("Attach up to five .lua or .txt files.");
  let total = 0;
  return value.map((item): FileContext => {
    if (!item || typeof item !== "object")
      throw new Error("Invalid attachment.");
    const file = item as Record<string, unknown>;
    if (
      typeof file.name !== "string" ||
      typeof file.content !== "string" ||
      ![".lua", ".txt"].includes(
        file.name.slice(file.name.lastIndexOf(".")).toLowerCase(),
      )
    )
      throw new Error("Only .lua and .txt files are supported.");
    const size = Buffer.byteLength(file.content);
    if (size > MAX_UPLOAD)
      throw new Error("An attachment is too large (16 KiB maximum).");
    total += size;
    if (total > MAX_UPLOAD)
      throw new Error("Combined attachments exceed 16 KiB.");
    if (file.content.includes("\0"))
      throw new Error("Binary attachments are not supported.");
    return { name: file.name, path: file.name, content: file.content };
  });
}
export async function POST(request: Request): Promise<Response> {
  let store: RouterStore;
  try {
    const user = await authenticate(request);
    await rateLimit("generate:" + user.id, 12);
    store = new RouterStore(user.id);
  } catch (error) {
    return safeError(error);
  }
  let input: Record<string, unknown>;
  try {
    input = await readJson(request);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (
    typeof input.prompt !== "string" ||
    !input.prompt.trim() ||
    input.prompt.length > 8192
  )
    return Response.json(
      { error: "Enter a prompt (up to 8 KiB)." },
      { status: 400 },
    );
  const requestedModel =
    typeof input.routerModel === "string" ? input.routerModel : "auto";
  const poolId =
    typeof input.poolId === "string" && input.poolId ? input.poolId : undefined;
  let history: Message[];
  let files: FileContext[];
  let firstProvider: string | undefined;
  try {
    firstProvider = preferredProvider(input.preferredProvider);
    history = messages(input.history);
    files = attachments(input.files);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
  const config: Config = structuredClone(defaults) as Config;
  const client = new RoutedClient(store, requestedModel, poolId, undefined, undefined, firstProvider);
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) controller.abort();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abort();
  }, 290_000);
  let disconnected = false;
  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      const encoder = new TextEncoder();

      const write = (type: string, data: unknown): void => {
        if (!disconnected)
          try {
            event(streamController, encoder, type, data);
          } catch {
            disconnected = true;
            controller.abort();
          }
      };
      const heartbeat = setInterval(() => write("ping", {}), 15_000);
      void (async () => {
        try {
          const index = await localIndex();
          const assistant = new Assistant(
            config,
            index,
            client,
            undefined,
            "",
            (message) => {
              if (message.startsWith("Repairing validation errors"))
                write("reset", {});
              write("status", { message });
            },
          );
          const task = [
            "generate",
            "fix",
            "review",
            "explain",
            "chat",
          ].includes(String(input.task))
            ? (input.task as "generate" | "fix" | "review" | "explain" | "chat")
            : "chat";
          const result = await assistant.run({
            task,
            prompt: input.prompt as string,
            files,
            history,
            ...(typeof input.summary === "string"
              ? { summary: input.summary.slice(0, 6000) }
              : {}),
            signal: controller.signal,
            onToken: (text) => write("token", { text }),
          });
          if ((task === "generate" || task === "fix") && !result.code)
            throw new Error(
              "No complete Lua script was returned. Try a smaller request.",
            );
          if (
            result.validation?.findings.some((f) => f.severity === "error") &&
            task !== "review" &&
            task !== "explain"
          )
            throw new Error(
              "Local Lua/GTPS validation still failed after bounded repair. Revise the request or provide a smaller script.",
            );
          const used = client.lastProvider;
          write("result", {
            text: result.text,
            explanation: result.explanation,
            code: result.code,
            filename: filename(
              typeof input.filename === "string" ? input.filename : undefined,
              input.prompt as string,
            ),
            validation: result.validation
              ? {
                  syntaxValid: result.validation.syntaxValid,
                  recognized: result.validation.recognized,
                  findings: result.validation.findings,
                }
              : undefined,
            apiCount: result.apiCount,
            model: result.model,
            provider: used || "unknown",
          });
          write("done", {});
        } catch (error) {
          const message =
            error instanceof PublicError || error instanceof RouteError
              ? error.message
              : "Generation failed. Check your provider connection and retry.";
          if (timedOut)
            write("error", {
              message: "The provider request timed out. Try a smaller request.",
              code: "timeout",
            });
          else if (!controller.signal.aborted)
            write("error", {
              message,
              code:
                error instanceof RouteError ? error.category : "request_failed",
            });
          else write("stopped", {});
        } finally {
          clearInterval(heartbeat);
          clearTimeout(timeout);
          request.signal.removeEventListener("abort", abort);
          try {
            streamController.close();
          } catch {
            /* client closed */
          }
        }
      })();
    },
    cancel() {
      disconnected = true;
      controller.abort();
    },
  });
  return new Response(stream, { headers });
}
function filename(suggested: unknown, prompt: string): string {
  const fromPrompt =
    typeof suggested === "string"
      ? suggested
      : /[\w-]+\.lua\b/i.exec(prompt)?.[0];
  const source =
    (fromPrompt || "gtps_script.lua").split(/[\\/]/).at(-1) ||
    "gtps_script.lua";
  const safe = source
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^\.+/, "")
    .slice(0, 72);
  const stem = safe.replace(/\.lua$/i, "") || "gtps_script";
  return `${stem}.lua`;
}
