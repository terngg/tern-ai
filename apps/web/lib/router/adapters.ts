import { providerById } from "./registry.js";
import { classify, PublicError, RouteError } from "./errors.js";
import { boundedJson, protectedFetch, type Transport } from "./transport.js";
import type { Connection, Model, Secret } from "./types.js";
import type { Message } from "../../../../src/openrouter/client.js";
export const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const number = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
function headers(secret: Secret, anthropic: boolean): Record<string, string> {
  return {
    ...secret.headers,
    "Content-Type": "application/json",
    ...(anthropic ? { "anthropic-version": "2023-06-01" } : {}),
    [secret.authHeader]: secret.authPrefix + secret.key,
  };
}
async function check(response: Response): Promise<void> {
  if (response.ok) return;
  let code = "";
  try {
    const body = await boundedJson(response, 16_384);
    const error = object(body.error);
    code = String(error.code || error.type || "");
    const message =
      typeof body.error === "string" ? body.error : String(error.message || "");
    // Official Gemini/xAI APIs can report invalid credentials as HTTP 400.
    if (
      response.status === 400 &&
      /(?:valid|incorrect|invalid) API key/i.test(message)
    )
      code = "invalid_api_key";
  } catch {
    /* HTTP status remains authoritative. */
  }
  throw classify(response.status, code, response.headers.get("retry-after"));
}
export async function discover(
  connection: Connection,
  secret: Secret,
  signal: AbortSignal,
  transport: Transport = protectedFetch,
): Promise<Model[]> {
  const p = providerById(connection.provider);
  if (!p?.protocol) throw new PublicError("Provider is unsupported.");
  // Authentication must be checked separately for OpenRouter: its model catalog is public.
  if (p.id === "openrouter")
    await check(
      await transport(connection.baseUrl + "/key", {
        headers: headers(secret, false),
        signal,
      }),
    );
  const models: Model[] = [];
  let after = "";
  for (let page = 0; page < 20; page++) {
    const response = await transport(
      connection.baseUrl +
        "/models" +
        (after ? "?after_id=" + encodeURIComponent(after) : ""),
      { headers: headers(secret, p.protocol === "anthropic"), signal },
    );
    await check(response);
    const data = await boundedJson(response);
    if (!Array.isArray(data) && !Array.isArray(data.data))
      throw new RouteError("server_error");
    const items = Array.isArray(data) ? data : list(data.data);
    for (const value of items) {
      const m = object(value);
      if (typeof m.id !== "string" || m.id.length > 200) continue;
      const model: Model = {
        id: m.id,
        name:
          typeof m.name === "string"
            ? m.name.slice(0, 200)
            : typeof m.display_name === "string"
              ? m.display_name.slice(0, 200)
              : m.id,
        source: "discovered",
      };
      const context =
        number(m.context_length) ||
        number(m.context_window) ||
        number(m.max_context_length);
      if (context) model.contextWindow = context;
      // OpenRouter explicitly documents pricing in USD/token. Other price schemas are not guessed.
      if (p.id === "openrouter") {
        const pricing = object(m.pricing);
        for (const [source, target] of [
          ["prompt", "inputPrice"],
          ["completion", "outputPrice"],
        ] as const) {
          const raw = pricing[source];
          if (
            typeof raw === "string" &&
            raw.trim() !== "" &&
            Number.isFinite(Number(raw)) &&
            Number(raw) >= 0
          )
            model[target] = Number(raw);
        }
      }
      models.push(model);
    }
    if (p.protocol !== "anthropic" || data.has_more !== true) break;
    if (typeof data.last_id !== "string" || data.last_id === after)
      throw new RouteError("server_error");
    after = data.last_id;
  }
  return models.slice(0, 5000);
}
export interface Inference {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}
export interface InferenceOptions {
  model: string;
  messages: Message[];
  stream: boolean;
  signal: AbortSignal;
  onToken?: (text: string) => void;
  maxTokens?: number;
}
/** Bounded incremental SSE framing handles UTF-8 and CRLF split across transport chunks. */
export async function consumeSSE(
  response: Response,
  onData: (data: string) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) throw new RouteError("stream_interrupted");
  const decoder = new TextDecoder();
  let pending = "",
    bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8_000_000) throw new RouteError("stream_interrupted");
      pending += decoder.decode(value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(pending))) {
        const frame = pending.slice(0, match.index);
        pending = pending.slice(match.index + match[0].length);
        const data = frame
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""))
          .join("\n");
        if (data) onData(data);
      }
      if (pending.length > 1_000_000)
        throw new RouteError("stream_interrupted");
    }
    pending += decoder.decode();
    if (pending.trim()) throw new RouteError("stream_interrupted");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function infer(
  connection: Connection,
  secret: Secret,
  options: InferenceOptions,
  transport: Transport = protectedFetch,
): Promise<Inference> {
  const p = providerById(connection.provider);
  if (!p?.protocol) throw new PublicError("Provider is unsupported.");
  const anthropic = p.protocol === "anthropic";
  const body = anthropic
    ? {
        model: options.model,
        max_tokens: options.maxTokens || 8192,
        stream: options.stream,
        system: options.messages
          .filter((m) => m.role === "system")
          .map((m) => m.content)
          .join("\n\n"),
        messages: options.messages.filter((m) => m.role !== "system"),
      }
    : {
        model: options.model,
        messages: options.messages,
        stream: options.stream,
        ...(p.id === "openai"
          ? { max_completion_tokens: options.maxTokens || 8192 }
          : { max_tokens: options.maxTokens || 8192 }),
        ...(options.stream &&
        [
          "openai",
          "openrouter",
          "groq",
          "deepseek",
          "together",
          "xai",
          "gemini",
          "openai-compatible",
        ].includes(p.id)
          ? { stream_options: { include_usage: true } }
          : {}),
      };
  const response = await transport(
    connection.baseUrl + (anthropic ? "/messages" : "/chat/completions"),
    {
      method: "POST",
      headers: headers(secret, anthropic),
      body: JSON.stringify(body),
      signal: options.signal,
    },
  );
  await check(response);
  let text = "",
    inputTokens: number | null = null,
    outputTokens: number | null = null,
    complete = false;
  const usage = (raw: unknown) => {
    const u = object(raw);
    inputTokens =
      number(u.input_tokens) ?? number(u.prompt_tokens) ?? inputTokens;
    outputTokens =
      number(u.output_tokens) ?? number(u.completion_tokens) ?? outputTokens;
  };
  const emit = (value: unknown) => {
    if (typeof value === "string") {
      text += value;
      if (text.length > 2_000_000) throw new RouteError("stream_interrupted");
      options.onToken?.(value);
    }
  };
  if (options.stream) {
    if (!response.headers.get("content-type")?.includes("text/event-stream"))
      throw new RouteError("server_error");
    await consumeSSE(response, (raw) => {
      if (raw === "[DONE]") {
        complete = true;
        return;
      }
      let data: Record<string, unknown>;
      try {
        data = object(JSON.parse(raw));
      } catch {
        throw new RouteError("stream_interrupted");
      }
      if (data.error || data.type === "error") {
        const e = object(data.error);
        throw classify(
          e.type === "overloaded_error"
            ? 529
            : typeof e.code === "number"
              ? e.code
              : 502,
          String(e.code || e.type || ""),
        );
      }
      usage(data.usage);
      if (anthropic) {
        if (data.type === "message_start") usage(object(data.message).usage);
        if (data.type === "content_block_delta") emit(object(data.delta).text);
        if (data.type === "message_stop") complete = true;
      } else {
        const choice = object(list(data.choices)[0]);
        emit(object(choice.delta).content);
        if (
          choice.finish_reason === "length" ||
          choice.finish_reason === "content_filter"
        )
          throw new RouteError("stream_interrupted");
      }
    });
    if (!complete) throw new RouteError("stream_interrupted");
  } else {
    const data = await boundedJson(response);
    if (data.error) throw new RouteError("server_error");
    usage(data.usage);
    if (anthropic) {
      if (data.stop_reason === "max_tokens")
        throw new RouteError("stream_interrupted");
      for (const part of list(data.content)) emit(object(part).text);
    } else {
      const c = object(list(data.choices)[0]);
      if (c.finish_reason === "length" || c.finish_reason === "content_filter")
        throw new RouteError("stream_interrupted");
      emit(object(c.message).content);
    }
  }
  if (!text) throw new RouteError("server_error");
  return { text, inputTokens, outputTokens };
}
