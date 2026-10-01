import { NextResponse } from "next/server";
import { CompanionRelay } from "../../../../../lib/router/companion-relay.js";
import { PublicError } from "../../../../../lib/router/errors.js";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer /i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "Authorization required" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      companionId?: string;
      platform?: string;
      label?: string;
      detectedProviders?: unknown[];
    };

    if (!body.companionId) {
      return NextResponse.json({ error: "companionId required" }, { status: 400 });
    }

    const relay = new CompanionRelay();
    await relay.authenticateCompanion(body.companionId, token);
    await relay.syncHeartbeat(
      body.companionId,
      body.platform || "unknown",
      body.label || "companion",
      (body.detectedProviders || []) as import("../../../../../lib/router/types.js").DetectedLocalProvider[],
    );

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof PublicError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Heartbeat failed" }, { status: 500 });
  }
}
