export interface FileContext {
    path: string;
    name: string;
    content: string;
}
export declare const MAX_FILE_BYTES = 16384;
export declare function readContexts(paths: string[]): Promise<FileContext[]>;
export declare function assertWritable(path: string, force: boolean): Promise<void>;
export declare function saveLua(path: string, code: string, force?: boolean, original?: string): Promise<void>;
