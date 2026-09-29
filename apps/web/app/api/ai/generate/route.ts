import {
  ApiKeyPool,
  Assistant,
  defaults,
  ProviderClient,
  providerRegistry,
  type Config,
  type Credential,
  type ProviderId,
} from "@tern-ai/core";
import {
  readJson,
  localIndex,
  validKey,
  validModel,
  MAX_UPLOAD,
  providerErrorMessage,
  guardRequest,
} from "../../../../lib/server.js";
import type { FileContext } from "../../../../../../src/utils/files.js";
import type { Message } from "../../../../../../src/openrouter/client.js";

export const runtime = "nodejs";
export const maxDuration = 120;
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
  const blocked = guardRequest(request, "generate");
  if (blocked) return blocked;
  let input: Record<string, unknown>;
  try {
    input = await readJson(request);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const providerMode = input.providerMode;
  if (!["auto", "gemini", "openrouter"].includes(String(providerMode)))
    return Response.json(
      { error: "Choose Auto, Gemini, or OpenRouter." },
      { status: 400 },
    );
  if (
    typeof input.prompt !== "string" ||
    input.prompt.trim().length === 0 ||
    input.prompt.length > 8192
  )
    return Response.json(
      { error: "Enter a prompt (up to 8 KiB).", code: "bad_request" },
      { status: 400 },
    );
  const keyInput =
    input.keys && typeof input.keys === "object"
      ? (input.keys as Record<string, unknown>)
      : {};
  const credentials: Credential[] = [];
  const providersToInspect: ProviderId[] =
    providerMode === "auto"
      ? (["gemini", "openrouter"] as ProviderId[])
      : [providerMode as ProviderId];

  for (const provider of providersToInspect) {
    const raw =
      typeof keyInput[provider] === "string"
        ? (keyInput[provider] as string).trim()
        : "";
    if (raw) {
      if (!validKey(provider, raw)) {
        if (providerMode !== "auto") {
          return Response.json(
            {
              error: `The ${provider === "gemini" ? "Gemini" : "OpenRouter"} API key format is invalid.`,
            },
            { status: 400 },
          );
        }
        continue;
      }
      credentials.push({
        id: `${provider}-web`,
        provider,
        key: raw,
        source: "environment",
      });
    }
  }
  const enabled =
    providerMode === "auto"
      ? credentials.length > 0
      : credentials.some((c) => c.provider === providerMode);
  if (!enabled)
    return Response.json(
      {
        error:
          "No key is configured for the selected provider. Open Settings to connect one.",
        code: "no_provider",
      },
      { status: 401 },
    );
  const requestedModels =
    input.models && typeof input.models === "object"
      ? (input.models as Record<string, unknown>)
      : {};
  const geminiModel = requestedModels.gemini ?? defaults.providers.gemini.model;
  const openrouterModel =
    requestedModels.openrouter ?? defaults.providers.openrouter.model;
  if (!validModel(geminiModel) || !validModel(openrouterModel))
    return Response.json({ error: "Invalid model ID." }, { status: 400 });
  if (
    providerMode === "auto" &&
    openrouterModel !== "openrouter/free" &&
    !openrouterModel.endsWith(":free") &&
    !input.openrouterExplicit
  )
    return Response.json(
      {
        error:
          "Automatic OpenRouter fallback is free-only. Explicitly choose a paid model in Settings to allow its use.",
      },
      { status: 400 },
    );
  let history: Message[];
  let files: FileContext[];
  try {
    history = messages(input.history);
    files = attachments(input.files);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request." },
      { status: 400 },
    );
  }
  const scrub = (value: string): string =>
    credentials.reduce(
      (safe, c) => safe.split(c.key).join("[redacted]"),
      value,
    );
  history = history.map((m) => ({ ...m, content: scrub(m.content) }));
  files = files.map((f) => ({
    ...f,
    name: scrub(f.name),
    content: scrub(f.content),
  }));
  input.prompt = scrub(input.prompt as string);
  if (typeof input.summary === "string") input.summary = scrub(input.summary);
  const config: Config = structuredClone(defaults) as Config;
  config.providerMode = providerMode as Config["providerMode"];
  config.providers.gemini.enabled =
    providerMode === "gemini" ||
    (providerMode === "auto" &&
      credentials.some((c) => c.provider === "gemini"));
  config.providers.openrouter.enabled =
    providerMode === "openrouter" ||
    (providerMode === "auto" &&
      credentials.some((c) => c.provider === "openrouter"));
  config.providers.gemini.model = geminiModel;
  config.providers.openrouter.model = openrouterModel;
  if (providerMode === "openrouter") {
    config.model = openrouterModel;
  }
  const pool = new ApiKeyPool(credentials);
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) controller.abort();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    abort();
  }, 110_000);
  let disconnected = false;
  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      const encoder = new TextEncoder();
      const safeKeys = credentials.map((c) => c.key);
      const write = (type: string, data: unknown): void => {
        if (!disconnected)
          try {
            event(streamController, encoder, type, data);
          } catch {
            disconnected = true;
            controller.abort();
          }
      };
      void (async () => {
        try {
          const index = await localIndex();
          const client = new ProviderClient(
            config,
            pool,
            providerRegistry(),
            (message) => {
              if (
                /Partial draft discarded|Repairing validation errors/i.test(
                  message,
                )
              )
                write("reset", {});
              write("status", {
                message: providerErrorMessage(message, safeKeys),
              });
            },
          );
          const activeKey =
            credentials.find(
              (c) =>
                c.provider ===
                (providerMode === "openrouter" ? "openrouter" : "gemini"),
            )?.key ||
            credentials[0]?.key ||
            "";
          const assistant = new Assistant(
            config,
            index,
            client,
            undefined,
            activeKey,
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
              typeof input.filename === "string"
                ? scrub(input.filename)
                : undefined,
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
            provider:
              used || (providerMode === "auto" ? "gemini" : providerMode),
          });
          write("done", {});
        } catch (error) {
          const message = providerErrorMessage(error, safeKeys);
          if (timedOut)
            write("error", {
              message: "The provider request timed out. Try a smaller request.",
              code: "timeout",
            });
          else if (!controller.signal.aborted)
            write("error", {
              message,
              code: (error as { kind?: string })?.kind || "request_failed",
            });
          else write("stopped", {});
        } finally {
          clearTimeout(timeout);
          request.signal.removeEventListener("abort", abort);
          pool.destroy();
          for (const credential of credentials) credential.key = "";
          safeKeys.fill("");
          keyInput.gemini = "";
          keyInput.openrouter = "";
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
