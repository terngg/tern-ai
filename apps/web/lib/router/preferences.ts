import { PublicError } from "./errors.js";

export function preferredProvider(value: unknown): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^[a-z0-9-]{1,80}$/.test(value))
    throw new PublicError("Invalid preferred provider.");
  return value;
}
