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
    };

    if (!token || !body.companionId || !body.jobId || !body.type) {
      return NextResponse.json({ error: "Invalid event payload" }, { status: 400 });
    }

    const relay = new CompanionRelay();
    await relay.authenticateCompanion(body.companionId, token);
    await relay.appendJobEvent(body.companionId, body.jobId, {
      type: body.type,
      token: body.token,
      error: body.error,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    if (err instanceof PublicError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Event processing failed" }, { status: 500 });
  }
}
