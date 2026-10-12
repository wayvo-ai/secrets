// Served only from the dedicated verification origin, never with the app assets.
const parameters = new URLSearchParams(location.hash.slice(1));
const parentOrigin = parameters.get("parent");
const channel = parameters.get("channel");
const action = parameters.get("action");
const sitekey = parameters.get("sitekey");
history.replaceState(null, "", "/");
if (
  parentOrigin === "https://secrets.wayvo.ai" &&
  location.origin !== parentOrigin &&
  window.parent !== window &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    channel || "",
  ) &&
  ["dashboard", "secret"].includes(action) &&
  /^[A-Za-z0-9_-]{10,100}$/.test(sitekey || "")
) {
  const script = document.createElement("script");
  script.src =
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.onload = () =>
    window.turnstile.render(document.getElementById("challenge"), {
      sitekey,
      action,
      callback: (token) =>
        window.parent.postMessage(
          { type: "verified", channel, token },
          parentOrigin,
        ),
    });
  document.head.appendChild(script);
} else {
  document.getElementById("status").textContent =
    "Invalid verification request.";
}
