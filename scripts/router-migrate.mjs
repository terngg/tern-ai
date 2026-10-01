import pg from "pg";
import { readFile } from "node:fs/promises";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(
    await readFile(
      new URL("../migrations/001-router.sql", import.meta.url),
      "utf8",
    ),
  );
  await client.query("COMMIT");
  console.log("Router migration applied.");
} catch {
  console.error("Router migration failed. Credentials suppressed.");
  process.exitCode = 1;
} finally {
  await client.end();
}
