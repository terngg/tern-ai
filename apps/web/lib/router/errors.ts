// Adapted classification concepts from TernRouter/9Router (MIT); see licenses/TernRouter-MIT.txt.
import type { ErrorCategory } from "./types.js";
const messages: Record<ErrorCategory, string> = {
  auth_failure: "Authentication failed.",
  permission_denied: "Provider denied access.",
  bad_request: "Provider rejected the request or model.",
  rate_limit: "Provider rate limited this connection.",
  quota_exhausted: "Provider quota is exhausted.",
  timeout: "Provider request timed out.",
  stream_interrupted:
    "Provider stream was interrupted. Partial output was not continued with another provider.",
  provider_overload: "Provider is overloaded.",
  server_error: "Provider returned a server error.",
  network: "Provider could not be reached.",
  cancelled: "Request cancelled.",
};
export class RouteError extends Error {
  constructor(
    public category: ErrorCategory,
    public status = 502,
    public retryAfterMs = 0,
  ) {
    super(messages[category]);
  }
}
export class PublicError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function classify(
  status: number,
  code = "",
  retryAfter: string | null = null,
): RouteError {
  const delay = retryAfter
    ? Math.max(
        0,
        Number.isFinite(Number(retryAfter))
          ? Number(retryAfter) * 1000
          : Date.parse(retryAfter) - Date.now(),
      )
    : 0;
  const category: ErrorCategory =
    status === 401 || code === "invalid_api_key"
      ? "auth_failure"
      : status === 402 ||
          /insufficient_quota|quota_exceeded|billing_hard_limit|credit_balance/i.test(
            code,
          )
        ? "quota_exhausted"
        : status === 403
          ? "permission_denied"
          : status === 429
            ? "rate_limit"
            : status === 408 || status === 504
              ? "timeout"
              : status === 503 || status === 529
                ? "provider_overload"
                : status >= 500
                  ? "server_error"
                  : "bad_request";
  return new RouteError(category, status, Math.min(delay || 0, 1_800_000));
}
export const transient = (e: RouteError) =>
  [
    "rate_limit",
    "timeout",
    "provider_overload",
    "server_error",
    "network",
  ].includes(e.category);
export function safeError(error: unknown): Response {
  const known = error instanceof PublicError || error instanceof RouteError;
  return Response.json(
    {
      error: known ? error.message : "Router operation failed.",
      ...(error instanceof RouteError ? { category: error.category } : {}),
    },
    {
      status: known ? error.status : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
