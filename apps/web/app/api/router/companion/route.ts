import { NextResponse } from "next/server";
import { authenticate } from "../../../../lib/router/auth.js";
import { CompanionRelay } from "../../../../lib/router/companion-relay.js";
import { PublicError } from "../../../../lib/router/errors.js";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await authenticate(request);
    const relay = new CompanionRelay();
    const status = await relay.getCompanionStatus(user.id);
    return NextResponse.json(status);
  } catch (err: unknown) {
    if (err instanceof PublicError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to get companion status" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await authenticate(request);
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const relay = new CompanionRelay();

    if (body.action === "pair-code") {
      const pair = await relay.generatePairCode(user.id);
      return NextResponse.json(pair);
    }

    throw new PublicError("Invalid action", 400);
  } catch (err: unknown) {
    if (err instanceof PublicError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Companion request failed" }, { status: 500 });
  }
}
