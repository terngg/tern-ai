import type { Page } from "@playwright/test";
// UI-only fixtures. These are never included in production or used as provider evidence.
export async function installUIFixture(page: Page, expanded = false) {
  const connections = [
    {
      id: "qa-openai",
      provider: "openai",
      label: "QA Work",
      model: "gpt-test",
      models: [
        {
          id: "gpt-test",
          name: "QA coding model",
          source: "discovered",
          contextWindow: 32000,
        },
      ],
      health: "healthy",
      latencyMs: 420,
    },
    {
      id: "qa-ag",
      provider: "antigravity",
      label: "QA Companion",
      model: "gemini-3.8-flash-high",
      models: [
        {
          id: "gemini-3.8-flash-high",
          name: "Gemini 3.8 Flash (High)",
          source: "discovered",
        },
        {
          id: "gemini-3.8-flash-medium",
          name: "Gemini 3.8 Flash (Medium)",
          source: "discovered",
        },
        ...(expanded
          ? Array.from({ length: 28 }, (_, i) => ({
              id: `qa-model-${i}`,
              name: `QA model ${i}`,
              source: "configured",
            }))
          : []),
      ],
      health: "connected",
      latencyMs: null,
    },
  ].map((c) => ({
    ...c,
    enabled: true,
    priority: 0,
    checkedAt: Date.now(),
    quota: "unknown",
    cooldownUntil: null,
    maskedCredential: "••••test",
    hasCredential: true,
    baseUrl:
      c.provider === "antigravity"
        ? "companion://antigravity"
        : "https://api.openai.com/v1",
    timeoutMs: 60000,
  }));
  const pools = [
    {
      id: "qa-pool",
      name: "Coding pool",
      enabled: true,
      strategy: "priority",
      connections: connections.map((c) => c.id),
    },
  ];
  const traces = [
    {
      id: "qa-trace",
      timestamp: Date.now(),
      requestedModel: "auto",
      selectedModel: "gpt-test",
      provider: "openai",
      connectionId: "qa-openai",
      retries: 0,
      fallbackPath: ["qa-openai"],
      latencyMs: 420,
      ttftMs: 120,
      status: "ok",
      errorCategory: null,
      inputTokens: 80,
      outputTokens: 160,
      estimatedCost: null,
    },
  ];
  const actions: Record<string, unknown>[] = [];
  await page.route("**/api/router", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      actions.push(body);
      if (body.action === "delete") {
        const i = connections.findIndex((c) => c.id === body.id);
        if (i >= 0) connections.splice(i, 1);
      }
      if (body.action === "deletePool") {
        const i = pools.findIndex((p) => p.id === body.id);
        if (i >= 0) pools.splice(i, 1);
      }
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({
      json: {
        user: { id: "qa-user", email: "qa@example.invalid" },
        connections,
        pools,
        traces,
      },
    });
  });
  await page.route("**/api/router/companion", (route) =>
    route.fulfill({
      json: { paired: false, connected: false, detectedProviders: [] },
    }),
  );
  await page.route("**/api/ai/generate", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: [
        { type: "token", text: "Hello from the UI test." },
        {
          type: "result",
          text: "Hello from the UI test.",
          model: "gpt-test",
          provider: "openai",
        },
        { type: "done" },
      ]
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join(""),
    }),
  );
  return { actions };
}
