import { randomBytes, createHash } from "node:crypto";
import { database, Database } from "./store.js";
import { PublicError, RouteError } from "./errors.js";
import type {
  CompanionStatus,
  DetectedLocalProvider,
  Secret,
} from "./types.js";
import { RouterStore } from "./store.js";
import { companionState, COMPANION_TIMEOUT_MS } from "./companion-state.js";
import type { ErrorCategory } from "./types.js";

const companionErrors = new Set<ErrorCategory>([
  "auth_failure", "permission_denied", "bad_request", "rate_limit",
  "quota_exhausted", "timeout", "provider_overload", "server_error", "network",
]);
function companionError(value: unknown): ErrorCategory {
  return typeof value === "string" && companionErrors.has(value as ErrorCategory)
    ? value as ErrorCategory : "server_error";
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class CompanionRelay {
  constructor(private db: Database = database()) {}

  async generatePairCode(userId: string): Promise<{ code: string; expiresAt: number }> {
    const raw = randomBytes(4).toString("hex").toUpperCase();
    const code = `PAIR-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    await this.db.query(
      "INSERT INTO tern_companion_pairing(code, user_id, expires_at) VALUES($1, $2, to_timestamp($3 / 1000.0))",
      [code, userId, expiresAt],
    );
    return { code, expiresAt };
  }

  async redeemPairCode(
    code: string,
    platform: string,
    label: string,
  ): Promise<{ companionId: string; token: string; userId: string; label: string }> {
    const { rows } = await this.db.query<{ user_id: string; expires_at: Date }>(
      "SELECT user_id, expires_at FROM tern_companion_pairing WHERE code=$1",
      [code],
    );

    if (!rows[0]) {
      throw new PublicError("Invalid or expired pairing code.", 400);
    }
    if (new Date(rows[0].expires_at).getTime() < Date.now()) {
      await this.db.query("DELETE FROM tern_companion_pairing WHERE code=$1", [code]);
      throw new PublicError("Pairing code has expired. Please generate a new one.", 400);
    }

    const userId = rows[0].user_id;
    // Consume code
    await this.db.query("DELETE FROM tern_companion_pairing WHERE code=$1", [code]);

    const companionId = `comp_${randomBytes(8).toString("hex")}`;
    const token = `tc_${randomBytes(24).toString("hex")}`;
    const tokenHash = hashToken(token);

    // Delete any existing companion for this user to keep 1 active companion pair per user
    await this.db.query("DELETE FROM tern_companions WHERE user_id=$1", [userId]);

    await this.db.query(
      "INSERT INTO tern_companions(user_id, id, token_hash, label, platform, last_heartbeat) VALUES($1, $2, $3, $4, $5, $6)",
      [userId, companionId, tokenHash, label || "local-companion", platform || process.platform, Date.now()],
    );

    return { companionId, token, userId, label };
  }

  async authenticateCompanion(companionId: string, token: string): Promise<{ userId: string; label: string }> {
    const tokenHash = hashToken(token);
    const { rows } = await this.db.query<{ user_id: string; label: string }>(
      "SELECT user_id, label FROM tern_companions WHERE id=$1 AND token_hash=$2",
      [companionId, tokenHash],
    );
    if (!rows[0]) {
      throw new PublicError("Unauthorized companion token.", 401);
    }
    return { userId: rows[0].user_id, label: rows[0].label };
  }

  async getCompanionStatus(userId: string): Promise<CompanionStatus> {
    const { rows } = await this.db.query<{
      id: string;
      label: string;
      platform: string;
      detected_providers: DetectedLocalProvider[];
      last_heartbeat: string | null;
    }>(
      "SELECT id, label, platform, detected_providers, last_heartbeat FROM tern_companions WHERE user_id=$1",
      [userId],
    );

    if (!rows[0]) {
      return { paired: false, connected: false, detectedProviders: [] };
    }

    const lastHeartbeat = rows[0].last_heartbeat ? Number(rows[0].last_heartbeat) : 0;
    // Consider connected if heartbeat received in last 60 seconds
    const connected = Date.now() - lastHeartbeat < 60_000;

    return {
      paired: true,
      connected,
      companionId: rows[0].id,
      label: rows[0].label,
      platform: rows[0].platform,
      lastHeartbeat,
      detectedProviders: rows[0].detected_providers || [],
    };
  }

  async syncHeartbeat(
    companionId: string,
    platform: string,
    label: string,
    detectedProviders: DetectedLocalProvider[],
  ): Promise<void> {
    const now = Date.now();
    const { rows } = await this.db.query<{ user_id: string }>(
      "UPDATE tern_companions SET platform=$1, label=$2, detected_providers=$3::jsonb, last_heartbeat=$4 WHERE id=$5 RETURNING user_id",
      [platform, label, JSON.stringify(detectedProviders), now, companionId],
    );
    if (!rows[0]) return;

    const userId = rows[0].user_id;
    // Auto-sync discovered healthy local providers into tern_connections
    await this.syncConnectionsFromLocal(userId, detectedProviders);
  }

  private async syncConnectionsFromLocal(
    userId: string,
    detectedProviders: DetectedLocalProvider[],
  ): Promise<void> {
    const store = new RouterStore(userId, this.db);
    const existing = await store.connections();

    for (const dp of detectedProviders) {
      if (!dp.installed) continue;
      const found = existing.find((c) => c.provider === dp.id && c.baseUrl === `companion://${dp.id}`);
      const isHealthy = dp.authenticated && dp.health.ok;
      const defaultModel = dp.models[0]?.id || "";

      if (!found) {
        // Create new companion connection
        const secret: Secret = {
          key: "companion-local-auth",
          authHeader: "authorization",
          authPrefix: "Bearer ",
          headers: {},
        };
        await store.create(
          {
            provider: dp.id,
            label: `${dp.name} (Local)`,
            enabled: true,
            priority: 0,
            model: defaultModel,
            baseUrl: `companion://${dp.id}`,
            timeoutMs: COMPANION_TIMEOUT_MS,
            models: dp.models,
            modelsAt: Date.now(),
            health: isHealthy ? "connected" : dp.authenticated ? "network" : "auth_failure",
            checkedAt: Date.now(),
            latencyMs: dp.health.latencyMs ?? null,
            cooldownUntil: null,
            lastUsed: null,
            quota: "unknown",
            maskedCredential: dp.authenticated ? "Local Auth" : "Unauthenticated",
            hasCredential: true,
          },
          secret,
        );
      } else {
        // Update existing connection health and models
        await store.patch(found.id, companionState(dp, found));
      }
    }
  }

  async pollPendingJobs(companionId: string): Promise<Array<{
    id: string;
    provider: string;
    model: string;
    request: unknown;
  }>> {
    const { rows } = await this.db.query<{
      id: string;
      provider: string;
      model: string;
      request: unknown;
    }>(
      "SELECT id, provider, model, request FROM tern_relay_jobs WHERE companion_id=$1 AND status='pending' ORDER BY created_at ASC LIMIT 5",
      [companionId],
    );

    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      await this.db.query(
        "UPDATE tern_relay_jobs SET status='running', updated_at=now() WHERE id = ANY($1)",
        [ids],
      );
    }
    return rows;
  }

  async pollCancelledJobs(companionId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ id: string }>(
      "SELECT id FROM tern_relay_jobs WHERE companion_id=$1 AND status='cancelled' AND updated_at > now() - interval '10 minutes'",
      [companionId],
    );
    return rows.map((row) => row.id);
  }

  async appendJobEvent(
    companionId: string,
    jobId: string,
    event: { type: "token" | "done" | "error"; token?: string; error?: string; category?: string; sequence?: number },
  ): Promise<void> {
    if (event.sequence !== undefined) {
      const sequence = event.sequence;
      if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > 2_000_000)
        throw new PublicError("Invalid event sequence.");
      const category = companionError(event.category);
      const { rows } = event.type === "token"
        ? await this.db.query(
          "UPDATE tern_relay_jobs SET chunks=chunks || $1::jsonb, updated_at=now() WHERE id=$2 AND companion_id=$3 AND status IN ('pending','running') AND jsonb_array_length(chunks)=$4 RETURNING id",
          [JSON.stringify([event.token]), jobId, companionId, sequence],
        )
        : await this.db.query(
          "UPDATE tern_relay_jobs SET status=$1, error=$2, updated_at=now() WHERE id=$3 AND companion_id=$4 AND status IN ('pending','running') AND jsonb_array_length(chunks)=$5 RETURNING id",
          [event.type === "done" ? "completed" : "error", event.type === "error" ? category : null, jobId, companionId, sequence],
        );
      if (rows.length) return;
      // Token chunk count is the durable sequence cursor. An acknowledgement
      // lost in transit may be retried only with the exact same event payload.
      const { rows: current } = await this.db.query<{ status: string; count: number; token: string | null; error: string | null }>(
        "SELECT status,jsonb_array_length(chunks) AS count,chunks->>$3::integer AS token,error FROM tern_relay_jobs WHERE id=$1 AND companion_id=$2",
        [jobId, companionId, sequence],
      );
      const job = current[0];
      if (!job) throw new PublicError("Relay job not found.", 404);
      if (job.status === "cancelled") throw new PublicError("Relay job was cancelled.", 410);
      if (event.type === "token" && job.count > sequence && job.token === event.token) return;
      if (job.count === sequence && ((event.type === "done" && job.status === "completed") ||
        (event.type === "error" && job.status === "error" && job.error === category))) return;
      throw new PublicError("Relay event is out of order.", 409);
    }
    if (event.type === "token" && event.token) {
      await this.db.query(
        "UPDATE tern_relay_jobs SET chunks = chunks || $1::jsonb, updated_at=now() WHERE id=$2 AND companion_id=$3 AND status IN ('pending', 'running')",
        [JSON.stringify([event.token]), jobId, companionId],
      );
    } else if (event.type === "done") {
      await this.db.query(
        "UPDATE tern_relay_jobs SET status='completed', updated_at=now() WHERE id=$1 AND companion_id=$2 AND status IN ('pending', 'running')",
        [jobId, companionId],
      );
    } else if (event.type === "error") {
      await this.db.query(
        "UPDATE tern_relay_jobs SET status='error', error=$1, updated_at=now() WHERE id=$2 AND companion_id=$3 AND status IN ('pending', 'running')",
        [companionError(event.category), jobId, companionId],
      );
    }
  }

  async dispatchAndStreamJob(
    userId: string,
    provider: string,
    model: string,
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    temperature?: number,
    maxTokens?: number,
    onToken?: (token: string) => void,
    signal?: AbortSignal,
    timeoutMs = COMPANION_TIMEOUT_MS,
  ): Promise<{ text: string }> {
    const { rows: companionRows } = await this.db.query<{ id: string; last_heartbeat: string | null }>(
      "SELECT id, last_heartbeat FROM tern_companions WHERE user_id=$1",
      [userId],
    );

    if (!companionRows[0]) {
      throw new RouteError("network", 503);
    }

    const companionId = companionRows[0].id;
    const lastHeartbeat = companionRows[0].last_heartbeat ? Number(companionRows[0].last_heartbeat) : 0;
    if (Date.now() - lastHeartbeat > 60_000) {
      throw new RouteError("network", 503);
    }

    const jobId = `job_${randomBytes(12).toString("hex")}`;
    const requestPayload = { messages, temperature, maxTokens };

    await this.db.query(
      "INSERT INTO tern_relay_jobs(id, user_id, companion_id, provider, model, request, status) VALUES($1, $2, $3, $4, $5, $6::jsonb, 'pending')",
      [jobId, userId, companionId, provider, model, JSON.stringify(requestPayload)],
    );

    let text = "";
    let processedChunks = 0;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      if (signal?.aborted) {
        await this.db.query(
          "UPDATE tern_relay_jobs SET status='cancelled', updated_at=now() WHERE id=$1 AND user_id=$2 AND status IN ('pending', 'running')",
          [jobId, userId],
        );
        throw new RouteError("cancelled");
      }

      const { rows } = await this.db.query<{
        status: string;
        chunks: string[];
        error: string | null;
      }>(
        "SELECT status, chunks, error FROM tern_relay_jobs WHERE id=$1",
        [jobId],
      );

      if (!rows[0]) throw new RouteError("server_error", 500);

      const job = rows[0];
      const chunks = Array.isArray(job.chunks) ? job.chunks : [];

      while (processedChunks < chunks.length) {
        const chunk = chunks[processedChunks]!;
        text += chunk;
        onToken?.(chunk);
        processedChunks++;
      }

      if (job.status === "completed") {
        if (!text.trim()) throw new RouteError("server_error");
        return { text };
      }
      if (job.status === "error") {
        const category = companionError(job.error);
        throw new RouteError(category, category === "rate_limit" ? 429 : 502);
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    await this.db.query(
      "UPDATE tern_relay_jobs SET status='cancelled', updated_at=now() WHERE id=$1 AND user_id=$2 AND status IN ('pending', 'running')",
      [jobId, userId],
    );
    throw new RouteError("timeout", 504);
  }
}
