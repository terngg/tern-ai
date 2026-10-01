// SSRF policy adapted and strengthened from TernRouter src/lib/network/ssrf.js (MIT).
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import ipaddr from "ipaddr.js";
import { PublicError, RouteError } from "./errors.js";
export function isPublicAddress(value: string): boolean {
  try {
    const parsed = ipaddr.process(value);
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}
export function parseTarget(value: string, allowQuery = false): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PublicError("Enter a valid HTTPS API base URL.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    (!allowQuery && !!url.search) ||
    (url.port && url.port !== "443") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "instance-data" ||
    (isIP(host) && !isPublicAddress(host))
  )
    throw new PublicError(
      "Only public HTTPS API endpoints on port 443 are allowed. Local endpoints require Tern Companion.",
    );
  return url;
}
export async function resolveTarget(
  value: string,
  allowQuery = false,
): Promise<{ url: URL; address: string; family: number }> {
  const url = parseTarget(value, allowQuery),
    host = url.hostname.replace(/^\[|\]$/g, "");
  const records = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true });
  if (!records.length || records.some((r) => !isPublicAddress(r.address)))
    throw new PublicError("Provider address is not a public internet address.");
  return { url, address: records[0]!.address, family: records[0]!.family };
}
export type Transport = (
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal: AbortSignal;
  },
) => Promise<Response>;
/** DNS is resolved once, checked in full and pinned in the TLS socket lookup. No redirects. */
export const protectedFetch: Transport = async (value, init) => {
  const { url, address, family } = await resolveTarget(value, true);
  init.signal.throwIfAborted();
  return new Promise<Response>((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: init.method || "GET",
        headers: init.headers,
        signal: init.signal,
        lookup: (_host, options, callback) => {
          if (options.all) callback(null, [{ address, family }]);
          else callback(null, address, family);
        },
      },
      (res) => {
        const status = res.statusCode || 502;
        if (status >= 300 && status < 400) {
          res.destroy();
          reject(new PublicError("Provider redirects are not allowed."));
          return;
        }
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers))
          if (v !== undefined)
            headers.set(k, Array.isArray(v) ? v.join(", ") : v);
        resolve(
          new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, {
            status,
            headers,
          }),
        );
      },
    );
    req.on("error", () =>
      reject(new RouteError(init.signal.aborted ? "timeout" : "network")),
    );
    req.end(init.body);
  });
};
export async function boundedJson(
  response: Response,
  maxBytes = 2_000_000,
): Promise<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) throw new RouteError("server_error");
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new RouteError("server_error");
      parts.push(value);
    }
    const data: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!data || typeof data !== "object") throw new RouteError("server_error");
    return data as Record<string, unknown>;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
