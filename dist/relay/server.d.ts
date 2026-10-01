export interface RelayOptions {
    port: number;
    host?: string;
}
export declare class DedicatedRelayServer {
    private options;
    private server;
    private companions;
    private pendingJobs;
    constructor(options: RelayOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    private handleRequest;
}
