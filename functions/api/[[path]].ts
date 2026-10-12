import {
  decode,
  hash,
  token,
  validToken,
  type Envelope,
} from "../../lib/crypto";
export interface Env {
  DEPLOYMENT_ENABLED?: string;
  LOCAL_TURNSTILE_TESTING?: string;
  DB: D1Database;
  BUCKET: R2Bucket;
  SITE_ORIGIN: string;
  TURNSTILE_SECRET: string;
  TURNSTILE_HOSTNAME: string;
  RATE_LIMIT_SALT: string;
}
class Failure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new Failure(status, message);
};
function shape(
  value: unknown,
  keys: string[],
): asserts value is Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k)) ||
    keys.some((k) => !(k in value))
  )
    fail(400, "Invalid request.");
}
async function body(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    fail(415, "JSON required.");
  const reader = request.body?.getReader();
  if (!reader) return fail(400, "Missing body.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 20000) {
      await reader.cancel();
      fail(413, "Request too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return fail(400, "Invalid JSON.");
  }
}
function bearer(request: Request) {
  const value = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!validToken(value)) return fail(401, "Invalid or unavailable link.");
  return value;
}
// Rate-limit on the client address; IPv6 clients are keyed on their /64 so an
// attacker holding a whole prefix cannot mint a fresh bucket per address.
function client(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  if (!ip.includes(":") || ip.split("::").length > 2) return ip;
  const [head, tail = ""] = ip.split("::"),
    h = head ? head.split(":") : [],
    t = tail ? tail.split(":") : [],
    groups = [
      ...h,
      ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"),
      ...t,
    ];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g)))
    return ip;
  return `${groups
    .slice(0, 4)
    .map((g) => g.toLowerCase().padStart(4, "0"))
    .join(":")}::/64`;
}
// Digests of sources already over a limit this minute. Refusing them from
// isolate memory means a sustained flood costs about one D1 write per minute
// per isolate instead of one per request.
const refused = new Map<string, number>();
async function rate(env: Env, key: string, limit: number) {
  const window = Math.floor(Date.now() / 60000),
    digest = await hash(`${env.RATE_LIMIT_SALT}:${window}:${key}`),
    message = "Too many requests. Try again in a minute.";
  if (refused.has(digest)) fail(429, message);
  const result = await env.DB.prepare(
    "INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(digest, (window + 2) * 60000)
    .first<{ count: number }>();
  if (!result) return fail(429, message);
  if (result.count > limit) {
    if (refused.size >= 10000)
      for (const [entry, minute] of refused)
        if (minute < window) refused.delete(entry);
    if (refused.size < 10000) refused.set(digest, window);
    fail(429, message);
  }
}
async function challenge(
  env: Env,
  value: unknown,
  action: string,
  request: Request,
) {
  if (typeof value !== "string" || value.length > 2048 || !value)
    fail(400, "Complete the verification.");
  if (!env.TURNSTILE_SECRET) fail(503, "Verification is not configured.");
  const testSecret =
    env.TURNSTILE_SECRET === "1x0000000000000000000000000000000AA";
  const localTest =
    env.LOCAL_TURNSTILE_TESTING === "true" &&
    ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname) &&
    ["localhost", "127.0.0.1"].includes(new URL(env.SITE_ORIGIN).hostname);
  if (testSecret && !localTest)
    fail(503, "Test verification keys are only allowed in local development.");
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET,
        response: value as string,
      }),
    },
  );
  if (!response.ok)
    fail(503, "Verification service unavailable. Please try again.");
  const result = (await response.json()) as {
    success: boolean;
    metadata?: { result_with_testing_key?: boolean };
    hostname: string;
    action: string;
  };
  if (testSecret && localTest) {
    if (
      result.success !== true ||
      result.metadata?.result_with_testing_key !== true ||
      value !== "XXXX.DUMMY.TOKEN.XXXX"
    )
      fail(403, "Local verification failed.");
    return;
  }
  if (
    result.success !== true ||
    result.hostname !== env.TURNSTILE_HOSTNAME ||
    result.action !== action
  )
    fail(403, "Verification failed. Please try again.");
}
function envelope(value: unknown): asserts value is Envelope {
  shape(value, [
    "version",
    "algorithm",
    "iv",
    "ciphertext",
    "checkIv",
    "checkCiphertext",
  ]);
  if (value.version !== 2 || value.algorithm !== "AES-256-GCM")
    fail(400, "Invalid envelope.");
  try {
    for (const field of ["iv", "checkIv", "ciphertext", "checkCiphertext"])
      if (typeof value[field] !== "string") throw new Error();
    if (
      decode(value.iv as string).length !== 12 ||
      decode(value.checkIv as string).length !== 12 ||
      value.iv === value.checkIv ||
      decode(value.ciphertext as string).length < 17 ||
      decode(value.ciphertext as string).length > 10256 ||
      decode(value.checkCiphertext as string).length !== 42
    )
      throw new Error();
  } catch {
    fail(400, "Invalid envelope.");
  }
}
async function dashboard(request: Request, env: Env) {
  const now = Date.now();
  const row = await env.DB.prepare(
    "UPDATE dashboards SET last_accessed_at=MAX(last_accessed_at,?) WHERE capability_hash=? AND last_accessed_at>? RETURNING id,created_at,last_accessed_at",
  )
    .bind(now, await hash(bearer(request)), now - 365 * 86400000)
    .first<{ id: string; created_at: number; last_accessed_at: number }>();
  if (!row) return fail(401, "Invalid or unavailable dashboard link.");
  return row;
}
const unavailable = () =>
  fail(410, "Already revealed, expired, or unavailable.");
