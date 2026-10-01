import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { PublicError } from "./errors.js";
function key(): Buffer {
  const raw = process.env.TERN_CREDENTIAL_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(raw))
    throw new PublicError(
      "Router storage is not configured: TERN_CREDENTIAL_KEY must be a server-side 32-byte hex secret.",
      503,
    );
  return Buffer.from(raw, "hex");
}
export function encrypt(value: unknown, owner: string, id: string): string {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`${owner}:${id}:v1`));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    data.toString("base64"),
  ].join(".");
}
export function decrypt<T>(value: string, owner: string, id: string): T {
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1" || !iv || !tag || !data)
    throw new Error("Invalid secret envelope");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64"),
  );
  cipher.setAAD(Buffer.from(`${owner}:${id}:v1`));
  cipher.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(data, "base64")),
      cipher.final(),
    ]).toString("utf8"),
  ) as T;
}
