import {
  parseShareFragment,
  shareFragment,
  dashboardFragment,
  parseDashboardFragment,
} from "../lib/share-link";
import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { Miniflare } from "miniflare";
import { buildSync } from "esbuild";
import { readFileSync } from "node:fs";
import { encrypt, decrypt, verifyKey, token, hash } from "../lib/crypto";
import { ApiError, api, createSecret } from "../lib/client";
import { handle, type Env } from "../functions/api/[[path]]";
let mf: Miniflare, env: Env;
const origin = "http://localhost";
const dashboard = token();
const dashboardId = token();
const request = (path: string, cap?: string, data?: unknown) =>
  new Request(`${origin}/api/${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      ...(cap ? { Authorization: `Bearer ${cap}` } : {}),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
beforeAll(async () => {
  const code = buildSync({
    stdin: {
      contents:
        "import {handle} from './functions/api/[[path]].ts'; export default {fetch:handle};",
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
  }).outputFiles[0].text;
  mf = new Miniflare({
    workers: ["a", "b"].map((name) => ({
      name,
      modules: true,
      script: code,
      compatibilityDate: "2026-07-01",
      d1Databases: { DB: "shared-db" },
      r2Buckets: { BUCKET: "shared-bucket" },
      bindings: { SITE_ORIGIN: origin, RATE_LIMIT_SALT: "test-salt" },
    })),
  });
  const db = await mf.getD1Database("DB", "a");
  env = {
    DB: db as unknown as D1Database,
    BUCKET: (await mf.getR2Bucket("BUCKET", "a")) as unknown as R2Bucket,
    SITE_ORIGIN: origin,
    RATE_LIMIT_SALT: "test-salt",
    TURNSTILE_HOSTNAME: "secrets.test",
    TURNSTILE_SECRET: "test-secret",
  };
  const sql = readFileSync("migrations/0001_initial.sql", "utf8");
  // D1 exec's line handling differs from sqlite scripts; preserve the trigger as one statement.
  await db.exec(sql.replace(/--[^\n]*/g, "").replace(/\n/g, " "));
  await db.exec(
    readFileSync("migrations/0002_dashboard_activity.sql", "utf8").replace(
      /\n/g,
      " ",
    ),
  );
  await env.DB.prepare(
    "INSERT INTO dashboards(id,capability_hash,created_at,last_accessed_at) VALUES (?,?,?,?)",
  )
    .bind(dashboardId, await hash(dashboard), Date.now(), Date.now())
    .run();
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await mf?.dispose();
});
async function seed(expiry = Date.now() + 60000) {
  const id = token(),
    r = token(),
    sealed = await encrypt("confidential 🔐");
  await env.BUCKET.put(`secrets/${id}.json`, JSON.stringify(sealed.envelope));
  await env.DB.prepare(
    "INSERT INTO secrets(id,dashboard_id,label,object_key,redeem_capability_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?)",
  )
    .bind(
      id,
      dashboardId,
      "Nonsecret label",
      `secrets/${id}.json`,
      await hash(r),
      Date.now(),
      expiry,
    )
    .run();
  return { id, r, ...sealed };
}
describe("cryptography and transport", () => {
  it("round trips Unicode with independent random keys and distinct nonces", async () => {
    const a = await encrypt("秘密 🔐"),
      b = await encrypt("秘密 🔐");
    expect(await decrypt(a.key, a.envelope)).toBe("秘密 🔐");
    expect(a.key).not.toBe(b.key);
    expect(a.envelope.iv).not.toBe(a.envelope.checkIv);
    await verifyKey(a.key, a.envelope);
    await expect(verifyKey(b.key, a.envelope)).rejects.toThrow();
  });
  it("enforces byte limits", async () => {
    await expect(encrypt("🔐".repeat(3000))).rejects.toThrow();
    await expect(encrypt("")).rejects.toThrow();
  });
  it("never sends AES keys, plaintext, raw redeem tokens or full URLs during creation", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal("location", { origin });
    vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
      calls.push({ url, options });
      return Response.json({ id: token() });
    });
    const text = "private-value-938475";
    const link = await createSecret(dashboard, "label", text, 3600, "proof"),
      p = parseShareFragment(new URL(link).hash);
    const serialized = JSON.stringify(calls);
    expect(serialized).not.toContain(p.k);
    expect(serialized).not.toContain(p.r);
    expect(serialized).not.toContain(text);
    expect(serialized).not.toContain(link);
  });
});
describe("client error handling", () => {
  it("maps non-JSON and error responses to ApiError with the HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response("<!doctype html><title>429</title>", {
          status: 429,
          headers: { "content-type": "text/html" },
        }),
    );
    await expect(
      api("secrets/reveal", token(), { id: token() }),
    ).rejects.toEqual(
      expect.objectContaining({
        status: 429,
        message: expect.stringContaining("Request failed"),
      }),
    );
    vi.stubGlobal("fetch", async () =>
      Response.json({ error: "Too many requests." }, { status: 429 }),
    );
    const error = await api("dashboard", token()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("Too many requests.");
    vi.stubGlobal(
      "fetch",
      async () => new Response("not json", { status: 200 }),
    );
    await expect(api("dashboard", token())).rejects.toBeInstanceOf(ApiError);
  });
});
describe("D1 and R2 security boundary", () => {
  it("has exactly one ciphertext winner across separate Worker instances", async () => {
    const s = await seed();
    const a = await mf.getWorker("a"),
      b = await mf.getWorker("b");
    const responses = await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        (i % 2 ? a : b).fetch(`${origin}/api/secrets/reveal`, {
          method: "POST",
          headers: {
            Origin: origin,
            Authorization: `Bearer ${s.r}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ id: s.id }),
        }),
      ),
    );
    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 410)).toHaveLength(23);
    const result = (await responses.find((r) => r.status === 200)?.json()) as {
      envelope: typeof s.envelope;
    };
    expect(await decrypt(s.key, result.envelope)).toBe("confidential 🔐");
    expect(await env.BUCKET.get(`secrets/${s.id}.json`)).toBeNull();
  });
  it("status is non-consuming and invalid keys fail before any reveal", async () => {
    const s = await seed();
    const response = await handle(
      request(`secrets/status?id=${s.id}`, s.r),
      env,
    );
    const check = (await response.json()) as typeof s.envelope;
    expect(check).not.toHaveProperty("ciphertext");
    await expect(verifyKey(token(), check)).rejects.toThrow();
    expect(
      (
        await env.DB.prepare("SELECT status FROM secrets WHERE id=?")
          .bind(s.id)
          .first<{ status: string }>()
      )?.status,
    ).toBe("active");
    expect((await handle(request("secrets/reveal", s.r), env)).status).toBe(
      405,
    );
  });
  it("rejects wrong redemption, dashboard capability, and expired secrets", async () => {
    const s = await seed();
    for (const cap of [token(), dashboard])
      expect(
        (await handle(request("secrets/reveal", cap, { id: s.id }), env))
          .status,
      ).toBe(410);
    const expired = await seed(Date.now() - 1);
    expect(
      (
        await handle(
          request("secrets/reveal", expired.r, { id: expired.id }),
          env,
        )
      ).status,
    ).toBe(410);
  });
  it("fails closed if storage disappears after creation", async () => {
    const s = await seed();
    await env.BUCKET.delete(`secrets/${s.id}.json`);
    expect(
      (await handle(request("secrets/reveal", s.r, { id: s.id }), env)).status,
    ).toBe(410);
    await env.BUCKET.put(`secrets/${s.id}.json`, JSON.stringify(s.envelope));
    expect(
      (await handle(request("secrets/reveal", s.r, { id: s.id }), env)).status,
    ).toBe(410);
  });
  describe("failures after a successful claim never reopen the secret", () => {
    const row = (id: string) =>
      env.DB.prepare("SELECT status,accessed_at FROM secrets WHERE id=?")
        .bind(id)
        .first<{ status: string; accessed_at: number | null }>();
    const bucket = (overrides: Partial<R2Bucket>) =>
      ({
        get: (key: string) => env.BUCKET.get(key),
        put: (key: string, value: string) => env.BUCKET.put(key, value),
        delete: (key: string) => env.BUCKET.delete(key),
        ...overrides,
      }) as R2Bucket;
    async function claimFails(
      s: Awaited<ReturnType<typeof seed>>,
      faulty: Env,
    ) {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const response = await handle(
          request("secrets/reveal", s.r, { id: s.id }),
          faulty,
        );
        expect(response.status).toBe(503);
        const text = await response.text();
        expect(text).not.toContain(s.envelope.ciphertext);
        expect(JSON.stringify(logged.mock.calls)).not.toContain(
          s.envelope.ciphertext,
        );
      } finally {
        logged.mockRestore();
      }
      // A retry with healthy bindings must not retrieve the ciphertext.
      const retry = await handle(
        request("secrets/reveal", s.r, { id: s.id }),
        env,
      );
      expect(retry.status).toBe(410);
      expect(await retry.text()).not.toContain(s.envelope.ciphertext);
    }
    it("R2 read throws", async () => {
      const s = await seed();
      await claimFails(s, {
        ...env,
        BUCKET: bucket({
          get: async () => {
            throw new Error("R2 read failed");
          },
        }),
      });
      expect(await row(s.id)).toEqual({ status: "claimed", accessed_at: null });
    });
    it("stored object is not valid JSON", async () => {
      const s = await seed();
      await env.BUCKET.put(`secrets/${s.id}.json`, "{not json");
      await claimFails(s, env);
      expect(await row(s.id)).toEqual({ status: "claimed", accessed_at: null });
    });
    it("recording accessed_at fails", async () => {
      const s = await seed();
      await claimFails(s, {
        ...env,
        DB: {
          prepare: (sql: string) =>
            sql.startsWith("UPDATE secrets SET accessed_at")
              ? {
                  bind: () => ({
                    run: async () => {
                      throw new Error("D1 write failed");
                    },
                  }),
                }
              : env.DB.prepare(sql),
        } as unknown as D1Database,
      });
      expect(await row(s.id)).toEqual({ status: "claimed", accessed_at: null });
    });
    it("deleting the ciphertext fails", async () => {
      const s = await seed();
      const response = await handle(
        request("secrets/reveal", s.r, { id: s.id }),
        {
          ...env,
          BUCKET: bucket({
            delete: async () => {
              throw new Error("R2 delete failed");
            },
          }),
        },
      );
      expect(response.status).toBe(200);
      const { envelope } = (await response.json()) as {
        envelope: typeof s.envelope;
      };
      expect(await decrypt(s.key, envelope)).toBe("confidential 🔐");
      expect(await env.BUCKET.get(`secrets/${s.id}.json`)).not.toBeNull();
      expect(
        (await handle(request("secrets/reveal", s.r, { id: s.id }), env))
          .status,
      ).toBe(410);
      expect(
        (await handle(request(`secrets/status?id=${s.id}`, s.r), env)).status,
      ).toBe(410);
      expect((await row(s.id))?.status).toBe("claimed");
      expect((await row(s.id))?.accessed_at).toEqual(expect.any(Number));
    });
  });
  it("scopes metadata and excludes envelopes and capabilities", async () => {
    expect((await handle(request("dashboard", token()), env)).status).toBe(401);
    const response = await handle(request("dashboard", dashboard), env),
      text = await response.text();
    expect(response.status).toBe(200);
    for (const excluded of [
      "ciphertext",
      "object_key",
      "redeem",
      "capability_hash",
      dashboard,
    ])
      expect(text).not.toContain(excluded);
  });
  it("validates origins, shapes, body limits, and Turnstile", async () => {
    const cross = new Request(`${origin}/api/dashboards`, {
      method: "POST",
      headers: {
        Origin: "https://evil.test",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect((await handle(cross, env)).status).toBe(403);
    expect(
      (await handle(request("secrets", dashboard, { key: token() }), env))
        .status,
    ).toBe(400);
    expect(
      (
        await handle(
          request("secrets", dashboard, { padding: "x".repeat(21000) }),
          env,
        )
      ).status,
    ).toBe(413);
    vi.stubGlobal("fetch", async () => Response.json({ success: false }));
    expect(
      (
        await handle(
          request("dashboards", undefined, {
            capabilityHash: await hash(token()),
            turnstile: "bad",
          }),
          env,
        )
      ).status,
    ).toBe(403);
  });
  it("persists only allowed fields on actual creation", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        success: true,
        hostname: "secrets.test",
        action: "secret",
      }),
    );
    const sealed = await encrypt("never-store-me");
    const r = token();
    const response = await handle(
      request("secrets", dashboard, {
        label: "label",
        ttl: 3600,
        envelope: sealed.envelope,
        redeemHash: await hash(r),
        turnstile: "proof",
      }),
      env,
    );
    expect(response.status).toBe(200);
    const { id } = (await response.json()) as { id: string };
    const stored =
      JSON.stringify(
        await env.DB.prepare("SELECT * FROM secrets WHERE id=?")
          .bind(id)
          .first(),
      ) + (await (await env.BUCKET.get(`secrets/${id}.json`))?.text());
    for (const excluded of [sealed.key, r, "never-store-me", dashboard])
      expect(stored).not.toContain(excluded);
  });
});

