// Disable framework telemetry before Next initializes, on every platform.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
process.env.NEXT_TELEMETRY_DISABLED = '1';
const resolveWeb = createRequire(new URL('../apps/web/package.json', import.meta.url));
await import(pathToFileURL(resolveWeb.resolve('next/dist/bin/next')).href);
