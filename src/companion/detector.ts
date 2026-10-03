import { getLocalAdapters } from "./registry.js";
import type { DetectedLocalProvider } from "./types.js";

export async function detectAllLocalProviders(): Promise<
  DetectedLocalProvider[]
> {
  const adapters = getLocalAdapters();
  const results = await Promise.all(
    adapters.map(async (adapter) => {
      try {
        const det = await adapter.detect();
        const auth = await adapter.authStatus();
        const models = det.installed ? await adapter.listModels() : [];
        const health = det.installed
          ? await adapter.health()
          : { ok: false, error: "Not installed" };

        const res: DetectedLocalProvider = {
          id: adapter.id,
          name: adapter.name,
          installed: det.installed,
          version: det.version,
          authenticated: auth.authenticated,
          authDetails: auth.details,
          models: models.map((m) => ({
            id: m.id,
            name: m.name,
            contextWindow: m.contextWindow,
            ...(m.reasoningEfforts?.length
              ? {
                  reasoningEfforts: m.reasoningEfforts,
                  defaultReasoningEffort: m.defaultReasoningEffort,
                }
              : {}),
            source: "discovered" as const,
          })),
          health,
        };
        return res;
      } catch (err: unknown) {
        return {
          id: adapter.id,
          name: adapter.name,
          installed: false,
          authenticated: false,
          models: [],
          health: { ok: false, error: (err as Error)?.message || "Failed" },
        };
      }
    }),
  );
  return results;
}