describe("quotas, pagination and registration", () => {
  it("creates a persistent dashboard from only a capability hash", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({
        success: true,
        hostname: "secrets.test",
        action: "dashboard",
      }),
    );
    const cap = token();
    const created = await handle(
      request("dashboards", undefined, {
        capabilityHash: await hash(cap),
        turnstile: "proof",
      }),
      env,
    );
    expect(created.status).toBe(200);
    expect((await handle(request("dashboard", cap), env)).status).toBe(200);
    const row = await env.DB.prepare(
      "SELECT * FROM dashboards WHERE capability_hash=?",
    )
      .bind(await hash(cap))
      .first();
    expect(JSON.stringify(row)).not.toContain(cap);
  });
  it("enforces concurrent dashboard quota in D1 and paginates equal timestamps", async () => {
    const cap = token(),
      id = token(),
      now = Date.now();
    await env.DB.prepare(
      "INSERT INTO dashboards(id,capability_hash,created_at,last_accessed_at) VALUES (?,?,?,?)",
    )
      .bind(id, await hash(cap), now, now)
      .run();
    const results = await Promise.allSettled(
      Array.from({ length: 102 }, () => {
        const secretId = token();
        return env.DB.prepare(
          "INSERT INTO secrets(id,dashboard_id,label,object_key,redeem_capability_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?)",
        )
          .bind(
            secretId,
            id,
            "test",
            `secrets/${secretId}.json`,
            token(),
            now,
            now + 60000,
          )
          .run();
      }),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(100);
    let cursor: string | null = null;
    const ids: string[] = [];
    do {
      const response = await handle(
        request(`dashboard${cursor ? `?before=${cursor}` : ""}`, cap),
        env,
      );
      const page = (await response.json()) as {
        items: { id: string }[];
        next: string | null;
      };
      ids.push(...page.items.map((i) => i.id));
      cursor = page.next;
    } while (cursor);
    expect(new Set(ids).size).toBe(100);
    expect(ids).toHaveLength(100);
  });
  it("rejects a full dashboard before consuming the Turnstile token", async () => {
    const cap = token(),
      id = token(),
      now = Date.now();
    await env.DB.prepare(
      "INSERT INTO dashboards(id,capability_hash,created_at,last_accessed_at) VALUES (?,?,?,?)",
    )
      .bind(id, await hash(cap), now, now)
      .run();
    await env.DB.batch(
      Array.from({ length: 100 }, () => {
        const secretId = token();
        return env.DB.prepare(
          "INSERT INTO secrets(id,dashboard_id,label,object_key,redeem_capability_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?)",
        ).bind(
          secretId,
          id,
          "test",
          `secrets/${secretId}.json`,
          token(),
          now,
          now + 60000,
        );
      }),
    );
    let verifications = 0;
    vi.stubGlobal("fetch", async () => {
      verifications++;
      return Response.json({
        success: true,
        hostname: "secrets.test",
        action: "secret",
      });
    });
    const sealed = await encrypt("over quota");
    const response = await handle(
      request("secrets", cap, {
        label: "label",
        ttl: 3600,
        envelope: sealed.envelope,
        redeemHash: await hash(token()),
        turnstile: "proof",
      }),
      env,
    );
    expect(response.status).toBe(409);
    expect(verifications).toBe(0);
  });
  it("enforces request rate limits without persisting raw IPs", async () => {
    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        handle(
          new Request(`${origin}/api/dashboards`, {
            method: "POST",
            headers: {
              Origin: origin,
              "Content-Type": "application/json",
              "CF-Connecting-IP": "192.0.2.44",
            },
            body: "{}",
          }),
          env,
        ),
      ),
    );
    expect(responses.some((r) => r.status === 429)).toBe(true);
    expect(
      JSON.stringify(await env.DB.prepare("SELECT * FROM rate_limits").all()),
    ).not.toContain("192.0.2.44");
  });
  it("keys IPv6 rate limits on the /64 prefix", async () => {
    const post = (ip: string) =>
      handle(
        new Request(`${origin}/api/dashboards`, {
          method: "POST",
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            "CF-Connecting-IP": ip,
          },
          body: "{}",
        }),
        env,
      );
    // Twelve distinct addresses inside one /64 share a single bucket.
    const samePrefix = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        post(`2001:db8:0:1:${(i + 1).toString(16)}::${(i + 7).toString(16)}`),
      ),
    );
    expect(samePrefix.some((r) => r.status === 429)).toBe(true);
    // A neighbouring /64 and an IPv4 client are unaffected.
    expect((await post("2001:db8:0:2::1")).status).toBe(400);
    expect((await post("192.0.2.45")).status).toBe(400);
  });
  it("refuses an already-limited source from memory without D1 writes", async () => {
    const fixed = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(fixed);
    try {
      const post = () =>
        handle(
          new Request(`${origin}/api/dashboards`, {
            method: "POST",
            headers: {
              Origin: origin,
              "Content-Type": "application/json",
              "CF-Connecting-IP": "192.0.2.46",
            },
            body: "{}",
          }),
          env,
        );
      const writes = async () =>
        (
          await env.DB.prepare(
            "SELECT SUM(count) AS n FROM rate_limits",
          ).first<{
            n: number;
          }>()
        )?.n;
      const first = await Promise.all(Array.from({ length: 12 }, post));
      expect(first.some((r) => r.status === 429)).toBe(true);
      const before = await writes();
      const again = await Promise.all(Array.from({ length: 5 }, post));
      expect(again.every((r) => r.status === 429)).toBe(true);
      expect(await writes()).toBe(before);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

it("accepts verified dummy tokens only on explicitly configured loopback hosts", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      success: true,
      hostname: "example.com",
      metadata: { result_with_testing_key: true },
    }),
  );
  const local = {
    ...env,
    LOCAL_TURNSTILE_TESTING: "true",
    TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
  };
  const data = {
    capabilityHash: await hash(token()),
    turnstile: "XXXX.DUMMY.TOKEN.XXXX",
  };
  expect(
    (await handle(request("dashboards", undefined, data), local)).status,
  ).toBe(200);
  const prodOrigin = "https://secrets.wayvo.ai";
  const prodRequest = new Request(`${prodOrigin}/api/dashboards`, {
    method: "POST",
    headers: { Origin: prodOrigin, "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, capabilityHash: await hash(token()) }),
  });
  expect(
    (await handle(prodRequest, { ...local, SITE_ORIGIN: prodOrigin })).status,
  ).toBe(503);
  expect(
    (
      await handle(request("dashboards", undefined, data), {
        ...local,
        LOCAL_TURNSTILE_TESTING: undefined,
      })
    ).status,
  ).toBe(503);
});