async function route(request: Request, env: Env) {
  if (env.DEPLOYMENT_ENABLED === "false")
    fail(503, "This deployment is not enabled.");
  const url = new URL(request.url),
    path = url.pathname,
    now = Date.now();
  if (!env.RATE_LIMIT_SALT || !env.SITE_ORIGIN)
    fail(503, "Service is not configured.");
  if (request.method !== "GET" && request.method !== "POST")
    fail(405, "Method not allowed.");
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== env.SITE_ORIGIN
  )
    fail(403, "Invalid origin.");
  if (
    request.method === "POST" &&
    request.headers.get("origin") !== env.SITE_ORIGIN
  )
    fail(403, "Invalid origin.");
  const allowedRoutes: Record<string, string> = {
    "/api/dashboards": "POST",
    "/api/dashboard": "GET",
    "/api/secrets": "POST",
    "/api/secrets/status": "GET",
    "/api/secrets/reveal": "POST",
  };
  if (!Object.hasOwn(allowedRoutes, path)) fail(404, "Not found.");
  if (request.method !== allowedRoutes[path]) fail(405, "Method not allowed.");
  const creation =
    path === "/api/dashboards" ||
    (path === "/api/secrets" && request.method === "POST");
  await rate(
    env,
    `ip:${client(request)}:${creation ? "create" : path}`,
    creation ? 10 : 120,
  );
  if (path === "/api/dashboards" && request.method === "POST") {
    const data = await body(request);
    shape(data, ["capabilityHash", "turnstile"]);
    if (!validToken(data.capabilityHash)) fail(400, "Invalid capability hash.");
    await challenge(env, data.turnstile, "dashboard", request);
    await env.DB.prepare(
      "INSERT INTO dashboards(id,capability_hash,created_at,last_accessed_at) VALUES (?,?,?,?)",
    )
      .bind(token(), data.capabilityHash, Date.now(), Date.now())
      .run();
    return { created: true };
  }
  if (path === "/api/dashboard" && request.method === "GET") {
    const dashboardRow = await dashboard(request, env),
      id = dashboardRow.id,
      cursor = url.searchParams.get("before") || "";
    if (cursor && !/^\d{13}\.[A-Za-z0-9_-]{43}$/.test(cursor))
      fail(400, "Invalid cursor.");
    const [time, afterId] = cursor.split(".");
    const rows = await env.DB.prepare(
      `SELECT id,label,created_at,expires_at,status,accessed_at FROM secrets WHERE dashboard_id=? AND created_at>? AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 21`,
    )
      .bind(
        id,
        now - 365 * 86400000,
        time ? Number(time) : now + 1,
        time ? Number(time) : now + 1,
        afterId || "",
      )
      .all<{
        id: string;
        label: string;
        created_at: number;
        expires_at: number;
        status: string;
        accessed_at: number | null;
      }>();
    const page = rows.results.slice(0, 20);
    return {
      expiresAt: dashboardRow.last_accessed_at + 365 * 86400000,
      items: page.map((row) => ({
        id: row.id,
        label: row.label,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        status: row.accessed_at
          ? "Accessed"
          : row.status === "claimed"
            ? "Unavailable"
            : row.expires_at <= now
              ? "Expired"
              : "Available",
        accessedAt: row.accessed_at,
      })),
      next:
        rows.results.length > 20
          ? `${page.at(-1)?.created_at}.${page.at(-1)?.id}`
          : null,
    };
  }
  if (path === "/api/secrets" && request.method === "POST") {
    // Validate the body before spending the dashboard renewal, the per-dashboard
    // rate budget, the single-use Turnstile token, or any R2 write.
    const data = await body(request);
    shape(data, ["label", "ttl", "envelope", "redeemHash", "turnstile"]);
    if (
      typeof data.label !== "string" ||
      !data.label.trim() ||
      data.label.length > 100 ||
      /[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(
        data.label,
      ) ||
      ![3600, 86400, 259200, 604800].includes(data.ttl as number) ||
      !validToken(data.redeemHash)
    )
      fail(400, "Invalid secret metadata.");
    envelope(data.envelope);
    const dashboardId = (await dashboard(request, env)).id;
    await rate(env, `dashboard:${dashboardId}`, 10);
    // Cheap pre-check so a full dashboard fails before the Turnstile token is
    // consumed; the D1 trigger remains the atomic enforcement.
    const quota = await env.DB.prepare(
      "SELECT count(*) AS n FROM secrets WHERE dashboard_id=?",
    )
      .bind(dashboardId)
      .first<{ n: number }>();
    if ((quota?.n ?? 0) >= 100)
      fail(409, "Dashboard limit reached (100 secrets).");
    await challenge(env, data.turnstile, "secret", request);
    const createdAt = Date.now();
    const id = token(),
      objectKey = `secrets/${id}.json`;
    await env.BUCKET.put(objectKey, JSON.stringify(data.envelope), {
      httpMetadata: { contentType: "application/json" },
    });
    try {
      await env.DB.prepare(
        "INSERT INTO secrets(id,dashboard_id,label,object_key,redeem_capability_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?)",
      )
        .bind(
          id,
          dashboardId,
          (data.label as string).trim(),
          objectKey,
          data.redeemHash,
          createdAt,
          createdAt + (data.ttl as number) * 1000,
        )
        .run();
    } catch (error) {
      await env.BUCKET.delete(objectKey);
      if (String(error).includes("dashboard quota"))
        fail(409, "Dashboard limit reached (100 secrets).");
      throw error;
    }
    return { id };
  }
  if (path === "/api/secrets/status" && request.method === "GET") {
    const id = url.searchParams.get("id");
    if (!validToken(id)) return unavailable();
    const digest = await hash(bearer(request));
    const row = await env.DB.prepare(
      "SELECT object_key FROM secrets WHERE id=? AND redeem_capability_hash=? AND status='active' AND expires_at>?",
    )
      .bind(id, digest, Date.now())
      .first<{ object_key: string }>();
    if (!row) return unavailable();
    const object = await env.BUCKET.get(row.object_key);
    if (!object) return unavailable();
    const stored = await object.json<Envelope>();
    return { checkIv: stored.checkIv, checkCiphertext: stored.checkCiphertext };
  }
  if (path === "/api/secrets/reveal" && request.method === "POST") {
    const data = await body(request);
    shape(data, ["id"]);
    if (!validToken(data.id)) return unavailable();
    const digest = await hash(bearer(request));
    // Recheck time after the entire body/auth work, not at request arrival.
    const claimTime = Date.now();
    // Only the winner of this atomic operation may read the protected ciphertext.
    const row = await env.DB.prepare(
      "UPDATE secrets SET status='claimed',claimed_at=? WHERE id=? AND redeem_capability_hash=? AND status='active' AND expires_at>? RETURNING id,object_key",
    )
      .bind(claimTime, data.id, digest, claimTime)
      .first<{ id: string; object_key: string }>();
    if (!row) return unavailable();
    const object = await env.BUCKET.get(row.object_key);
    if (!object) return unavailable();
    const stored = await object.json<Envelope>();
    await env.DB.prepare("UPDATE secrets SET accessed_at=? WHERE id=?")
      .bind(Date.now(), row.id)
      .run();
    try {
      await env.BUCKET.delete(row.object_key);
    } catch {
      /* D1 prevents replay; lifecycle is the deletion backstop. */
    }
    return { envelope: stored };
  }
  return fail(404, "Not found.");
}
export async function handle(request: Request, env: Env): Promise<Response> {
  let status = 200,
    result: unknown;
  try {
    result = await route(request, env);
  } catch (error) {
    if (!(error instanceof Failure))
      console.error(
        "api: unexpected failure",
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : typeof error,
      );
    status = error instanceof Failure ? error.status : 503;
    result = {
      error:
        error instanceof Failure
          ? error.message
          : "Service unavailable. Please try again.",
    };
  }
  return Response.json(result, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      ...(env.SITE_ORIGIN
        ? { "Access-Control-Allow-Origin": env.SITE_ORIGIN }
        : {}),
      "X-Robots-Tag": "noindex, nofollow",
      Vary: "Origin",
    },
  });
}
export const onRequest: PagesFunction<Env> = ({ request, env }) =>
  handle(request, env);
