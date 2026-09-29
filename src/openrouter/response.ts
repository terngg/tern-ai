import { record, TernError } from '../utils/errors.js';
import { protocolError, responseError } from './errors.js';

function textContent(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every(part => record(part) && part.type === 'text' && typeof part.text === 'string')) {
    return value.map(part => (part as { text: string }).text).join('');
  }
  throw protocolError('The response content is not text. Select a text model with: tern models');
}
export function contentFromResponse(value: unknown, streaming = false, secret = ''): { text: string; finished: boolean } {
  if (!record(value)) throw protocolError('Expected a JSON response object.');
  const error = responseError(value, secret);
  if (error) throw error;
  if (!Array.isArray(value.choices)) throw protocolError('The response has no choices array.');
  if (streaming && !value.choices.length && record(value.usage)) return { text: '', finished: false };
  const choice: unknown = value.choices[0];
  if (!record(choice)) throw protocolError('The response has no completion choice.');
  if (choice.finish_reason === 'error') throw protocolError('The provider reported an error while generating the response.');
  if (choice.finish_reason === 'length') throw new TernError('Model output reached its token limit. Request a smaller script; incomplete output was not saved.');
  if (choice.finish_reason === 'content_filter') throw new TernError('The model declined this request. Try rephrasing it.');
  const message = streaming ? choice.delta : choice.message;
  // Some providers omit delta (or send null) on a terminal/usage frame.
  if (streaming && (message === undefined || message === null) && (choice.finish_reason === 'stop' || record(value.usage))) {
    return { text: '', finished: choice.finish_reason === 'stop' };
  }
  if (!record(message)) throw protocolError(streaming ? 'The stream contains a malformed delta frame.' : 'The completion contains no message.');
  return { text: textContent(message.content), finished: choice.finish_reason === 'stop' };
}