describe("compact share links", () => {
  it("packs all values losslessly and is shorter than the legacy fragment", () => {
    const p = { id: token(), r: token(), k: token() },
      legacy = `#id=${p.id}&r=${p.r}&k=${p.k}`,
      compact = shareFragment(p);
    expect(parseShareFragment(compact)).toEqual(p);
    expect(() => parseShareFragment(legacy)).toThrow();
    expect(compact.length).toBeGreaterThanOrEqual(130);
    expect(compact.length).toBeLessThanOrEqual(131);
    expect(compact.length).toBeLessThan(legacy.length);
    expect(compact).toMatch(/^#[A-Za-z0-9]+$/);
  });
  it("rejects malformed, duplicate, mixed and unsupported fragments", () => {
    const p = { id: token(), r: token(), k: token() },
      fragment = shareFragment(p);
    for (const invalid of [
      "",
      "#hash=bad",
      `${fragment}&hash=x`,
      `${fragment}&k=${p.k}`,
      fragment.slice(0, -2),
      `#0${fragment.slice(1)}`,
      `#hash=${"a".repeat(300)}`,
    ])
      expect(() => parseShareFragment(invalid)).toThrow();
  });
});

it("round trips edge values without losing zero bytes", () => {
  for (const byte of [0, 255]) {
    const value = btoa(String.fromCharCode(...new Uint8Array(32).fill(byte)))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    const parts = { id: value, r: value, k: value };
    expect(parseShareFragment(shareFragment(parts))).toEqual(parts);
  }
});

it("encodes dashboard capabilities as unlabeled alphanumeric values", () => {
  for (const cap of [token(), "A".repeat(43)]) {
    const fragment = dashboardFragment(cap);
    expect(fragment).toMatch(/^#[A-Za-z0-9]+$/);
    expect(parseDashboardFragment(fragment)).toBe(cap);
    for (const bad of [
      `#t=${cap}`,
      `#0${fragment.slice(1)}`,
      `${fragment}_`,
      `#${"a".repeat(200)}`,
    ])
      expect(() => parseDashboardFragment(bad)).toThrow();
  }
});

it("rejects unknown API paths without creating rate-limit records", async () => {
  const before = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM rate_limits",
  ).first<{ n: number }>();
  for (let i = 0; i < 150; i++) {
    expect((await handle(request(`unknown-${i}`), env)).status).toBe(404);
  }
  const after = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM rate_limits",
  ).first<{ n: number }>();
  expect(after?.n).toBe(before?.n);
});

