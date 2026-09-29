import type { ProviderId } from "@tern-ai/core";
import {
  readJson,
  validKey,
  validModel,
  providerErrorMessage,
  testCredential,
  guardRequest,
} from "../../../../lib/server.js";
export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  const blocked = guardRequest(request, "provider");
  if (blocked) return blocked;
  let body: Record<string, unknown>;
  try {
    body = await readJson(request);
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (body.provider !== "gemini" && body.provider !== "openrouter")
    return Response.json({ error: "Unknown provider." }, { status: 400 });
  const rawKey = typeof body.key === "string" ? body.key.trim() : "";
  if (
    !validKey(body.provider as ProviderId, rawKey) ||
    !validModel(body.model)
  )
    return Response.json({ error: "Invalid key or model." }, { status: 400 });
  let key = rawKey;
  try {
    await testCredential(
      body.provider as ProviderId,
      key,
      body.model,
      AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
    );
    return Response.json(
      { ok: true },
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
