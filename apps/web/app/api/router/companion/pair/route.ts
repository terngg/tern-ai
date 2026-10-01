import { NextResponse } from "next/server";
import { CompanionRelay } from "../../../../../lib/router/companion-relay.js";
import { PublicError } from "../../../../../lib/router/errors.js";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      code?: string;
      platform?: string;
      label?: string;
    };
    if (!body.code) {
      return NextResponse.json({ error: "Pairing code required" }, { status: 400 });
    }

    const relay = new CompanionRelay();
    const result = await relay.redeemPairCode(
      body.code,
      body.platform || "unknown",
      body.label || "companion",
    );

    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof PublicError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Pairing failed" }, { status: 500 });
  }
}
