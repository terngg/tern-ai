import type { LocalModel } from "../types.js";
/** Parse the public `agy models` TSV catalog; never synthesize model IDs. */
export declare function parseAntigravityModels(stdout: string): LocalModel[];