it("returns the dashboard inactivity expiration for remembered access", async () => {
  const response = await handle(request("dashboard", dashboard), env);
  expect(response.status).toBe(200);
  const data = (await response.json()) as { expiresAt: number };
  const row = await env.DB.prepare(
    "SELECT last_accessed_at FROM dashboards WHERE id=?",
  )
    .bind(dashboardId)
    .first<{ last_accessed_at: number }>();
  if (!row) throw new Error("Dashboard row missing.");
  expect(data.expiresAt).toBe(row.last_accessed_at + 365 * 86400000);
});

it("rejects key-check ciphertext substituted for secret ciphertext", async () => {
  const sealed = await encrypt("expected secret");
  await expect(
    decrypt(sealed.key, {
      ...sealed.envelope,
      iv: sealed.envelope.checkIv,
      ciphertext: sealed.envelope.checkCiphertext,
    }),
  ).rejects.toThrow();
  await expect(
    verifyKey(sealed.key, {
      checkIv: sealed.envelope.iv,
      checkCiphertext: sealed.envelope.ciphertext,
    }),
  ).rejects.toThrow();
});

it("disabled preview deployments cannot access data bindings", async () => {
  const response = await handle(request("dashboard", dashboard), {
    DEPLOYMENT_ENABLED: "false",
  } as Env);
  expect(response.status).toBe(503);
  expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
});

