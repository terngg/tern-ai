import { stripVTControlCharacters } from "node:util";
import type { LocalModel } from "../types.js";

/** Parse the public `agy models` TSV catalog; never synthesize model IDs. */
export function parseAntigravityModels(stdout: string): LocalModel[] {
  const models = new Map<string, LocalModel>();
  for (const line of stripVTControlCharacters(stdout).split(/\r?\n/)) {
    const [rawId, rawName, ...extra] = line.split("\t");
    const id = rawId?.trim() || "", name = rawName?.trim() || "";
    if (extra.length || !/^[a-z0-9][a-z0-9._/-]{0,127}$/.test(id) ||
        !name || name.length > 200 || [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) continue;
    models.set(id, { id, name });
  }
  return [...models.values()];
}
