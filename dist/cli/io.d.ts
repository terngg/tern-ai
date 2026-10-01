export declare function info(message: string): void;
export declare function output(message: string): void;
export declare function status(message: string): void;
export declare function warn(message: string): void;
export declare class TokenWriter {
    private readonly secret;
    private readonly destination;
    private pending;
    private dirty;
    constructor(secret: string, destination?: NodeJS.WriteStream);
    write(token: string): void;
    flush(): void;
    end(): void;
}
export declare function secretPrompt(provider?: string): Promise<string>;
export declare function question(prompt: string): Promise<string>;
