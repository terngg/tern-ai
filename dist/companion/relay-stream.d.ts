import type { StreamEvent } from "./types.js";
/** Drain the CLI independently of HTTP round trips. One ordered upload at a time. */
export declare function relayStream(source: AsyncIterable<StreamEvent>, send: (event: StreamEvent, sequence: number) => Promise<void>, controller: AbortController, flushMs?: number): Promise<void>;
/** Retry only an acknowledged, idempotent event; never expose credentials or bodies. */
export declare function postRelayEvent(url: string, token: string, body: Record<string, unknown>, signal?: AbortSignal, transport?: typeof fetch): Promise<void>;
