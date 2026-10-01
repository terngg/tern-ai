import { randomInt, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { CompletionClient } from "../../../../src/providers/types.js";
import type { CompletionOptions } from "../../../../src/openrouter/client.js";
import { RouterStore } from "./store.js";
import { RouteError, PublicError, transient } from "./errors.js";
import { discover, infer } from "./adapters.js";
import { protectedFetch, type Transport } from "./transport.js";
import type { Connection, Strategy, Trace } from "./types.js";
import { virtualModels } from "./registry.js";
export function redact(value: string, secrets: string[]): string {
  for (const secret of secrets)
    if (secret) value = value.split(secret).join("[redacted]");
  return value;
}
/** Holds an overlap so a secret split between token chunks cannot be exposed. */
export function tokenRedactor(
  secrets: string[],
  emit: (text: string) => void,
): { push: (text: string) => void; flush: () => void } {
  let pending = "";
  const width = Math.max(1, ...secrets.map((s) => s.length));
  return {
    push(text) {
      pending += text;
      let cut = Math.max(0, pending.length - width);
      for (const secret of secrets.filter(Boolean)) {
        let at = pending.indexOf(secret);
        while (at >= 0) {
          if (at < cut && at + secret.length > cut) cut = at;
          at = pending.indexOf(secret, at + 1);
        }
      }
      if (cut) {
        emit(redact(pending.slice(0, cut), secrets));
        pending = pending.slice(cut);
      }
    },
    flush() {
      if (pending) emit(redact(pending, secrets));
      pending = "";
    },
  };
}
export function eligible(c: Connection, now = Date.now()): boolean {
  return (
    c.enabled &&
    !!c.model &&
    c.health !== "auth_failure" &&
    c.health !== "permission_denied" &&
    c.quota !== "exhausted" &&
    !(c.cooldownUntil && c.cooldownUntil > now)
  );
}
export async function checkConnection(
  store: RouterStore,
  id: string,
  signal: AbortSignal,
  transport: Transport = protectedFetch,
): Promise<Connection> {
  const c = await store.connection(id);
  if (!c.enabled) throw new PublicError("Connection is disabled.");
  if (!(await store.claimTest(id)))
    throw new PublicError(
      "This connection was recently tested. Wait one minute.",
      429,
    );
  const start = Date.now(),
    secret = await store.secret(id);

  if (c.baseUrl.startsWith("companion://")) {
    const { CompanionRelay } = await import("./companion-relay.js");
    const relay = new CompanionRelay(store.db);
    const status = await relay.getCompanionStatus(store.owner);
    if (!status.connected) {
      const e = new RouteError("network", 503);
      await store.patch(id, {
        health: "network",
        checkedAt: Date.now(),
        latencyMs: Date.now() - start,
      });
      throw e;
    }
    const detected = status.detectedProviders.find((dp) => dp.id === c.provider);
    if (!detected || !detected.installed) {
      const e = new RouteError("network", 503);
      await store.patch(id, {
        health: "network",
        checkedAt: Date.now(),
        latencyMs: Date.now() - start,
      });
      throw e;
    }
    if (!detected.authenticated) {
      const e = new RouteError("auth_failure", 401);
      await store.patch(id, {
        health: "auth_failure",
        checkedAt: Date.now(),
        latencyMs: Date.now() - start,
      });
      throw e;
    }
    await store.patch(id, {
      models: detected.models.length > 0 ? detected.models : c.models,
      modelsAt: Date.now(),
      health: "connected",
      checkedAt: Date.now(),
      latencyMs: detected.health.latencyMs ?? (Date.now() - start),
      cooldownUntil: null,
      quota: "unknown",
    });
    return store.connection(id);
  }

  try {
    const models = await discover(
      c,
      secret,
      AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      transport,
    );
    await store.patch(id, {
      models: models.filter(
        (m) =>
          ![secret.key, ...Object.values(secret.headers)].some(
            (s) => s && (m.id.includes(s) || m.name.includes(s)),
          ),
      ),
      modelsAt: Date.now(),
      health: "connected",
      checkedAt: Date.now(),
      latencyMs: Date.now() - start,
      cooldownUntil: null,
      quota: "unknown",
    });
  } catch (error) {
    const e =
      error instanceof RouteError
        ? error
        : new RouteError(signal.aborted ? "cancelled" : "network");
    await store.patch(id, {
      health: e.category,
      checkedAt: Date.now(),
      latencyMs: Date.now() - start,
      ...(e.category === "quota_exhausted" ? { quota: "exhausted" } : {}),
      ...(e.category === "rate_limit"
        ? { cooldownUntil: Date.now() + Math.max(60_000, e.retryAfterMs) }
        : {}),
    });
    throw e;
  }
  return store.connection(id);
}
export class RoutedClient implements CompletionClient {
  managed = true;
  lastModel?: string;
  lastProvider?: string;
  constructor(
    readonly store: RouterStore,
    readonly requestedModel = "auto",
    readonly poolId?: string,
    readonly transport: Transport = protectedFetch,
    readonly maxTokens = 8192,
  ) {}
  async complete(options: CompletionOptions): Promise<string> {
    const all = await this.store.connections();
    let candidates = all.filter((c) => eligible(c)),
      strategy: Strategy = "round_robin";
    if (this.poolId) {
      const pool = (await this.store.pools()).find(
        (p) => p.id === this.poolId && p.enabled,
      );
      if (!pool) throw new PublicError("Enabled pool not found.", 404);
      candidates = pool.connections
        .map((id) => candidates.find((c) => c.id === id))
        .filter((c): c is Connection => !!c);
      strategy = pool.strategy;
    }
    const virtual = virtualModels.includes(this.requestedModel);
    if (!virtual) {
      const separator = this.requestedModel.indexOf("::");
      if (separator < 0)
        throw new PublicError("Select a virtual model or connection::model.");
      const id = this.requestedModel.slice(0, separator),
        model = this.requestedModel.slice(separator + 2);
      candidates = candidates
        .filter(
          (c) =>
            c.id === id &&
            (c.model === model || c.models.some((m) => m.id === model)),
        )
        .map((c) => ({ ...c, model }));
    }
    if (this.requestedModel === "auto/fast") strategy = "health_aware";
    if (this.requestedModel === "auto/quality") strategy = "priority"; // Explicit user ranking, never an invented quality score.
    if (this.requestedModel === "auto/cheap") {
      candidates = candidates.filter(
        (c) =>
          c.modelsAt &&
          Date.now() - c.modelsAt < 3600_000 &&
          c.models.some(
            (m) =>
              m.id === c.model &&
              m.inputPrice !== undefined &&
              m.outputPrice !== undefined,
          ),
      );
      candidates.sort((a, b) => {
        const cost = (c: Connection) => {
          const m = c.models.find((m) => m.id === c.model)!;
          return m.inputPrice! + m.outputPrice!;
        };
        return cost(a) - cost(b);
      });
    } else if (strategy === "round_robin" && candidates.length) {
      const cursor = await this.store.next(this.poolId || "default");
      const offset = cursor % candidates.length;
      candidates = [
        ...candidates.slice(offset),
        ...candidates.slice(0, offset),
      ];
    } else if (strategy === "priority" && !this.poolId)
      candidates.sort((a, b) => a.priority - b.priority);
    else if (strategy === "least_recently_used")
      candidates.sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0));
    else if (strategy === "health_aware")
      candidates.sort(
        (a, b) =>
          (a.health === "healthy" ? 0 : 1) - (b.health === "healthy" ? 0 : 1) ||
          (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity),
      );
    candidates = candidates.filter((c) => {
      const metadata = c.models.find((m) => m.id === c.model);
      return (
        !metadata?.contextWindow ||
        options.messages.reduce(
          (n, m) => n + Buffer.byteLength(m.content) + 64,
          8192,
        ) <= metadata.contextWindow
      );
    });
    if (!candidates.length)
      throw new PublicError(
        this.requestedModel === "auto/cheap"
          ? "No eligible connection has fresh, reliable pricing. Refresh models or choose another routing mode."
          : "No eligible connection. Configure a model and check connection health in Providers.",
        409,
      );
    const path: string[] = [];
    let last: RouteError | undefined;
    for (const c of candidates.slice(0, 4)) {
      options.signal?.throwIfAborted();
      if (!eligible(await this.store.connection(c.id))) continue;
      const secret = await this.store.secret(c.id),
        secrets = [secret.key, ...Object.values(secret.headers)].filter(
          Boolean,
        );
      await this.store.touch(c.id);
      const started = Date.now();
      let visible = false,
        ttft: number | null = null;
      const trace: Trace = {
        id: randomUUID(),
        timestamp: started,
        requestedModel: this.requestedModel,
        selectedModel: c.model,
        provider: c.provider,
        connectionId: c.id,
        routingMode: this.poolId || this.requestedModel,
        retries: path.length,
        fallbackPath: [...path, c.id],
        latencyMs: 0,
        ttftMs: null,
        status: "error",
        errorCategory: null,
        inputTokens: null,
        outputTokens: null,
        estimatedCost: null,
      };
      const signal = AbortSignal.any([
        AbortSignal.timeout(c.timeoutMs),
        ...(options.signal ? [options.signal] : []),
      ]);
      const output = tokenRedactor(secrets, (text) => {
        if (text) {
          visible = true;
          options.onToken?.(text);
        }
      });
      try {
        let resultText = "";
        let inputTokens: number | null = null;
        let outputTokens: number | null = null;

        if (c.baseUrl.startsWith("companion://")) {
          const { CompanionRelay } = await import("./companion-relay.js");
          const relay = new CompanionRelay(this.store.db);
          const companionRes = await relay.dispatchAndStreamJob(
            this.store.owner,
            c.provider,
            c.model,
            options.messages.map((m) => ({
              role: m.role as "system" | "user" | "assistant",
              content: redact(m.content, secrets),
            })),
            options.temperature,
            this.maxTokens,
            (text) => {
              if (text && ttft === null) ttft = Date.now() - started;
              output.push(text);
            },
            signal,
          );
          resultText = companionRes.text;
        } else {
          const result = await infer(
            c,
            secret,
            {
              model: c.model,
              messages: options.messages.map((m) => ({
                ...m,
                content: redact(m.content, secrets),
              })),
              stream: options.stream,
              maxTokens: this.maxTokens,
              signal,
              onToken: (text) => {
                if (text && ttft === null) ttft = Date.now() - started;
                output.push(text);
              },
            },
            this.transport,
          );
          resultText = result.text;
          inputTokens = result.inputTokens;
          outputTokens = result.outputTokens;
        }
        output.flush();
        this.lastModel = c.model;
        this.lastProvider = c.provider;
        trace.status = "ok";
        trace.inputTokens = inputTokens;
        trace.outputTokens = outputTokens;
        const m = c.models.find((m) => m.id === c.model);
        if (
          c.modelsAt &&
          Date.now() - c.modelsAt < 3600_000 &&
          m?.inputPrice !== undefined &&
          m.outputPrice !== undefined &&
          inputTokens !== null &&
          outputTokens !== null
        )
          trace.estimatedCost =
            m.inputPrice * inputTokens +
            m.outputPrice * outputTokens;
        await this.store.patch(c.id, {
          health: "healthy",
          checkedAt: Date.now(),
          latencyMs: Date.now() - started,
          cooldownUntil: null,
          quota: "unknown",
        });
        return redact(resultText, secrets);
      } catch (error) {
        const e = options.signal?.aborted
          ? new RouteError("cancelled", 499)
          : visible
            ? new RouteError("stream_interrupted")
            : signal.aborted
              ? new RouteError("timeout")
              : error instanceof RouteError
                ? error.category === "stream_interrupted" && !visible
                  ? new RouteError("network")
                  : error
                : new RouteError("network");
        last = e;
        trace.errorCategory = e.category;
        if (e.category !== "cancelled")
          await this.store.patch(c.id, {
            health: e.category,
            checkedAt: Date.now(),
            ...(e.category === "quota_exhausted" ? { quota: "exhausted" } : {}),
            ...(transient(e)
              ? {
                  cooldownUntil:
                    Date.now() +
                    Math.max(
                      e.retryAfterMs,
                      Math.min(30_000 * 2 ** path.length, 300_000) +
                        randomInt(1000),
                    ),
                }
              : {}),
          });
        if (visible || !transient(e)) throw e;
        path.push(c.id);
        await delay(
          Math.min(200 * 2 ** (path.length - 1), 1500) + randomInt(100),
          undefined,
          { ...(options.signal ? { signal: options.signal } : {}) },
        );
      } finally {
        trace.latencyMs = Date.now() - started;
        trace.ttftMs = ttft;
        await this.store.trace(trace);
      }
    }
    throw last || new PublicError("No eligible connection remains.", 409);
  }
}
