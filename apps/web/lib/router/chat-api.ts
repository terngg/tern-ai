import { randomUUID } from "node:crypto";
import { authenticate } from "./auth.js";
import { RouterStore, rateLimit } from "./store.js";
import { RoutedClient } from "./engine.js";
import { PublicError, RouteError, safeError } from "./errors.js";
import { readJson } from "../server.js";
import type { Message } from "../../../../src/openrouter/client.js";
/** Text chat compatibility endpoints. Tools/images are rejected, never silently dropped. */
export async function chatApi(
  request: Request,
  protocol: "openai" | "anthropic",
): Promise<Response> {
  try {
    const user = await authenticate(request);
    await rateLimit("generate:" + user.id, 12);
    const input = await readJson(request);
    if (input.tools || input.tool_choice || input.response_format)
      throw new PublicError("This endpoint currently supports text chat only.");
    if (
      !Array.isArray(input.messages) ||
      !input.messages.length ||
      input.messages.length > 50
    )
      throw new PublicError("Supply 1–50 text messages.");
    const messages: Message[] = input.messages.map((value) => {
      if (!value || typeof value !== "object")
        throw new PublicError("Invalid message.");
      const m = value as Record<string, unknown>;
      if (
        !["system", "user", "assistant"].includes(String(m.role)) ||
        typeof m.content !== "string"
      )
        throw new PublicError(
          "Only text system, user and assistant messages are supported.",
        );
      return { role: m.role as Message["role"], content: m.content };
    });
    if (protocol === "anthropic" && input.system !== undefined) {
      if (typeof input.system !== "string")
        throw new PublicError("System must be text.");
      messages.unshift({ role: "system", content: input.system });
    }
    if (
      messages.reduce((n, m) => n + Buffer.byteLength(m.content), 0) > 100_000
    )
      throw new PublicError("Message context is too large.");
    const model = typeof input.model === "string" ? input.model : "auto";
    if (model.length > 400) throw new PublicError("Model ID too long.");
    if (input.stream !== undefined && typeof input.stream !== "boolean")
      throw new PublicError("Stream must be a boolean.");
    const maxTokens = input.max_tokens ?? input.max_completion_tokens ?? 8192;
    if (
      typeof maxTokens !== "number" ||
      !Number.isInteger(maxTokens) ||
      maxTokens < 1 ||
      maxTokens > 8192
    )
      throw new PublicError("Token limit must be 1–8192.");
    const client = new RoutedClient(
      new RouterStore(user.id),
      model,
      typeof input.poolId === "string" ? input.poolId : undefined,
      undefined,
      maxTokens,
    );
    const controller = new AbortController(),
      signal = AbortSignal.any([
        request.signal,
        controller.signal,
        AbortSignal.timeout(105_000),
      ]);
    const options = {
      model,
      messages,
      stream: input.stream === true,
      temperature: 0,
      free: false,
      signal,
    };
    const id = "chatcmpl-" + randomUUID(),
      created = Math.floor(Date.now() / 1000);
    if (!options.stream) {
      const content = await client.complete(options);
      return Response.json(
        protocol === "openai"
          ? {
              id,
              object: "chat.completion",
              created,
              model: client.lastModel,
              choices: [
                {
                  index: 0,
                  message: { role: "assistant", content },
                  finish_reason: "stop",
                },
              ],
            }
          : {
              id,
              type: "message",
              role: "assistant",
              model: client.lastModel,
              content: [{ type: "text", text: content }],
              stop_reason: "end_turn",
            },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const encoder = new TextEncoder();
    let disconnected = false;
    const stream = new ReadableStream<Uint8Array>({
      start(output) {
        const send = (event: string, data: unknown) => {
          if (disconnected) return;
          try {
            output.enqueue(
              encoder.encode(
                `${protocol === "anthropic" ? "event: " + event + "\n" : ""}data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`,
              ),
            );
          } catch {
            disconnected = true;
            controller.abort();
          }
        };
        void (async () => {
          try {
            if (protocol === "anthropic") {
              send("message_start", {
                type: "message_start",
                message: {
                  id,
                  type: "message",
                  role: "assistant",
                  model,
                  content: [],
                },
              });
              send("content_block_start", {
                type: "content_block_start",
                index: 0,
                content_block: { type: "text", text: "" },
              });
            }
            await client.complete({
              ...options,
              onToken: (content) =>
                send(
                  protocol === "openai" ? "message" : "content_block_delta",
                  protocol === "openai"
                    ? {
                        id,
                        object: "chat.completion.chunk",
                        created,
                        model,
                        choices: [
                          { index: 0, delta: { content }, finish_reason: null },
                        ],
                      }
                    : {
                        type: "content_block_delta",
                        index: 0,
                        delta: { type: "text_delta", text: content },
                      },
                ),
            });
            if (protocol === "openai") {
              send("message", {
                id,
                object: "chat.completion.chunk",
                created,
                model: client.lastModel,
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
              });
              send("message", "[DONE]");
            } else {
              send("content_block_stop", {
                type: "content_block_stop",
                index: 0,
              });
              send("message_delta", {
                type: "message_delta",
                delta: { stop_reason: "end_turn", stop_sequence: null },
              });
              send("message_stop", { type: "message_stop" });
            }
          } catch (e) {
            send("error", {
              type: "error",
              error: {
                type: e instanceof RouteError ? e.category : "request_failed",
                message:
                  e instanceof RouteError || e instanceof PublicError
                    ? e.message
                    : "Router request failed.",
              },
            });
          } finally {
            try {
              output.close();
            } catch {
              /* client disconnected */
            }
          }
        })();
      },
      cancel() {
        disconnected = true;
        controller.abort();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return safeError(e);
  }
}
