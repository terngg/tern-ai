const secrets = new Set<string>();
export function registerSecrets(values: string[]): void { for(const key of values) if(key) secrets.add(key); }
export function secretTailLength(): number { return Math.max(256,...[...secrets].map(k=>k.length+32)); }
export function maskKey(key: string): string {
  return key.length > 12 ? `${key.startsWith('sk-or-v1-')?'sk-or-v1-':key.startsWith('sk-or-')?'sk-or-':key.startsWith('AIza')?'AIza':key.startsWith('AQ.')?'AQ.':''}****${key.slice(-4)}` : '****';
}
export function redact(text: string, secret?: string): string {
  let safe = secret ? text.split(secret).join('[REDACTED]') : text;
  for(const key of [...secrets].sort((a,b)=>b.length-a.length)) safe=safe.split(key).join('[REDACTED]');
  safe = safe.replace(/(?:AIza[\w-]+|AQ\.[\w.-]+)/g,'[REDACTED]').replace(/(x-goog-api-key\s*[:=]\s*)[^\s"'&]+/gi,'$1[REDACTED]').replace(/([?&]key=)[^&\s"']+/gi,'$1[REDACTED]');
  safe = safe.replace(/sk-or-(?![a-z0-9-]*\*{4})[a-z0-9-]+/gi, '[REDACTED]');
  return safe.replace(/(Authorization\s*[:=]\s*(?:Bearer\s+)?)[^\s"']+/gi, '$1[REDACTED]');
}
// Untrusted model/file text must not execute terminal control sequences (OSC, CSI, C0).
export function terminalText(text: string): string {
  return text.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}
