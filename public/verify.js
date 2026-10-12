// Trusted bridge: third-party code runs only in the cross-origin iframe.
const parameters = new URLSearchParams(location.hash.slice(1));
const channel = parameters.get("channel");
const action = parameters.get("action");
const sitekey = parameters.get("sitekey");
const verifier = parameters.get("verifier");
history.replaceState(null, "", "/verify.html");
const status = document.getElementById("status");
try {
  const origin = new URL(verifier);
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      channel || "",
    ) ||
    !["dashboard", "secret"].includes(action) ||
    !/^[A-Za-z0-9_-]{10,100}$/.test(sitekey || "") ||
    origin.protocol !== "https:" ||
    origin.origin !== verifier ||
    verifier === location.origin
  )
    throw new Error("Invalid verification configuration");
  const frame = document.createElement("iframe");
  frame.title = "Human verification";
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
  frame.referrerPolicy = "no-referrer";
  frame.width = "340";
  frame.height = "180";
  frame.src = `${verifier}/#${new URLSearchParams({ parent: location.origin, channel, action, sitekey })}`;
  let completed = false;
  window.addEventListener("message", (event) => {
    if (
      completed ||
      event.origin !== verifier ||
      event.source !== frame.contentWindow
    )
      return;
    const data = event.data;
    if (
      !data ||
      data.channel !== channel ||
      data.type !== "verified" ||
      typeof data.token !== "string" ||
      !data.token ||
      data.token.length > 2048
    )
      return;
    completed = true;
    const bus = new BroadcastChannel(channel);
    bus.postMessage(data.token);
    bus.close();
    status.textContent = "Verified. You can close this window.";
    window.close();
  });
  document.getElementById("challenge").appendChild(frame);
} catch {
  status.textContent =
    "Verification is not configured. Close this window and contact the operator.";
}
