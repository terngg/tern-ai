export interface CompanionConfig {
    companionId: string;
    token: string;
    serverUrl: string;
    userId?: string;
    label: string;
    pairedAt: number;
}
export declare function loadCompanionConfig(): CompanionConfig | null;
export declare function saveCompanionConfig(config: CompanionConfig): void;
export declare const PID_FILE: string;
export declare const LOG_FILE: string;
export declare function getDaemonPid(): number | null;
export declare function saveDaemonPid(pid: number): void;
export declare function clearDaemonPid(): void;
