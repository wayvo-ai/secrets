import {
  parseShareFragment,
  shareFragment,
  dashboardFragment,
} from "../../lib/share-link";
import { test, expect, type Page, type Request } from "@playwright/test";
import { encrypt, token } from "../../lib/crypto";
// Records every request in the browser context, including third-party and popup
// traffic. Fragments never leave the browser, so they are dropped from request
// URLs (Playwright reports them on navigations); anything else that matches a
// secret — in the URL, any header or the body — is a leak.
function recordRequests(page: Page) {
  const requests: Request[] = [];
  page.context().on("request", (request) => requests.push(request));
  return async function expectNoLeak(secrets: string[]) {
    const sent = (
      await Promise.all(
        requests.map(async (request) => {
          const url = new URL(request.url());
          url.hash = "";
          return [
            url.href,
            ...Object.entries(await request.allHeaders()).flat(),
            request.postData() ?? "",
          ].join("\n");
        }),
      )
    ).join("\n");
    for (const secret of secrets)
      for (const form of new Set([secret, encodeURIComponent(secret)]))
        expect(sent).not.toContain(form);
  };
}
const checkOf = (envelope: { checkIv: string; checkCiphertext: string }) => ({
  checkIv: envelope.checkIv,
  checkCiphertext: envelope.checkCiphertext,
});
async function skipToContent(page: Page) {
  await page.getByRole("link", { name: "Skip to content" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  // A hashchange-triggered reload would land within this round trip.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
}
test("landing, responsive layout and security navigation", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Share a secret, just once." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "View source on GitHub" }),
  ).toHaveAttribute("href", "https://github.com/wayvo-ai/secrets");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("link", { name: "Security", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "How security works." }),
  ).toBeVisible();
});
test("opening does not claim; explicit reveal decrypts without key leakage", async ({
  page,
}) => {
  const plaintext = "example <script>alert(1)</script>",
    sealed = await encrypt(plaintext),
    id = token(),
    r = token(),
    fragment = shareFragment({ id, r, k: sealed.key });
  let claims = 0;
  const expectNoLeak = recordRequests(page);
  await page.route("**/api/secrets/status?*", (route) =>
    route.fulfill({
      json: {
        checkIv: sealed.envelope.checkIv,
        checkCiphertext: sealed.envelope.checkCiphertext,
      },
    }),
  );
  await page.route("**/api/secrets/reveal", (route) => {
    claims++;
    return route.fulfill({ json: { envelope: sealed.envelope } });
  });
  await page.goto(`/s${fragment}`);
  const link = page.url();
  await expect(
    page.getByRole("button", { name: "Reveal Secret" }),
  ).toBeEnabled();
  expect(claims).toBe(0);
  await page.getByRole("button", { name: "Reveal Secret" }).click();
  await expect(page.locator("pre")).toHaveText(
    "example <script>alert(1)</script>",
  );
  expect(claims).toBe(1);
  await expectNoLeak([link, fragment.slice(1), sealed.key, plaintext]);
  expect(await page.locator("script").count()).toBeGreaterThan(0);
  expect(page.url()).not.toContain("#");
});
test("wrong key never claims", async ({ page }) => {
  const sealed = await encrypt("example");
  let claims = 0;
  await page.route("**/api/secrets/status?*", (route) =>
    route.fulfill({
      json: {
        checkIv: sealed.envelope.checkIv,
        checkCiphertext: sealed.envelope.checkCiphertext,
      },
    }),
  );
  await page.route("**/api/secrets/reveal", (route) => {
    claims++;
    return route.fulfill({ status: 410 });
  });
  await page.goto(
    `/s${shareFragment({ id: token(), r: token(), k: token() })}`,
  );
  await expect(page.locator("[data-slot=alert]")).toContainText("invalid key");
  await expect(
    page.getByRole("button", { name: "Reveal Secret" }),
  ).toBeDisabled();
  expect(claims).toBe(0);
});
test("dashboard only displays scoped metadata", async ({ page }) => {
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: token(),
            label: "Staging access",
            createdAt: Date.now(),
            expiresAt: Date.now() + 60000,
            status: "Available",
            accessedAt: null,
          },
        ],
        next: null,
      },
    }),
  );
  await page.goto(`/d${dashboardFragment(token())}`);
  await expect(
    page.getByRole("cell", { name: "Staging access" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create Secret", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /reveal|delete|revoke/i }),
  ).toHaveCount(0);
});

