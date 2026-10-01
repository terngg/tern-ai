import { authenticate } from "../../../lib/router/auth.js";
import { RouterStore, rateLimit } from "../../../lib/router/store.js";
import { providers, virtualModels } from "../../../lib/router/registry.js";
import { PublicError, safeError } from "../../../lib/router/errors.js";
import { readJson } from "../../../lib/server.js";
import {
  createConnection,
  savePool,
  textField,
  updateConnection,
} from "../../../lib/router/management.js";
import { checkConnection } from "../../../lib/router/engine.js";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await authenticate(request),
      store = new RouterStore(user.id);
    await rateLimit("read:" + user.id, 120);
    const [connections, pools, traces] = await Promise.all([
      store.connections(),
      store.pools(),
      store.traces(),
    ]);
    return Response.json(
      { user, providers, virtualModels, connections, pools, traces },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return safeError(e);
  }
}
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await authenticate(request);
    await rateLimit("manage:" + user.id, 30);
    const store = new RouterStore(user.id),
      input = await readJson(request);
    switch (input.action) {
      case "create":
        return Response.json(
          { connection: await createConnection(store, input) },
          { status: 201 },
        );
      case "update":
        await updateConnection(store, input);
        break;
      case "delete":
        await store.delete(textField(input.id, "connection"));
        break;
      case "test":
        return Response.json({
          connection: await checkConnection(
            store,
            textField(input.id, "connection"),
            request.signal,
          ),
        });
      case "testAll": {
        const connections = (await store.connections()).filter(
            (c) => c.enabled,
          ),
          results: unknown[] = [],
          signal = AbortSignal.any([
            request.signal,
            AbortSignal.timeout(100_000),
          ]);
        // Small batches bound concurrency; persisted per-connection claims prevent repeated tests across instances.
        for (let i = 0; i < connections.length; i += 3) {
          if (signal.aborted) {
            results.push(
              ...connections
                .slice(i)
                .map((c) => ({
                  id: c.id,
                  ok: false,
                  error: "Not tested: request time limit.",
                })),
            );
            break;
          }
          const batch = await Promise.all(
            connections.slice(i, i + 3).map(async (c) => {
              try {
                await checkConnection(store, c.id, signal);
                return { id: c.id, ok: true };
              } catch (e) {
                return {
                  id: c.id,
                  ok: false,
                  error:
                    e instanceof PublicError
                      ? e.message
                      : "Connection check failed. See recorded health.",
                };
              }
            }),
          );
          results.push(...batch);
        }
        return Response.json({ results });
      }
      case "savePool":
        await savePool(store, input);
        break;
      case "deletePool":
        await store.deletePool(textField(input.id, "pool"));
        break;
      default:
        throw new PublicError("Unknown router operation.");
    }
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return safeError(e);
  }
}
