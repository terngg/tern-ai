import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query("BEGIN");
  const migrationsDir = new URL("../migrations", import.meta.url).pathname;
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await client.query(sql);
  }
  await client.query("COMMIT");
  console.log("Router migrations applied successfully.");
} catch {
  console.error("Router migration failed. Credentials suppressed.");
  process.exitCode = 1;
} finally {
  await client.end();
}
