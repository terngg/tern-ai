import { getLocalAdapters } from "./registry.js";
export async function detectAllLocalProviders() {
    const adapters = getLocalAdapters();
    const results = await Promise.all(adapters.map(async (adapter) => {
        try {
            const det = await adapter.detect();
            const auth = await adapter.authStatus();
            const models = det.installed ? await adapter.listModels() : [];
            const health = det.installed
                ? await adapter.health()
                : { ok: false, error: "Not installed" };
            const res = {
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
                    source: "discovered",
                })),
                health,
            };
            return res;
        }
        catch (err) {
            return {
                id: adapter.id,
                name: adapter.name,
                installed: false,
                authenticated: false,
                models: [],
                health: { ok: false, error: err?.message || "Failed" },
            };
        }
    }));
    return results;
}
//# sourceMappingURL=detector.js.map