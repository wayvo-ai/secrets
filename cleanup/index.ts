// Scheduled retention Worker for the D1 database.
//
// Pages Functions cannot run cron triggers, so the daily cleanup lives in this
// separate Worker (see cleanup/wrangler.example.toml). It has a D1 binding and no
// public route. Deploy with `pnpm cleanup:deploy`.
export interface Env {
  DB: D1Database;
}
// Keep in sync with scripts/cleanup.sql; tests/cleanup.test.ts enforces this.
export const statements = [
  "DELETE FROM rate_limits WHERE expires_at < unixepoch('now') * 1000",
  "DELETE FROM secrets WHERE created_at < (unixepoch('now') - 365 * 86400) * 1000",
  "DELETE FROM dashboards WHERE last_accessed_at <= (unixepoch('now') - 365 * 86400) * 1000 AND NOT EXISTS (SELECT 1 FROM secrets WHERE secrets.dashboard_id = dashboards.id)",
];
export async function cleanup(db: D1Database) {
  const [rateLimits, secrets, dashboards] = await db.batch(
    statements.map((statement) => db.prepare(statement)),
  );
  return {
    rateLimits: rateLimits.meta.changes,
    secrets: secrets.meta.changes,
    dashboards: dashboards.meta.changes,
  };
}
export default {
  async scheduled(_controller, env) {
    // Counts only; never rows, keys or hashes.
    console.log("cleanup: removed", JSON.stringify(await cleanup(env.DB)));
  },
} satisfies ExportedHandler<Env>;
