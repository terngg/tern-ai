import { type ProviderId } from '../providers/types.js';
export declare function providerId(value: string): ProviderId;
export declare function addCredential(provider: string): Promise<void>;
export declare function listCredentials(): Promise<void>;
export declare function removeCredential(id: string, yes?: boolean): Promise<void>;
export declare function testCredentials(target?: string): Promise<void>;
export declare function authMenu(): Promise<void>;
