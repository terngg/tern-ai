import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { database, rateLimit, type Database } from "./store.js";
import { PublicError } from "./errors.js";
const derive = promisify(scrypt),
  hash = (v: string) => createHash("sha256").update(v).digest("hex");
export function sameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== new URL(request.url).origin)
  )
    throw new PublicError("Cross-origin requests are not accepted.", 403);
}
export async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${((await derive(password, salt, 64)) as Buffer).toString("hex")}`;
}
export async function passwordMatches(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, value] = stored.split(":");
  if (!salt || !value) return false;
  const actual = (await derive(password, salt, 64)) as Buffer,
    expected = Buffer.from(value, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function token(request: Request): string {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("tern_session="))
      ?.slice(13) || ""
  );
}
export async function authenticate(
  request: Request,
  db?: Database,
): Promise<{ id: string; email: string }> {
  sameOrigin(request);
  const raw = token(request);
  if (!/^[a-f0-9]{64}$/.test(raw))
    throw new PublicError(
      "Authentication required. Sign in to manage your providers.",
      401,
    );
  const { rows } = await (db || database()).query<{
    id: string;
    email: string;
  }>(
    "SELECT u.id,u.email FROM tern_sessions s JOIN tern_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [hash(raw)],
  );
  if (!rows[0]) throw new PublicError("Session expired. Sign in again.", 401);
  return rows[0];
}
export async function signIn(
  request: Request,
  input: Record<string, unknown>,
  db: Database = database(),
): Promise<Response> {
  sameOrigin(request);
  const email =
      typeof input.email === "string" ? input.email.trim().toLowerCase() : "",
    password = typeof input.password === "string" ? input.password : "";
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    password.length < 12 ||
    password.length > 256
  )
    throw new PublicError(
      "Enter an email and a password of 12–256 characters.",
    );
  // Only Vercel's trusted forwarding header is used for an additional IP bucket.
  await rateLimit("auth-email:" + hash(email), 10, 900_000, db);
  await rateLimit(
    "auth-ip:" + hash(request.headers.get("x-vercel-forwarded-for") || "local"),
    50,
    900_000,
    db,
  );
  let id: string;
  if (input.action === "register") {
    id = randomUUID();
    const encoded = await passwordHash(password);
    const result = await db.query(
      "INSERT INTO tern_users(id,email,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING RETURNING id",
      [id, email, encoded],
    );
    if (!result.rows.length)
      throw new PublicError("Unable to create account. Try signing in.", 400);
  } else {
    const { rows } = await db.query<{ id: string; password_hash: string }>(
      "SELECT id,password_hash FROM tern_users WHERE email=$1",
      [email],
    );
    const match = await passwordMatches(
      password,
      rows[0]?.password_hash ||
        "00000000000000000000000000000000:" + "00".repeat(64),
    );
    if (!rows[0] || !match)
      throw new PublicError("Invalid email or password.", 401);
    id = rows[0].id;
  }
  const session = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO tern_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)",
    [hash(session), id, new Date(Date.now() + 7 * 86400_000)],
  );
  return Response.json(
    { user: { id, email } },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": `tern_session=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
      },
    },
  );
}
export async function signOut(
  request: Request,
  db: Database = database(),
): Promise<Response> {
  sameOrigin(request);
  await db.query("DELETE FROM tern_sessions WHERE token_hash=$1", [
    hash(token(request)),
  ]);
  return Response.json(
    { ok: true },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie":
          "tern_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure",
      },
    },
  );
}
