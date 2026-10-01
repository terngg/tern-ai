import { DedicatedRelayServer } from "../src/relay/server.js";

const port = Number(process.env.RELAY_PORT || 8787);
const server = new DedicatedRelayServer({ port });

await server.start();
console.log(`✓ Dedicated Tern Companion Relay listening on port ${port}`);
console.log(`  Health check: http://127.0.0.1:${port}/health`);
