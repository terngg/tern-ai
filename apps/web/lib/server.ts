import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ApiIndex, parseDocs } from "@tern-ai/core";
import type { ProviderId } from "@tern-ai/core";
import { GeminiProvider, OpenRouterProvider } from "@tern-ai/core";

export const MAX_BODY = 300_000;
export const MAX_UPLOAD = 16_384;
const limits = new Map<string, { started: number; count: number }>();
const secretPattern = {
  gemini: /^(?:AIza[\w-]{20,}|AQ\.[\w.-]{20,}|[\w.-]{20,})$/,
  openrouter: /^sk-or-[\w-]{12,}$/,
};
export function validKey(provider: ProviderId, key: unknown): key is string {
  if (typeof key !== "string") return false;
  const trimmed = key.trim();
  return (
    trimmed.length <= 1024 &&
    trimmed.length >= 20 &&
    !/\s/.test(trimmed) &&
    secretPattern[provider].test(trimmed)
  );
}
export function validModel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 160 &&
    /^[\w.:/-]+$/.test(value) &&
    !value.includes("..")
  );
}
export function guardRequest(
  request: Request,
  kind: "generate" | "provider",
): Response | undefined {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return Response.json(
      { error: "Cross-origin requests are not accepted." },
      { status: 403 },
    );
  if (origin)
    try {
      if (new URL(origin).host !== request.headers.get("host"))
        return Response.json(
          { error: "Cross-origin requests are not accepted." },
          { status: 403 },
        );
    } catch {
      return Response.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    }
  const forwarded =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now(),
    windowMs = 60_000,
    limit = kind === "generate" ? 12 : 30;
  let bucket = limits.get(forwarded);
  if (!bucket || now - bucket.started >= windowMs) {
    bucket = { started: now, count: 0 };
    if (limits.size >= 10_000) {
      const oldest = limits.keys().next().value;
      if (oldest) limits.delete(oldest);
    }
    limits.set(forwarded, bucket);
  }
  if (++bucket.count > limit)
    return Response.json(
      { error: "Too many requests. Wait a minute and try again." },
      {
        status: 429,
        headers: { "Retry-After": "60", "Cache-Control": "no-store" },
      },
    );
  if (limits.size > 10_000)
    for (const [ip, value] of limits)
      if (now - value.started >= windowMs) limits.delete(ip);
  return undefined;
}
export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY) throw new Error("Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Request body is required.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY) {
        await reader.cancel();
        throw new Error("Request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks),
  );
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON request.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid request.");
  return value as Record<string, unknown>;
}
let bundledIndex: Promise<ApiIndex> | undefined;
export function localIndex(): Promise<ApiIndex> {
  // Next local workspace and traced serverless bundles can have different cwd.
  // Read only these bundled documentation paths; never user-uploaded files.
  bundledIndex ??= (async () => {
    for (const path of [
      resolve(process.cwd(), "../../docs/gtps-lua-api.md"),
      resolve(process.cwd(), "docs/gtps-lua-api.md"),
    ]) {
      try {
        return new ApiIndex(parseDocs(await readFile(path, "utf8")));
      } catch {
        /* Try the other bundle layout. */
      }
    }
    bundledIndex = undefined;
    throw new Error("The bundled GTPS API documentation is unavailable.");
  })();
  return bundledIndex;
}
export function maskKey(key: string): string {
  return key.length > 8 ? `${key.slice(0, 4)}••••${key.slice(-4)}` : "••••••••";
}
export function providerErrorMessage(error: unknown, keys: string[]): string {
  const kind =
    error && typeof error === "object" && "kind" in error
      ? String((error as { kind: unknown }).kind)
      : "";
  const messages: Record<string, string> = {
    auth: "Invalid API key. Check your provider key in Settings.",
    rate_limit: "Provider rate limit reached. Wait a moment, then retry.",
    quota:
      "Provider quota is exhausted. Wait for the quota to reset or choose another configured provider.",
    model_not_found:
      "Selected model is unavailable. Refresh the model list in Settings.",
    billing:
      "The provider requires billing. No paid model was selected automatically.",
    permission:
      "The provider denied access. Check API and project permissions.",
    timeout: "The provider request timed out. Try again.",
    network:
      "Could not connect to the AI provider. Check your connection and retry.",
    server: "The AI provider encountered a server error. Retry in a moment.",
    aborted: "Generation stopped.",
    bad_request:
      "The provider rejected this request. Check prompt, file size, and model settings.",
  };
  let message =
    messages[kind] ||
    (error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Provider request failed.");
  for (const key of keys)
    if (key) message = message.split(key).join("[redacted]");
  return message
    .replace(/(?:AIza[\w-]{20,}|AQ\.[\w.-]{20,}|sk-or-[\w-]{12,})/g, "[redacted]")
    .slice(0, 400);
}
export async function testCredential(
  provider: ProviderId,
  key: string,
  model: string,
  signal?: AbortSignal,
): Promise<void> {
  const adapter =
    provider === "gemini" ? new GeminiProvider() : new OpenRouterProvider();
  await adapter.testConnection(key, model, signal);
}
