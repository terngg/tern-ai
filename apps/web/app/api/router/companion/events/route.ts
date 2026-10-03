import { NextResponse } from "next/server";
import { CompanionRelay } from "../../../../../lib/router/companion-relay.js";
import { PublicError } from "../../../../../lib/router/errors.js";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer /i, "").trim();
    const url = new URL(request.url);
    const companionId = url.searchParams.get("companionId") || "";

    if (!token || !companionId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const relay = new CompanionRelay();
    await relay.authenticateCompanion(companionId, token);
    const jobs = await relay.pollPendingJobs(companionId);

    const cancels = await relay.pollCancelledJobs(companionId);
    return NextResponse.json({ jobs, cancels });
  } catch (err: unknown) {
    if (err instanceof PublicError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to poll events" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer /i, "").trim();
    const body = (await request.json().catch(() => ({}))) as {
      companionId?: string;
      jobId?: string;
      type?: "token" | "done" | "error";
      token?: string;
      error?: string;
      category?: string;
      sequence?: number;
      usage?: { inputTokens: number; outputTokens: number };
    };

    if (!token || !body.companionId || !body.jobId || !body.type) {
      return NextResponse.json({ error: "Invalid event payload" }, { status: 400 });
    }

    if (!["token", "done", "error"].includes(body.type) ||
      (body.type === "token" && (typeof body.token !== "string" || !body.token.length || body.token.length > 65_536)) ||
      (body.sequence !== undefined && (!Number.isSafeInteger(body.sequence) || body.sequence < 0 || body.sequence > 2_000_000))) {
      return NextResponse.json({ error: "Invalid event payload" }, { status: 400 });
    }
    const relay = new CompanionRelay();
    await relay.authenticateCompanion(body.companionId, token);
    await relay.appendJobEvent(body.companionId, body.jobId, {
      type: body.type,
      token: body.token,
      error: body.error,
      category: body.category,
      ...(body.usage === undefined ? {} : { usage: body.usage }),
      ...(body.sequence === undefined ? {} : { sequence: body.sequence }),
    });

    return NextResponse.json({ ok: true, ...(body.sequence === undefined ? {} : { sequence: body.sequence }) });
  } catch (err: unknown) {
    if (err instanceof PublicError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Event processing failed" }, { status: 500 });
  }
}
