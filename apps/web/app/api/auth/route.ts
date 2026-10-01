import { authenticate, signIn, signOut } from "../../../lib/router/auth.js";
import { safeError } from "../../../lib/router/errors.js";
import { readJson } from "../../../lib/server.js";
export const runtime = "nodejs";
export async function GET(request: Request): Promise<Response> {
  try {
    return Response.json(
      { user: await authenticate(request) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return safeError(e);
  }
}
export async function POST(request: Request): Promise<Response> {
  try {
    return await signIn(request, await readJson(request));
  } catch (e) {
    return safeError(e);
  }
}
export async function DELETE(request: Request): Promise<Response> {
  try {
    return await signOut(request);
  } catch (e) {
    return safeError(e);
  }
}
