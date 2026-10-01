import { ApiIndex } from './knowledge.js';
export interface Finding {
    severity: 'error' | 'warning';
    code: string;
    message: string;
    line: number;
}
export interface Validation {
    syntaxValid: boolean;
    recognized: string[];
    findings: Finding[];
}
export declare function validateLua(code: string, index: ApiIndex): Validation;
