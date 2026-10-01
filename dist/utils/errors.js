export class TernError extends Error {
    exitCode;
    constructor(message, exitCode = 1) {
        super(message);
        this.exitCode = exitCode;
        this.name = 'TernError';
    }
}
export function isMissing(error) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
export function messageOf(error) { return error instanceof Error ? error.message : 'Unexpected error.'; }
export function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=errors.js.map