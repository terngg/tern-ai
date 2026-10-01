import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { TernError } from '../utils/errors.js';
import { redact, terminalText, secretTailLength } from '../utils/security.js';
export function info(message) { process.stderr.write(terminalText(redact(message)) + '\n'); }
export function output(message) { process.stdout.write(terminalText(redact(message)) + '\n'); }
export function status(message) { info('● ' + message); }
export function warn(message) { info('⚠ ' + message); }
export class TokenWriter {
    secret;
    destination;
    pending = '';
    dirty = false;
    constructor(secret, destination = process.stdout) {
        this.secret = secret;
        this.destination = destination;
    }
    write(token) {
        this.dirty = true;
        this.pending += token;
        // Hold a tail so split credentials/control sequences cannot leak across chunk boundaries.
        const retain = Math.max(secretTailLength(), this.secret.length + 32);
        this.pending = redact(this.pending, this.secret);
        if (this.pending.length > retain) {
            const split = this.pending.length - retain;
            this.destination.write(terminalText(this.pending.slice(0, split)));
            this.pending = this.pending.slice(split);
        }
    }
    flush() { if (this.pending)
        this.destination.write(terminalText(redact(this.pending, this.secret))); this.pending = ''; }
    end() { this.flush(); if (this.dirty)
        this.destination.write('\n'); this.dirty = false; }
}
export async function secretPrompt(provider = 'OpenRouter') {
    if (!process.stdin.isTTY || !process.stdout.isTTY)
        throw new TernError('tern auth requires a terminal. In automation, set GEMINI_API_KEY or OPENROUTER_API_KEY.');
    process.stdout.write(provider + ' API key (hidden): ');
    emitKeypressEvents(process.stdin);
    const previous = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    return new Promise((resolve, reject) => {
        let secret = '';
        const cleanup = () => { process.stdin.off('keypress', keypress); process.stdin.setRawMode(previous); process.stdin.pause(); process.stdout.write('\n'); };
        const keypress = (text, key) => {
            if (key.ctrl && key.name === 'c') {
                cleanup();
                reject(new TernError('Authentication cancelled.', 130));
            }
            else if (key.name === 'return' || key.name === 'enter') {
                cleanup();
                resolve(secret.trim());
            }
            else if (key.name === 'backspace')
                secret = secret.slice(0, -1);
            else if (text && !key.ctrl && !/[\x00-\x20\x7f]/.test(text) && secret.length < 1024)
                secret += text;
        };
        process.stdin.on('keypress', keypress);
    });
}
export async function question(prompt) {
    if (!process.stdin.isTTY || !process.stdout.isTTY)
        throw new TernError('This action requires a terminal. Use explicit non-interactive commands/options.');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        return (await rl.question(prompt)).trim();
    }
    finally {
        rl.close();
    }
}
//# sourceMappingURL=io.js.map