it("rejects invisible control and bidi label spoofing before verification", async () => {
  const cap = token();
  await env.DB.prepare(
    "INSERT INTO dashboards(id,capability_hash,created_at,last_accessed_at) VALUES (?,?,?,?)",
  )
    .bind(token(), await hash(cap), Date.now(), Date.now())
    .run();
  for (const label of ["name\u202ereversed", "name\u0000hidden"]) {
    const req = request("secrets", cap, {
      label,
      ttl: 3600,
      envelope: (await encrypt("test")).envelope,
      redeemHash: await hash(token()),
      turnstile: "unused",
    });
    req.headers.set("CF-Connecting-IP", "192.0.2.222");
    expect((await handle(req, env)).status).toBe(400);
  }
});

it("rejects a reveal when the secret expires while its body is being read", async () => {
  const start = Date.now();
  const sealed = await seed(start + 1000);
  let clock = start;
  const timer = vi.spyOn(Date, "now").mockImplementation(() => clock);
  const req = request("secrets/reveal", sealed.r, { id: sealed.id });
  req.headers.set("CF-Connecting-IP", "192.0.2.223");
  let read = false;
  Object.defineProperty(req, "body", {
    value: {
      getReader: () => ({
        read: async () => {
          if (read) return { done: true };
          read = true;
          clock = start + 2000;
          return {
            done: false,
            value: new TextEncoder().encode(JSON.stringify({ id: sealed.id })),
          };
        },
      }),
    },
  });
  try {
    expect((await handle(req, env)).status).toBe(410);
    expect(
      (
        await env.DB.prepare("SELECT status FROM secrets WHERE id=?")
          .bind(sealed.id)
          .first<{ status: string }>()
      )?.status,
    ).toBe("active");
  } finally {
    timer.mockRestore();
  }
});

