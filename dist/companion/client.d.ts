import { type CompanionConfig } from "./config.js";
export declare class CompanionClient {
    private config;
    private running;
    private activeJobs;
    constructor(config?: CompanionConfig);
    reportStatus(): Promise<void>;
    start(): Promise<void>;
    stop(): void;
    private pollEvents;
    private handleJob;
    private sendJobEvent;
}
