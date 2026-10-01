import { TernError } from '../utils/errors.js';
/** Incremental SSE framer: UTF-8 is decoded by the caller; handles CR/LF split across chunks. */
export class SSEParser {
    emit;
    buffer = '';
    data = [];
    size = 0;
    constructor(emit) {
        this.emit = emit;
    }
    feed(chunk, final = false) {
        this.buffer += chunk;
        if (this.buffer.length > 1_048_576)
            throw new TernError('OpenRouter sent an oversized SSE frame.');
        while (true) {
            const match = /[\r\n]/.exec(this.buffer);
            if (!match || (match[0] === '\r' && match.index === this.buffer.length - 1 && !final))
                break;
            const line = this.buffer.slice(0, match.index);
            const width = this.buffer.slice(match.index, match.index + 2) === '\r\n' ? 2 : 1;
            this.buffer = this.buffer.slice(match.index + width);
            if (line === '') {
                if (this.data.length)
                    this.emit(this.data.join('\n'));
                this.data = [];
                this.size = 0;
            }
            else if (line === 'data' || line.startsWith('data:')) {
                const value = line === 'data' ? '' : line.slice(5).replace(/^ /, '');
                this.size += value.length;
                if (this.size > 1_048_576)
                    throw new TernError('OpenRouter sent an oversized SSE event.');
                this.data.push(value);
            }
        }
        // An unterminated event is deliberately not dispatched. Transport completion is checked separately.
    }
}
//# sourceMappingURL=sse.js.map