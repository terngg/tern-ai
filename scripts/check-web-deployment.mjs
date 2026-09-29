import assert from 'node:assert/strict';
const origin = new URL(process.argv[2] || '').origin;
if (!origin.startsWith('https://')) throw new Error('Use the HTTPS deployment URL.');
async function request(path, init) {
  return fetch(origin + path, { ...init, redirect: 'error', signal: AbortSignal.timeout(30_000) });
}
const home = await request('/');
assert.equal(home.status, 200, 'Homepage must be public without login');
assert.match(await home.text(), /GTPS Lua|GTPS LUA/);
assert.match(home.headers.get('content-security-policy') || '', /object-src 'none'/);
assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
console.log('PASS public homepage and security headers');
const api = await request('/api/gtps');
assert.equal(api.status, 200);
const docs = await api.json();
assert.equal(docs.entries?.length, 485, 'All bundled GTPS API entries must be accessible');
console.log('PASS serverless GTPS reference: 485 entries');
const body = { providerMode: 'auto', keys: {}, prompt: 'Create test.lua', history: [], files: [] };
const missing = await request('/api/ai/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
assert.equal(missing.status, 401, 'Generation must require the requesting user\'s key');
assert.equal((await missing.json()).code, 'no_provider');
console.log('PASS no shared provider credential');
const cross = await request('/api/ai/generate', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://invalid.example' }, body: JSON.stringify(body) });
assert.equal(cross.status, 403);
console.log('PASS cross-origin request protection');
const malformed = await request('/api/ai/models', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{invalid' });
assert.equal(malformed.status, 400);
console.log('PASS request validation');
console.log(`Verified ${origin}; no live AI credential was used.`);
