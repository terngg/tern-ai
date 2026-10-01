export type ApiStatus = 'live' | 'extension' | 'stub' | 'not_dispatched';
export interface ApiEntry {
    name: string;
    category: string;
    status: ApiStatus;
    signature: string;
    description: string;
    example: string;
    notes: string;
    categoryNotes: string;
    callable: boolean;
}
export declare function parseDocs(markdown: string): ApiEntry[];
export declare class ApiIndex {
    readonly entries: ApiEntry[];
    readonly byName: Map<string, ApiEntry[]>;
    private readonly terms;
    private readonly frequency;
    constructor(entries: ApiEntry[]);
    retrieve(query: string, maxBytes?: number): ApiEntry[];
}
export declare function formatEntry(e: ApiEntry): string;
export declare function loadKnowledge(): Promise<ApiIndex>;
