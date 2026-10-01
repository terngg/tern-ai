import { ConfigStore } from '../config/store.js';
import { OpenRouterClient } from './client.js';
export interface Model {
    id: string;
    name: string;
    free: boolean;
    contextLength: number;
}
export declare function parseModels(value: unknown): Model[];
export declare class ModelCatalog {
    private readonly store;
    private readonly client;
    private readonly warn;
    constructor(store: ConfigStore, client: OpenRouterClient, warn: (text: string) => void);
    list(refresh?: boolean): Promise<Model[]>;
}
