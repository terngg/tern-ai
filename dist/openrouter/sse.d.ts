/** Incremental SSE framer: UTF-8 is decoded by the caller; handles CR/LF split across chunks. */
export declare class SSEParser {
    private readonly emit;
    private buffer;
    private data;
    private size;
    constructor(emit: (data: string) => void);
    feed(chunk: string, final?: boolean): void;
}
