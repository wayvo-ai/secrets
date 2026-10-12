import { test, expect } from "@playwright/test";
// Route-fulfilled pages count as public, so Chromium's local-network-access
// checks would block any frame of the local preview before frame-ancestors is
// consulted. Disable them so only the app's own headers decide.
test.use({
  launchOptions: { args: ["--disable-features=LocalNetworkAccessChecks"] },
});
test("app pages refuse to render inside another origin's frame", async ({
  page,
  baseURL,
}) => {
  const framer = new URL("/framer", baseURL);
  framer.hostname = "127.0.0.1";
  await page.route(framer.href, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<iframe src="${baseURL}/s"></iframe><iframe src="${baseURL}/verify"></iframe><iframe src="${baseURL}/probe"></iframe>`,
    }),
  );
  // Control frame: proves this harness can render a cross-origin frame at all.
  await page.route(`${baseURL}/probe`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<main>frameable</main>",
    }),
  );
  await page.goto(framer.href);
  const [secret, bridge, control] = page.mainFrame().childFrames();
  await expect(control.locator("main")).toHaveText("frameable");
  for (const frame of [secret, bridge]) {
    await frame.waitForLoadState().catch(() => {});
    // A frame blocked by frame-ancestors shows the browser error page, never app content.
    expect(frame.url()).toBe("chrome-error://chromewebdata/");
    expect(await frame.locator("main, #status").count()).toBe(0);
  }
});