it("renews active old dashboards but never revives inactive dashboards", async () => {
  const now = Date.now(),
    year = 365 * 86400000;
  const active = token(),
    expired = token(),
    activeId = token(),
    expiredId = token();
  for (const [id, cap, access] of [
    [activeId, active, now - 1000],
    [expiredId, expired, now - year - 1000],
  ] as const) {
    await env.DB.prepare(
      "INSERT INTO dashboards(id,capability_hash,created_at,last_accessed_at) VALUES (?,?,?,?)",
    )
      .bind(id, await hash(cap), now - 2 * year, access)
      .run();
  }
  expect((await handle(request("dashboard", active), env)).status).toBe(200);
  expect((await handle(request("dashboard", expired), env)).status).toBe(401);
  const row = await env.DB.prepare(
    "SELECT last_accessed_at FROM dashboards WHERE id=?",
  )
    .bind(activeId)
    .first<{ last_accessed_at: number }>();
  expect(row?.last_accessed_at).toBeGreaterThanOrEqual(now);
  await env.DB.exec(
    readFileSync("scripts/cleanup.sql", "utf8")
      .replace(/--[^\n]*/g, "")
      .replace(/\n/g, " "),
  );
  expect(
    await env.DB.prepare("SELECT id FROM dashboards WHERE id=?")
      .bind(activeId)
      .first(),
  ).not.toBeNull();
  expect(
    await env.DB.prepare("SELECT id FROM dashboards WHERE id=?")
      .bind(expiredId)
      .first(),
  ).toBeNull();
});

