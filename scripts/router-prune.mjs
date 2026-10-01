import pg from "pg";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await db.connect();
  await db.query(
    "DELETE FROM tern_traces WHERE created_at<now()-interval '30 days'",
  );
  await db.query("DELETE FROM tern_sessions WHERE expires_at<now()");
  await db.query(
    "DELETE FROM tern_limits WHERE updated_at<now()-interval '30 days'",
  );
  console.log("Expired router metadata pruned.");
} finally {
  await db.end();
}
