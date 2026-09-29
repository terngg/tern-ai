import {
  GeminiProvider,
  OpenRouterProvider,
  type ProviderId,
} from "@tern-ai/core";
import {
  readJson,
  validKey,
  providerErrorMessage,
  guardRequest,
} from "../../../../lib/server.js";
export const runtime = "nodejs";
const providers = {
  gemini: new GeminiProvider(),
  openrouter: new OpenRouterProvider(),
};
export async function POST(request: Request): Promise<Response> {
  const blocked = guardRequest(request, "provider");
  if (blocked) return blocked;
  let body: Record<string, unknown>;
  try {
    body = await readJson(request);
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const provider = body.provider;
  if (provider !== "gemini" && provider !== "openrouter")
    return Response.json({ error: "Unknown provider." }, { status: 400 });
  const rawKey = typeof body.key === "string" ? body.key.trim() : "";
  if (!validKey(provider as ProviderId, rawKey))
    return Response.json({ error: "Invalid API key format." }, { status: 400 });
  let key = rawKey;
  try {
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(15_000),
    ]);
    const models = await providers[provider].listModels(key, signal);
    return Response.json(
      { models },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: providerErrorMessage(error, [key]) },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    body.key = "";
    key = "";
  }
}