test("create flow encrypts locally and only transiently displays the share link", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.open = (url) => {
      const p = new URL(String(url), location.origin);
      const channel = new URLSearchParams(p.hash.slice(1)).get("channel");
      if (!channel) throw new Error("Verification URL has no channel.");
      setTimeout(() => {
        const bus = new BroadcastChannel(channel);
        bus.postMessage("test-proof");
        bus.close();
      }, 20);
      return null;
    };
  });
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({ json: { items: [], next: null } }),
  );
  const expectNoLeak = recordRequests(page);
  await page.route("**/api/secrets", (route) =>
    route.fulfill({ json: { id: token() } }),
  );
  await page.goto(`/d${dashboardFragment(token())}`);
  await page
    .getByRole("button", { name: "Create Secret", exact: true })
    .click();
  await page.getByLabel("Name / label").fill("Staging access");
  await page.getByLabel("Secret text").fill("private browser plaintext");
  await page.getByRole("button", { name: "Verify you’re human" }).click();
  await expect(
    page.getByRole("button", { name: "Encrypt & create link" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Verify you’re human" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Encrypt & create link" }).click();
  const link = await page
    .getByRole("link", { name: "One-time secret link (opens in a new tab)" })
    .getAttribute("href");
  if (!link) throw new Error("No one-time link was rendered.");
  const fragment = new URL(link).hash,
    { r, k } = parseShareFragment(fragment);
  await expectNoLeak([
    link,
    fragment.slice(1),
    k,
    r,
    "private browser plaintext",
  ]);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("link", {
      name: "One-time secret link (opens in a new tab)",
    }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("capture layout", async ({ page }, info) => {
  await page.goto("/");
  await page.screenshot({
    path: `/tmp/wayvo-secrets-${info.project.name}.png`,
    fullPage: true,
  });
});

test("switching link fragments resets the loaded capability", async ({
  page,
}) => {
  const sealed = await encrypt("test"),
    first = token(),
    second = token();
  const ids: string[] = [];
  await page.route("**/api/secrets/status?*", (route) => {
    ids.push(new URL(route.request().url()).searchParams.get("id") ?? "");
    return route.fulfill({
      json: {
        checkIv: sealed.envelope.checkIv,
        checkCiphertext: sealed.envelope.checkCiphertext,
      },
    });
  });
  await page.goto(
    `/s${shareFragment({ id: first, r: token(), k: sealed.key })}`,
  );
  await expect(
    page.getByRole("button", { name: "Reveal Secret" }),
  ).toBeEnabled();
  await page.evaluate(
    (hash) => {
      location.hash = hash;
    },
    shareFragment({ id: second, r: token(), k: sealed.key }),
  );
  await expect.poll(() => ids.includes(second)).toBe(true);
});

test("verification bridge rejects missing isolated origin and loads no third-party script", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("challenges.cloudflare.com"))
      external.push(request.url());
  });
  await page.goto(
    "/verify.html#channel=11111111-1111-4111-8111-111111111111&action=dashboard&sitekey=1x00000000000000000000AA",
  );
  await expect(page.getByRole("status")).toContainText(
    "Verification is not configured",
  );
  expect(external).toEqual([]);
});

test("remember is opt-in, uses server expiry, and can be removed without deleting dashboard", async ({
  page,
}) => {
  const cap = token(),
    expiresAt = Date.now() + 60000;
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({ json: { items: [], next: null, expiresAt } }),
  );
  await page.goto(`/d${dashboardFragment(cap)}`);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wayvo.remembered-dashboard"),
    ),
  ).toBeNull();
  await page.getByRole("button", { name: "Remember", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("wayvo.remembered-dashboard") ?? "{}")
          .expires,
    ),
  ).toBe(expiresAt);
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Go to my dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create My Dashboard", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Go to my dashboard" }).click();
  await page
    .getByRole("button", { name: "Stop remembering on this device" })
    .click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wayvo.remembered-dashboard"),
    ),
  ).toBeNull();
  await expect(
    page.getByRole("heading", { name: "My Secrets", exact: true }),
  ).toBeVisible();
});

test("expired remembered access is removed when visiting homepage", async ({
  page,
}) => {
  const fragment = dashboardFragment(token());
  await page.addInitScript(
    ({ fragment }) =>
      localStorage.setItem(
        "wayvo.remembered-dashboard",
        JSON.stringify({ fragment, expires: Date.now() - 1 }),
      ),
    { fragment },
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Create My Dashboard", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Go to my dashboard" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wayvo.remembered-dashboard"),
    ),
  ).toBeNull();
});

test("rejected remembered dashboard clears saved access and offers creation; outages preserve it", async ({
  page,
}) => {
  const fragment = dashboardFragment(token());
  await page.goto("/");
  for (const status of [503, 401]) {
    await page.goto("/");
    await page.evaluate(
      (fragment) =>
        localStorage.setItem(
          "wayvo.remembered-dashboard",
          JSON.stringify({ fragment, expires: Date.now() + 60000 }),
        ),
      fragment,
    );
    await page.route("**/api/dashboard", (route) =>
      route.fulfill({ status, json: { error: "Dashboard unavailable" } }),
    );
    await page.goto(`/d${fragment}`);
    if (status === 503) {
      await expect(page.locator("[data-slot=alert]")).toContainText(
        "Dashboard unavailable",
      );
      expect(
        await page.evaluate(() =>
          localStorage.getItem("wayvo.remembered-dashboard"),
        ),
      ).not.toBeNull();
    } else {
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: "Invalid or expired dashboard link" }),
      ).toBeVisible();
      expect(
        await page.evaluate(() =>
          localStorage.getItem("wayvo.remembered-dashboard"),
        ),
      ).toBeNull();
      await expect(page).toHaveURL("/");
      await page
        .getByRole("button", { name: "Create My Dashboard", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Your private starting point" }),
      ).toBeVisible();
    }
    await page.unroute("**/api/dashboard");
  }
});

