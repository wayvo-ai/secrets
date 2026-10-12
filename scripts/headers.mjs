import nextEnv from "@next/env";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
nextEnv.loadEnvConfig(process.cwd(), false);
const verificationOrigin = process.env.NEXT_PUBLIC_VERIFICATION_ORIGIN || "";
if (verificationOrigin) {
  const url = new URL(verificationOrigin);
  if (
    url.protocol !== "https:" ||
    url.origin !== verificationOrigin ||
    url.origin ===
      new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://secrets.wayvo.ai")
        .origin
  )
    throw new Error("Verification must use a separate HTTPS origin");
}
// Static Next exports contain inline bootstrap scripts. Hash exact bytes instead of allowing unsafe-inline.
async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory()
          ? htmlFiles(`${directory}/${e.name}`)
          : e.name.endsWith(".html")
            ? [`${directory}/${e.name}`]
            : [],
      ),
    )
  ).flat();
}
const hashes = new Set();
for (const path of await htmlFiles("out")) {
  const html = await readFile(path, "utf8");
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    if (match[1])
      hashes.add(
        `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`,
      );
  }
}
const policy = `default-src 'self'; script-src 'self' ${[...hashes].join(" ")}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
await writeFile(
  "out/_headers",
  `/*\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Resource-Policy: same-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: ${policy}\n\n/verify*\n  ! Content-Security-Policy\n  Content-Security-Policy: default-src 'none'; script-src 'self'; frame-src ${verificationOrigin || "'none'"}; connect-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'\n\n/d*\n  X-Robots-Tag: noindex, nofollow, noarchive\n\n/s\n  X-Robots-Tag: noindex, nofollow, noarchive\n\n/s.html\n  X-Robots-Tag: noindex, nofollow, noarchive\n\n/_next/static/*\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable\n`,
);
