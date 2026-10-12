import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, expect, it } from "vitest";
import worker, { cleanup, statements } from "../cleanup/index";
import { hash, token } from "../lib/crypto";
let mf: Miniflare, db: D1Database;
const day = 86400000;
beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response(''); } }",
    compatibilityDate: "2026-07-01",
    d1Databases: { DB: "cleanup-db" },
  });
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const file of ["0001_initial.sql", "0002_dashboard_activity.sql"])
    await db.exec(
      readFileSync(`migrations/${file}`, "utf8")
        .replace(/--[^\n]*/g, "")
        .replace(/\n/g, " "),
    );
});
afterAll(async () => {
  await mf?.dispose();
});
it("runs exactly the statements in scripts/cleanup.sql", () => {
  const scripted = readFileSync("scripts/cleanup.sql", "utf8")
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  expect(statements).toEqual(scripted);
});
it("removes expired counters and aged metadata, keeping live rows", async () => {
  const now = Date.now();
  await db.batch([
    db
      .prepare("INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?)")
      .bind("expired", now - 60000),
    db
      .prepare("INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?)")
      .bind("live", now + 60000),
  ]);
  const dashboards = { stale: token(), aged: token(), live: token() };
  for (const [name, id] of Object.entries(dashboards)) {
    const at = name === "live" ? now : now - 400 * day;
    await db
      .prepare(
        "INSERT INTO dashboards(id,capability_hash,created_at,last_accessed_at) VALUES (?,?,?,?)",
      )
      .bind(id, await hash(token()), at, at)
      .run();
  }
  const secrets = { aged: token(), live: token() };
  for (const [name, id] of Object.entries(secrets)) {
    const at = name === "live" ? now : now - 400 * day;
    await db
      .prepare(
        "INSERT INTO secrets(id,dashboard_id,label,object_key,redeem_capability_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        dashboards[name as keyof typeof secrets],
        name,
        `secrets/${id}.json`,
        await hash(token()),
        at,
        at + 3600000,
      )
      .run();
  }
  const logs: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(" "));
  try {
    await worker.scheduled(
      { cron: "17 4 * * *", scheduledTime: now, noRetry() {} },
      { DB: db },
    );
  } finally {
    console.log = log;
  }
  expect(logs).toEqual([
    'cleanup: removed {"rateLimits":1,"secrets":1,"dashboards":2}',
  ]);
  const keys = (await db.prepare("SELECT key FROM rate_limits").all()).results;
  expect(keys).toEqual([{ key: "live" }]);
  const remaining = async (table: string) =>
    (await db.prepare(`SELECT id FROM ${table}`).all()).results.map(
      (row) => row.id,
    );
  expect(await remaining("dashboards")).toEqual([dashboards.live]);
  expect(await remaining("secrets")).toEqual([secrets.live]);
  // A second run is a no-op.
  expect(await cleanup(db)).toEqual({
    rateLimits: 0,
    secrets: 0,
    dashboards: 0,
  });
});
