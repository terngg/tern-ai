import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { encrypt, decrypt } from "./crypto.js";
import { PublicError } from "./errors.js";
import type { Connection, PoolConfig, Secret, Trace } from "./types.js";
export interface Database {
  query<T extends Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}
let pool: Pool | undefined;
export function database(): Database {
  if (!process.env.DATABASE_URL)
    throw new PublicError(
      "Router database is not configured. Set DATABASE_URL and apply the router migration.",
      503,
    );
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10_000,
  });
  return pool;
}
/** Every connection/pool/trace operation is bound to a server-authenticated owner. */
export class RouterStore {
  constructor(
    readonly owner: string,
    readonly db: Database = database(),
  ) {
    if (!owner) throw new PublicError("Authentication required.", 401);
  }
  async connections(): Promise<Connection[]> {
    const { rows } = await this.db.query<{
      metadata: Connection;
      last_used: string | null;
    }>(
      "SELECT metadata,last_used FROM tern_connections WHERE user_id=$1 ORDER BY id",
      [this.owner],
    );
    return rows.map((r) => ({
      ...r.metadata,
      lastUsed: r.last_used === null ? null : Number(r.last_used),
    }));
  }
  async connection(id: string): Promise<Connection> {
    const { rows } = await this.db.query<{
      metadata: Connection;
      last_used: string | null;
    }>(
      "SELECT metadata,last_used FROM tern_connections WHERE user_id=$1 AND id=$2",
      [this.owner, id],
    );
    if (!rows[0]) throw new PublicError("Connection not found.", 404);
    return {
      ...rows[0].metadata,
      lastUsed: rows[0].last_used === null ? null : Number(rows[0].last_used),
    };
  }
  async secret(id: string): Promise<Secret> {
    const { rows } = await this.db.query<{ secret: string }>(
      "SELECT secret FROM tern_connections WHERE user_id=$1 AND id=$2",
      [this.owner, id],
    );
    if (!rows[0]) throw new PublicError("Connection not found.", 404);
    return decrypt<Secret>(rows[0].secret, this.owner, id);
  }
  async create(
    metadata: Omit<Connection, "id">,
    secret: Secret,
  ): Promise<Connection> {
    const id = randomUUID(),
      connection = { ...metadata, id };
    await this.db
      .query(
        "INSERT INTO tern_connections(user_id,id,metadata,secret) SELECT $1,$2,$3::jsonb,$4 WHERE (SELECT count(*) FROM tern_connections WHERE user_id=$1)<100 RETURNING id",
        [
          this.owner,
          id,
          JSON.stringify(connection),
          encrypt(secret, this.owner, id),
        ],
      )
      .then((r) => {
        if (!r.rows.length) throw new PublicError("Connection limit reached.");
      });
    return connection;
  }
  async patch(id: string, fields: Partial<Connection>): Promise<void> {
    const { rows } = await this.db.query(
      "UPDATE tern_connections SET metadata=metadata || $3::jsonb WHERE user_id=$1 AND id=$2 RETURNING id",
      [this.owner, id, JSON.stringify(fields)],
    );
    if (!rows.length) throw new PublicError("Connection not found.", 404);
  }
  async delete(id: string): Promise<void> {
    const { rows } = await this.db.query(
      "DELETE FROM tern_connections WHERE user_id=$1 AND id=$2 RETURNING id",
      [this.owner, id],
    );
    if (!rows.length) throw new PublicError("Connection not found.", 404);
  }
  async claimTest(id: string): Promise<boolean> {
    const now = Date.now();
    const { rows } = await this.db.query(
      "UPDATE tern_connections SET test_after=$3 WHERE user_id=$1 AND id=$2 AND test_after<=$4 RETURNING id",
      [this.owner, id, now + 60_000, now],
    );
    return rows.length > 0;
  }
  async touch(id: string): Promise<void> {
    await this.db.query(
      "UPDATE tern_connections SET last_used=$3 WHERE user_id=$1 AND id=$2",
      [this.owner, id, Date.now()],
    );
  }
  async next(scope: string): Promise<number> {
    const { rows } = await this.db.query<{ cursor: string }>(
      "INSERT INTO tern_cursors(user_id,scope,cursor) VALUES($1,$2,1) ON CONFLICT(user_id,scope) DO UPDATE SET cursor=tern_cursors.cursor+1 RETURNING cursor",
      [this.owner, scope],
    );
    return Number(rows[0]!.cursor) - 1;
  }
  async pools(): Promise<PoolConfig[]> {
    const { rows } = await this.db.query<{ config: PoolConfig }>(
      "SELECT config FROM tern_pools WHERE user_id=$1 ORDER BY id",
      [this.owner],
    );
    return rows.map((r) => r.config);
  }
  async savePool(config: PoolConfig): Promise<void> {
    const owned = new Set((await this.connections()).map((c) => c.id));
    if (config.connections.some((id) => !owned.has(id)))
      throw new PublicError("Pool contains an unavailable connection.");
    await this.db.query(
      "INSERT INTO tern_pools(user_id,id,config) VALUES($1,$2,$3::jsonb) ON CONFLICT(user_id,id) DO UPDATE SET config=excluded.config",
      [this.owner, config.id, JSON.stringify(config)],
    );
  }
  async deletePool(id: string): Promise<void> {
    await this.db.query("DELETE FROM tern_pools WHERE user_id=$1 AND id=$2", [
      this.owner,
      id,
    ]);
  }
  async trace(trace: Trace): Promise<void> {
    await this.db.query(
      "INSERT INTO tern_traces(user_id,id,trace) VALUES($1,$2,$3::jsonb)",
      [this.owner, trace.id, JSON.stringify(trace)],
    );
  }
  async traces(): Promise<Trace[]> {
    const { rows } = await this.db.query<{ trace: Trace }>(
      "SELECT trace FROM tern_traces WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200",
      [this.owner],
    );
    return rows.map((r) => r.trace);
  }
}
export async function rateLimit(
  scope: string,
  limit: number,
  windowMs = 60_000,
  db: Database = database(),
): Promise<void> {
  const bucket = Math.floor(Date.now() / windowMs);
  const { rows } = await db.query<{ count: number }>(
    "INSERT INTO tern_limits(scope,bucket,count) VALUES($1,$2,1) ON CONFLICT(scope) DO UPDATE SET updated_at=now(),bucket=excluded.bucket,count=CASE WHEN tern_limits.bucket=excluded.bucket THEN tern_limits.count+1 ELSE 1 END RETURNING count",
    [scope, bucket],
  );
  if (rows[0]!.count > limit)
    throw new PublicError("Too many requests. Try again later.", 429);
}
