import { hostname } from "node:os";
import { loadCompanionConfig, saveCompanionConfig } from "../companion/config.js";
import { detectAllLocalProviders } from "../companion/detector.js";
import { CompanionClient } from "../companion/client.js";
import { output, info } from "../cli/io.js";
import { TernError } from "../utils/errors.js";

const DEFAULT_SERVER_URL =
  process.env.TERN_SERVER_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://tern-ai-swart.vercel.app");

export async function pairCompanion(
  code: string,
  options: { server?: string },
): Promise<void> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) throw new TernError("Pairing code is required.");

  const serverUrl = (options.server || DEFAULT_SERVER_URL).replace(/\/+$/, "");
  info(`Pairing with Tern AI at ${serverUrl}...`);

  const response = await fetch(`${serverUrl}/api/router/companion/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: cleanCode,
      platform: process.platform,
      label: hostname() || "local-companion",
    }),
    signal: AbortSignal.timeout(15000),
  }).catch((err: unknown) => {
    throw new TernError(
      `Cannot connect to Tern AI server: ${(err as Error)?.message}`,
    );
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new TernError(
      error.error || `Pairing failed with HTTP ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    companionId: string;
    token: string;
    userId: string;
    label: string;
  };

  saveCompanionConfig({
    companionId: data.companionId,
    token: data.token,
    serverUrl,
    userId: data.userId,
    label: data.label || hostname() || "local-companion",
    pairedAt: Date.now(),
  });

  output(`✓ Tern Companion paired successfully!`);
  output(`  Companion ID : ${data.companionId}`);
  output(`  Server       : ${serverUrl}`);
  output(`\nStart the daemon with:\n  tern companion`);
}

export async function companionStatus(): Promise<void> {
  const config = loadCompanionConfig();
  if (!config) {
    output("Tern Companion: Not paired");
    output("To pair your local machine, run:");
    output("  tern companion pair <code>");
    return;
  }

  output("Tern Companion: Paired");
  output(`  ID     : ${config.companionId}`);
  output(`  Server : ${config.serverUrl}`);
  output(`  Label  : ${config.label}`);
  output(`  Paired : ${new Date(config.pairedAt).toLocaleString()}`);
  output("\nLocal Provider Probing:");

  const detected = await detectAllLocalProviders();
  for (const p of detected) {
    const status = !p.installed
      ? "Not installed"
      : p.authenticated
        ? `Ready (${p.models.length} models)`
        : `Auth required (${p.authDetails || "login needed"})`;
    output(`  • ${p.name.padEnd(16)} : ${status}`);
  }
}

export async function companionProviders(): Promise<void> {
  const detected = await detectAllLocalProviders();
  output("Local Provider Catalog & Capabilities:\n");
  for (const p of detected) {
    output(`[${p.name}] (${p.id})`);
    output(`  Installed     : ${p.installed ? "Yes" : "No"}`);
    if (p.version) output(`  Version       : ${p.version}`);
    output(`  Authenticated : ${p.authenticated ? "Yes" : "No"}`);
    if (p.authDetails) output(`  Auth Details  : ${p.authDetails}`);
    output(`  Health        : ${p.health.ok ? "Healthy" : "Offline / Unhealthy"}`);
    if (p.health.latencyMs !== undefined)
      output(`  Latency       : ${p.health.latencyMs}ms`);
    if (p.models.length > 0) {
      output(`  Models        : ${p.models.map((m: { id: string }) => m.id).join(", ")}`);
    }
    output("");
  }
}

export async function runCompanion(): Promise<void> {
  const config = loadCompanionConfig();
  if (!config) {
    throw new TernError(
      "Tern Companion is not paired. Run `tern companion pair <code>` first.",
    );
  }
  const client = new CompanionClient(config);

  const cleanup = () => {
    client.stop();
    process.stdout.write("\nTern Companion stopped.\n");
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await client.start();
}
