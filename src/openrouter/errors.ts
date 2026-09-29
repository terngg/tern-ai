import { record, TernError } from '../utils/errors.js';
import { redact, terminalText } from '../utils/security.js';

export type RouterErrorKind = 'http' | 'provider' | 'protocol' | 'network' | 'timeout';
interface ErrorOptions { kind?: RouterErrorKind; retryAfterMs?: number | undefined }
export class RouterError extends TernError {
  readonly kind: RouterErrorKind;
  readonly retryAfterMs: number | undefined;
  constructor(public readonly status: number, detail?: string, options: ErrorOptions = {}) {
    const kind = options.kind || 'http';
    const messages: Record<number, string> = {
      401: 'OpenRouter authentication failed. Run tern auth or check OPENROUTER_API_KEY.',
      402: 'OpenRouter rejected the request for insufficient credits/account balance. No paid fallback was used.',
      403: 'OpenRouter refused this request. Check account permissions, provider policy, or guardrails.',
      404: 'OpenRouter model is unavailable. Run tern models to choose another model.',
      408: 'OpenRouter request timed out. Try again or choose another free model with: tern models',
      429: 'OpenRouter rate limit reached. Try another free model with: tern models',
      502: 'OpenRouter provider failed. Try another free model with: tern models',
      503: 'OpenRouter has no available provider for this model. Run tern models.',
    };
    const summary = kind === 'network' ? 'Cannot connect to OpenRouter.'
      : kind === 'protocol' ? 'OpenRouter returned an invalid or incomplete response.'
      : messages[status] || (status >= 500 ? 'OpenRouter is temporarily unavailable.' : 'OpenRouter request failed.');
    const label = kind === 'http' ? ` (HTTP ${status})` : kind === 'provider' ? ` (provider error ${status})` : '';
    const retry = options.retryAfterMs === undefined ? '' : `\nRetry after ${Math.ceil(options.retryAfterMs / 1000)} seconds.`;
    super(summary + label + (detail ? '\n' + detail : '') + retry);
    this.kind = kind;
    this.retryAfterMs = options.retryAfterMs;
  }
  get retryable(): boolean {
    return this.kind === 'network' || this.kind === 'protocol' || [404, 408, 429].includes(this.status) || this.status >= 500;
  }
}
export function protocolError(detail: string): RouterError {
  return new RouterError(502, detail, { kind: 'protocol' });
}
export function retryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value?.trim()) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1000 : undefined;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
}
const providerCodes: Record<string, number> = {
  server_error: 502, provider_error: 502, provider_unavailable: 503,
  rate_limit_exceeded: 429, rate_limit_error: 429,
  authentication_error: 401, invalid_api_key: 401,
  insufficient_credits: 402, insufficient_quota: 402,
  invalid_request_error: 400, context_length_exceeded: 400,
  permission_denied: 403, content_policy_violation: 403,
};
export function responseError(value: unknown, secret = '', httpStatus?: number, retryAfterMs?: number): RouterError | undefined {
  if (!record(value) || !record(value.error)) return undefined;
  const error = value.error;
  const numeric = Number(error.code);
  const status = httpStatus ?? (Number.isInteger(numeric) && numeric >= 400 && numeric <= 599 ? numeric
    : typeof error.code === 'string' ? providerCodes[error.code] || 502 : 502);
  // Never dump metadata/raw upstream responses, request headers, or the request body.
  const detail = typeof error.message === 'string'
    ? terminalText(redact(error.message, secret)).replace(/\s+/g, ' ').trim().slice(0, 600) : undefined;
  return new RouterError(status, detail, { kind: httpStatus === undefined ? 'provider' : 'http', retryAfterMs });
}
export function networkError(error: unknown): RouterError {
  const hints: Record<string, string> = {
    ENOTFOUND: 'DNS lookup failed. Check DNS and access to openrouter.ai from this server.',
    EAI_AGAIN: 'DNS lookup temporarily failed. Check DNS and retry.',
    ECONNREFUSED: 'Connection refused. Check outbound HTTPS access or proxy settings.',
    ECONNRESET: 'The HTTPS connection was reset while communicating with OpenRouter.',
    UND_ERR_SOCKET: 'The HTTPS connection closed unexpectedly.',
    ETIMEDOUT: 'The HTTPS connection timed out. Check outbound HTTPS access.',
    UND_ERR_CONNECT_TIMEOUT: 'Connection to OpenRouter timed out. Check outbound HTTPS access.',
    CERT_HAS_EXPIRED: 'HTTPS certificate has expired. Check the server clock and certificate configuration.',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'HTTPS certificate verification failed. Check the server CA/proxy certificate configuration.',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'HTTPS certificate verification failed: self-signed certificate.',
  };
  let current: unknown = error;
  for (let depth = 0; depth < 5 && record(current); depth++) {
    const code = current.code;
    if (typeof code === 'string' && hints[code]) return new RouterError(0, `${hints[code]} (${code})`, { kind: 'network' });
    current = current.cause;
  }
  return new RouterError(0, 'The HTTPS connection failed or disconnected. Check network access and try again.', { kind: 'network' });
}
