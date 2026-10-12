import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const bridge = readFileSync("public/verify.js", "utf8");
const channel = "11111111-1111-4111-8111-111111111111";
function run(
  verifier = "https://verify.secrets.wayvo.ai",
  action = "dashboard",
) {
  const messages: string[] = [];
  const frame = { contentWindow: {}, src: "", setAttribute() {} };
  const status = { textContent: "" };
  let listener: (e: object) => void = () => {};
  let appended = false;
  runInNewContext(bridge, {
    URL,
    URLSearchParams,
    location: {
      origin: "https://secrets.wayvo.ai",
      hash: `#${new URLSearchParams({ channel, action, sitekey: "1x00000000000000000000AA", verifier })}`,
    },
    history: { replaceState() {} },
    document: {
      getElementById: (id: string) =>
        id === "status"
          ? status
          : {
              appendChild() {
                appended = true;
              },
            },
      createElement: () => frame,
    },
    window: {
      addEventListener: (_type: string, callback: typeof listener) => {
        listener = callback;
      },
      close() {},
    },
    BroadcastChannel: class {
      postMessage(token: string) {
        messages.push(token);
      }
      close() {}
    },
  });
  return {
    messages,
    frame,
    status,
    get appended() {
      return appended;
    },
    send: (origin: string, source: object, token = "proof") =>
      listener({ origin, source, data: { type: "verified", channel, token } }),
  };
}
describe("isolated verification bridge", () => {
  it("fails closed for same-origin, absent, HTTP origins and invalid actions", () => {
    for (const origin of [
      "https://secrets.wayvo.ai",
      "",
      "http://verify.secrets.wayvo.ai",
    ]) {
      const state = run(origin);
      expect(state.appended).toBe(false);
      expect(state.status.textContent).toContain("not configured");
    }
    expect(run(undefined, "other").appended).toBe(false);
  });
  it("accepts only the configured iframe origin AND source, once", () => {
    const state = run();
    expect(state.appended).toBe(true);
    state.send("https://evil.example", state.frame.contentWindow);
    state.send("https://verify.secrets.wayvo.ai", {});
    expect(state.messages).toEqual([]);
    state.send("https://verify.secrets.wayvo.ai", state.frame.contentWindow);
    state.send("https://verify.secrets.wayvo.ai", state.frame.contentWindow);
    expect(state.messages).toEqual(["proof"]);
  });
  it("contains no Cloudflare script on the application origin", () => {
    expect(bridge).not.toContain("challenges.cloudflare.com");
  });
});