it("retains and lists year-long secret history, then cleans older metadata", async () => {
  const cap = token(),
    id = token(),
    now = Date.now(),
    day = 86400000;
  await env.DB.prepare(
    "INSERT INTO dashboards(id,capability_hash,created_at,last_accessed_at) VALUES (?,?,?,?)",
  )
    .bind(id, await hash(cap), now, now)
    .run();
  const recent = token(),
    old = token();
  for (const [secretId, age] of [
    [recent, 180],
    [old, 366],
  ] as const) {
    await env.DB.prepare(
      "INSERT INTO secrets(id,dashboard_id,label,object_key,redeem_capability_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?)",
    )
      .bind(
        secretId,
        id,
        "history",
        `secrets/${secretId}.json`,
        await hash(token()),
        now - age * day,
        now - (age - 1) * day,
      )
      .run();
  }
  const response = await handle(request("dashboard", cap), env);
  expect(response.status).toBe(200);
  const data = (await response.json()) as { secrets: { id: string }[] };
  expect(JSON.stringify(data)).toContain(recent);
  expect(JSON.stringify(data)).not.toContain(old);
  await env.DB.exec(
    readFileSync("scripts/cleanup.sql", "utf8")
      .replace(/--[^\n]*/g, "")
      .replace(/\n/g, " "),
  );
  expect(
    await env.DB.prepare("SELECT id FROM secrets WHERE id=?")
      .bind(recent)
      .first(),
  ).not.toBeNull();
  expect(
    await env.DB.prepare("SELECT id FROM secrets WHERE id=?").bind(old).first(),
  ).toBeNull();
});
