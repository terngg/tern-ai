export class TernError extends Error {
  constructor(message: string, public readonly exitCode = 1) { super(message); this.name = 'TernError'; }
}
export function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
export function messageOf(error: unknown): string { return error instanceof Error ? error.message : 'Unexpected error.'; }
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
