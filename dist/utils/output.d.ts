export interface ParsedOutput {
    code: string;
    explanation: string;
    warnings: string[];
}
export declare function extractOutput(text: string): ParsedOutput;
