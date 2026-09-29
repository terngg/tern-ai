export function maskSecret(secret: string): string {
  const key = secret.trim();
  if (key.length < 9) return "••••••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}
export function redactSecrets(text: string, secrets: string[]): string {
  let safe = text;
  for (const secret of secrets.filter(Boolean))
    safe = safe.split(secret).join("[redacted]");
  return safe.replace(
    /(?:AIza[\w-]{20,}|AQ\.[\w.-]{20,}|sk-or-v1-[\da-f]{20,}|sk-or-[\w-]{20,})/g,
    "[redacted]",
  );
}