test("leak detector catches a share link sent in encoded form", async ({
  page,
}) => {
  const sealed = await encrypt("x"),
    fragment = shareFragment({ id: token(), r: token(), k: sealed.key });
  await page.route("**/api/secrets/status?*", (route) =>
    route.fulfill({ json: checkOf(sealed.envelope) }),
  );
  const expectNoLeak = recordRequests(page);
  await page.goto(`/s${fragment}`);
  const link = page.url();
  await page.evaluate(() =>
    fetch(`/api/leak?u=${encodeURIComponent(location.href)}`).catch(() => {}),
  );
  await expect(expectNoLeak([link, fragment.slice(1)])).rejects.toThrow();
});

test("skip link keeps the share link and revealed plaintext", async ({
  page,
}) => {
  const sealed = await encrypt("kept after skipping"),
    fragment = shareFragment({ id: token(), r: token(), k: sealed.key });
  let checks = 0;
  await page.route("**/api/secrets/status?*", (route) => {
    checks++;
    return route.fulfill({ json: checkOf(sealed.envelope) });
  });
  await page.route("**/api/secrets/reveal", (route) =>
    route.fulfill({ json: { envelope: sealed.envelope } }),
  );
  await page.goto(`/s${fragment}`);
  const reveal = page.getByRole("button", { name: "Reveal Secret" });
  await expect(reveal).toBeEnabled();
  await skipToContent(page);
  expect(new URL(page.url()).hash).toBe(fragment);
  await expect(reveal).toBeEnabled();
  expect(checks).toBe(1);
  await reveal.click();
  await expect(page.locator("pre")).toHaveText("kept after skipping");
  await skipToContent(page);
  await expect(page.locator("pre")).toHaveText("kept after skipping");
  expect(page.url()).not.toContain("#");
});

test("skip link keeps the dashboard capability", async ({ page }) => {
  const fragment = dashboardFragment(token());
  let loads = 0;
  await page.route("**/api/dashboard", (route) => {
    loads++;
    return route.fulfill({ json: { items: [], next: null } });
  });
  await page.goto(`/d${fragment}`);
  await expect(
    page.getByRole("heading", { name: "My Secrets", exact: true }),
  ).toBeVisible();
  await skipToContent(page);
  expect(new URL(page.url()).hash).toBe(fragment);
  expect(loads).toBe(1);
});

test("transient failures before claiming keep Reveal retryable", async ({
  page,
}) => {
  const sealed = await encrypt("retry works"),
    outcomes = ["ok", "unavailable", "offline", "ok"];
  let claims = 0;
  await page.route("**/api/secrets/status?*", (route) => {
    const outcome = outcomes.shift();
    if (outcome === "unavailable")
      return route.fulfill({
        status: 503,
        json: { error: "Service unavailable. Please try again." },
      });
    if (outcome === "offline") return route.abort("internetdisconnected");
    return route.fulfill({ json: checkOf(sealed.envelope) });
  });
  await page.route("**/api/secrets/reveal", (route) => {
    claims++;
    return route.fulfill({ json: { envelope: sealed.envelope } });
  });
  await page.goto(
    `/s${shareFragment({ id: token(), r: token(), k: sealed.key })}`,
  );
  const reveal = page.getByRole("button", { name: "Reveal Secret" }),
    alert = page.locator("[data-slot=alert]");
  await expect(reveal).toBeEnabled();
  await reveal.click();
  await expect(alert).toContainText("Service unavailable");
  await expect(reveal).toBeEnabled();
  await reveal.click();
  await expect(alert).toContainText("Could not reach the server");
  await expect(reveal).toBeEnabled();
  expect(claims).toBe(0);
  await reveal.click();
  await expect(page.locator("pre")).toHaveText("retry works");
  expect(claims).toBe(1);
});

test("a definitive failure before claiming disables Reveal", async ({
  page,
}) => {
  const sealed = await encrypt("gone"),
    outcomes = ["ok", "gone"];
  let claims = 0;
  await page.route("**/api/secrets/status?*", (route) =>
    outcomes.shift() === "gone"
      ? route.fulfill({
          status: 410,
          json: { error: "Already revealed, expired, or unavailable." },
        })
      : route.fulfill({ json: checkOf(sealed.envelope) }),
  );
  await page.route("**/api/secrets/reveal", (route) => {
    claims++;
    return route.fulfill({ json: { envelope: sealed.envelope } });
  });
  await page.goto(
    `/s${shareFragment({ id: token(), r: token(), k: sealed.key })}`,
  );
  const reveal = page.getByRole("button", { name: "Reveal Secret" });
  await reveal.click();
  await expect(page.locator("[data-slot=alert]")).toContainText(
    "Already revealed",
  );
  await expect(reveal).toBeDisabled();
  expect(claims).toBe(0);
});
