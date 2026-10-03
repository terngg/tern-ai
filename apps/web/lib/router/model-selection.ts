import type { Connection, Model } from "./types.js";

/** Compatibility for selections saved before the CLI model catalog was discovered. */
export function canonicalModel(
  provider: string,
  model: string,
  models: Model[],
): string {
  if (provider !== "antigravity") return model;
  const replacement =
    model === "antigravity-flash"
      ? "gemini-3.8-flash-medium"
      : model === "antigravity-pro"
        ? "gemini-3.1-pro-high"
        : model;
  return models.some((m) => m.id === replacement) ? replacement : model;
}

export function canonicalSelection(
  selection: string,
  connections: Connection[],
): string {
  const separator = selection.indexOf("::");
  if (separator < 0) return selection;
  const connection = connections.find(
    (c) => c.id === selection.slice(0, separator),
  );
  if (!connection) return selection;
  const [model, effort, ...extra] = selection.slice(separator + 2).split("::");
  if (extra.length) return selection;
  return `${connection.id}::${canonicalModel(connection.provider, model!, connection.models)}${effort ? `::${effort}` : ""}`;
}
