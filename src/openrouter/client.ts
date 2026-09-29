import { TernError } from '../utils/errors.js';
import { SSEParser } from './sse.js';
import { networkError, protocolError, responseError, retryAfter, RouterError } from './errors.js';
import { contentFromResponse } from './response.js';
export { RouterError } from './errors.js';
export { contentFromResponse } from './response.js';
export const BASE_URL = 'https://openrouter.ai/api/v1';
export interface Message { role: 'system' | 'user' | 'assistant'; content: string }
export interface CompletionOptions {
  model: string; messages: Message[]; temperature: number; stream: boolean; free: boolean;
  onToken?: (token: string) => void; signal?: AbortSignal;
}
/** Read only a bounded JSON error envelope. Never print arbitrary HTML/proxy pages. */
async function httpError(response: Response, secret: string): Promise<RouterError> {
  const wait = retryAfter(response.headers.get('retry-after'));
  const fallback = new RouterError(response.status, undefined, { retryAfterMs: wait });
  if (!response.body || !response.headers.get('content-type')?.toLowerCase().includes('json')) return fallback;
  const reader = response.body.getReader();
  try {
    let bytes = 0; const parts: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16_384) return fallback;
      parts.push(value);
    }
    const value: unknown = JSON.parse(Buffer.concat(parts).toString('utf8'));
    return responseError(value, secret, response.status, wait) || fallback;
  } catch {
    // Malformed/unreadable error bodies must not erase the actual HTTP status.
    return fallback;
  } finally {
    await reader.cancel().catch(() => undefined); // A failed transport may already have closed the reader.
    reader.releaseLock();
  }
}
export class OpenRouterClient {
  constructor(private readonly key: string, private readonly fetcher: typeof fetch = fetch, private readonly timeoutMs = 120_000) {}
  async get(path: '/models' | '/key', signal?: AbortSignal): Promise<unknown> {
    const combined = AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]);
    try {
      const response = await this.fetcher(BASE_URL + path, {
        headers: this.key ? { Authorization: `Bearer ${this.key}` } : {}, redirect: 'error', signal: combined,
      });
      if (!response.ok) throw await httpError(response, this.key);
      try { return await response.json() as unknown; }
      catch (error) { if (error instanceof SyntaxError) throw protocolError('OpenRouter returned malformed JSON.'); throw error; }
    } catch (error) { throw this.translate(error, signal, combined); }
  }
  async complete(options: CompletionOptions): Promise<string> {
    const signal = AbortSignal.any([AbortSignal.timeout(this.timeoutMs), ...(options.signal ? [options.signal] : [])]);
    try {
      const response = await this.fetcher(BASE_URL + '/chat/completions', {
        method: 'POST', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', 'X-Title': 'Tern AI' },
        body: JSON.stringify({
          model: options.model, messages: options.messages, stream: options.stream,
          temperature: options.temperature, max_tokens: 8192,
          ...(options.free ? { provider: { max_price: { prompt: 0, completion: 0, request: 0, image: 0 } } } : {}),
        }),
      });
      if (!response.ok) throw await httpError(response, this.key);
      const contentType = response.headers.get('content-type')?.toLowerCase() || '';
      // Even a stream request can fail with a JSON envelope, or receive a complete JSON reply.
      if (!options.stream || contentType.includes('json')) {
        let value: unknown;
        try { value = await response.json() as unknown; }
        catch (error) { if (error instanceof SyntaxError) throw protocolError('OpenRouter returned malformed JSON.'); throw error; }
        const { text } = contentFromResponse(value, false, this.key);
        if (!text.trim()) throw protocolError('OpenRouter returned no response text. Select another text model with: tern models');
        if (Buffer.byteLength(text) > 262_144) throw new TernError('Model response exceeded the 256 KiB safety limit.');
        options.onToken?.(text); return text;
      }
      if (!response.body || !contentType.includes('text/event-stream')) throw protocolError('Expected an SSE stream or JSON response. Check whether a proxy is replacing the response.');
      let output = ''; let done = false; let bytes = 0;
      const parser = new SSEParser(data => {
        if (done) return;
        if (data === '[DONE]') { done = true; return; }
        let value: unknown;
        try { value = JSON.parse(data) as unknown; } catch { throw protocolError('The SSE stream contains malformed JSON.'); }
        const { text } = contentFromResponse(value, true, this.key);
        output += text; bytes += Buffer.byteLength(text);
        if (bytes > 262_144) throw new TernError('Model response exceeded the 256 KiB safety limit.');
        if (text) options.onToken?.(text);
      });
      const reader = response.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true });
      const decode = (value?: Uint8Array): string => {
        try { return decoder.decode(value, { stream: value !== undefined }); }
        catch { throw protocolError('The SSE stream contains invalid UTF-8.'); }
      };
      try {
        while (!done) {
          const chunk = await reader.read();
          if (chunk.done) break;
          parser.feed(decode(chunk.value));
        }
        parser.feed(decode(), true);
      } finally {
        await reader.cancel().catch(() => undefined); // Preserve the primary error if the transport already failed.
        reader.releaseLock();
      }
      if (!done) throw protocolError('The SSE stream ended before [DONE]. Incomplete output was discarded. Try tern config set stream false or select another free model.');
      if (!output.trim()) throw protocolError('OpenRouter returned no response text (possibly reasoning only). Select another text model with: tern models');
      return output;
    } catch (error) { throw this.translate(error, options.signal, signal); }
  }
  private translate(error: unknown, userSignal?: AbortSignal, timeoutSignal?: AbortSignal): Error {
    if (userSignal?.aborted) return new TernError('Request cancelled.', 130);
    if (timeoutSignal?.aborted || (error instanceof Error && error.name === 'TimeoutError')) return new RouterError(408, undefined, { kind: 'timeout' });
    if (error instanceof TernError) return error;
    return networkError(error);
  }
}
