import { setTimeout as delay } from "node:timers/promises";
import type { StreamEvent } from "./types.js";

/** Drain the CLI independently of HTTP round trips. One ordered upload at a time. */
export async function relayStream(
  source: AsyncIterable<StreamEvent>,
  send: (event: StreamEvent, sequence: number) => Promise<void>,
  controller: AbortController,
  flushMs = 80,
): Promise<void> {
  let pending = "";
  let total = 0;
  let sequence = 0;
  let terminal: StreamEvent | undefined;
  let failure: unknown;
  let upload: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const drain = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (upload || failure) return;
    upload = (async () => {
      while (pending || terminal) {
        controller.signal.throwIfAborted();
        if (pending) {
          let size = Math.min(pending.length, 16_384);
          // Keep surrogate pairs together when a large buffered response is split.
          if (size < pending.length && /[\uD800-\uDBFF]/.test(pending[size - 1]!)) size--;
          const token = pending.slice(0, size);
          pending = pending.slice(size);
          await send({ type: "token", token }, sequence);
          sequence++;
        } else if (terminal) {
          const event = terminal;
          terminal = undefined;
          await send(event, sequence);
        }
      }
    })().catch(error => {
      failure = error;
      controller.abort();
    }).finally(() => { upload = undefined; });
  };
  try {
    let ended = false;
    for await (const event of source) {
      if (failure) throw failure;
      controller.signal.throwIfAborted();
      if (event.type === "token") {
        const token = event.token || "";
        total += token.length;
        if (total > 2_000_000) throw new Error("Local response exceeded the relay limit.");
        pending += token;
        if (pending.length >= 16_384) drain();
        else if (!timer && !upload) timer = setTimeout(drain, flushMs);
      } else {
        terminal = event;
        ended = true;
        break;
      }
    }
    if (!ended) throw new Error("Local stream ended without completion.");
    // An existing upload can finish while the producer delivers its final event.
    do { drain(); await upload; } while ((pending || terminal) && !failure);
    if (failure) throw failure;
  } finally {
    if (timer) clearTimeout(timer);
    await upload;
  }
}

/** Retry only an acknowledged, idempotent event; never expose credentials or bodies. */
export async function postRelayEvent(
  url: string,
  token: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  transport: typeof fetch = fetch,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted();
    let retry = true;
    try {
      const response = await transport(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]),
      });
      if (response.ok) {
        const ack = await response.json() as { ok?: boolean; sequence?: number };
        if (ack.ok && (body.sequence === undefined || ack.sequence === body.sequence)) return;
        retry = false;
      } else retry = response.status === 429 || response.status >= 500;
      await response.body?.cancel().catch(() => {});
    } catch { signal?.throwIfAborted(); }
    if (!retry || attempt === 2) throw new Error("Companion event delivery failed.");
    await delay(150 * 2 ** attempt, undefined, { ...(signal ? { signal } : {}) });
  }
}
