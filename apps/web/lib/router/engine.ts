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
import { companionState } from "./companion-state.js";
import { canonicalSelection } from "./model-selection.js";
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
export function unavailableReason(connections: Connection[], now = Date.now()): string {
  if (!connections.length)
    return "No connection matches the selected model or pool. Select an available model in Providers.";
  const reasons = new Set<string>();
  for (const c of connections) {
    if (!c.enabled) reasons.add("Connection is disabled.");
    else if (!c.model) reasons.add("Select a model in Providers.");
    else if (c.health === "auth_failure") reasons.add("Authentication failed; reconnect in Providers.");
    else if (c.health === "permission_denied") reasons.add("Provider denied access.");
    else if (c.quota === "exhausted") reasons.add("Provider quota is exhausted.");
    else if (c.cooldownUntil && c.cooldownUntil > now)
      reasons.add(`Connection is cooling down after a provider error. Retry in ${Math.ceil((c.cooldownUntil - now) / 1000)} seconds.`);
  }
  return [...reasons].join(" ") || "No eligible model fits this request. Check model context limits in Providers.";
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
    await store.patch(id, companionState(detected, c));
    if (!detected.health.ok) throw new RouteError("network", 503);
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
    readonly preferredProvider?: string,
  ) {}
  async complete(options: CompletionOptions): Promise<string> {
    const all = await this.store.connections();
    let candidates = all,
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
    if (virtual && this.preferredProvider && !candidates.some(
      (c) => c.enabled && c.provider === this.preferredProvider,
    )) throw new PublicError("Preferred provider is unavailable. Choose an enabled provider or clear the preference.", 409);
    let reasoningEffort: string | undefined;
    if (!virtual) {
      const selection = canonicalSelection(this.requestedModel, all);
      const separator = selection.indexOf("::");
      if (separator < 0)
        throw new PublicError("Select a virtual model or connection::model.");
      const id = selection.slice(0, separator),
        [model, effort, ...extra] = selection.slice(separator + 2).split("::");
      if (!model || extra.length) throw new PublicError("Invalid model selection.");
      if (effort) {
        const connection = candidates.find((c) => c.id === id);
        if (connection?.provider !== "codex" || !connection.baseUrl.startsWith("companion://") ||
          !connection.models.find((m) => m.id === model)?.reasoningEfforts?.includes(effort))
          throw new PublicError("Selected reasoning mode is unavailable for this model.");
        reasoningEffort = effort;
      }
      candidates = candidates
        .filter(
          (c) =>
            c.id === id &&
            (c.model === model || c.models.some((m) => m.id === model)),
        )
        .map((c) => ({ ...c, model }));
    }
    const selected = candidates;
    candidates = candidates.filter((c) => eligible(c));
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
    // Stable partition preserves the pool/strategy order within each group.
    // Only eligible, owner-scoped accounts can participate in either group.
    if (virtual && this.preferredProvider) {
      candidates = [
        ...candidates.filter((c) => c.provider === this.preferredProvider),
        ...candidates.filter((c) => c.provider !== this.preferredProvider),
      ];
    }
    if (!candidates.length)
      throw new PublicError(
        this.requestedModel === "auto/cheap"
          ? "No eligible connection has fresh, reliable pricing. Refresh models or choose another routing mode."
          : unavailableReason(selected),
        409,
      );
    const path: string[] = [];
    let last: RouteError | undefined;
    let busy = false;
    for (const c of candidates.slice(0, 4)) {
      options.signal?.throwIfAborted();
      if (!eligible({ ...await this.store.connection(c.id), model: c.model })) continue;
      const secret = await this.store.secret(c.id),
        secrets = [secret.key, ...Object.values(secret.headers)].filter(
          Boolean,
        );
      const lease = await this.store.claimInference(c);
      if (!lease) { busy = true; continue; }
      const started = Date.now();
      let visible = false,
        ttft: number | null = null;
      const trace: Trace = {
        id: randomUUID(),
        timestamp: started,
        requestedModel: this.requestedModel,
        ...(reasoningEffort ? { reasoningEffort } : {}),
        selectedModel: c.model,
        provider: c.provider,
        connectionId: c.id,
        routingMode: this.poolId || this.requestedModel,
        ...(virtual && this.preferredProvider ? { preferredProvider: this.preferredProvider } : {}),
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
        await this.store.touch(c.id);
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
            c.timeoutMs,
            reasoningEffort,
          );
          resultText = companionRes.text;
          inputTokens = companionRes.usage?.inputTokens ?? null;
          outputTokens = companionRes.usage?.outputTokens ?? null;
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
        if (!resultText.trim()) throw new RouteError("server_error");
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
        try { await this.store.trace(trace); }
        finally { await this.store.releaseInference(lease); }
      }
    }
    throw last || new PublicError(busy
      ? "This account is already generating a response. Wait for it to finish, stop the current request, or select another account."
      : "No eligible connection remains.", 409);
  }
}
