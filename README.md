# Wayvo Secrets

Share a secret, just once. Anonymous browser-encrypted sharing with a persistent, metadata-only dashboard. No account or email required.

Source: https://github.com/wayvo-ai/secrets · Intended hostname: https://secrets.wayvo.ai

## Design

Next.js static export (`out/`), TypeScript, Tailwind CSS 4, shadcn/ui form components (Radix primitives), Pages Functions, D1 and one private R2 bucket. Static Pages hosting is intentional; reconsider only if the product needs SSR. No Next.js API routes or storage credentials in the browser.

- Dashboard: `/d#<one Base62 value>`; the encoded value contains a version byte and a 256-bit capability; only the capability hash is persisted on the server. Opt-in Remember stores the capability in localStorage with the server-defined dashboard expiration (expired entries are removed on the next visit); Stop remembering removes it. Bookmark securely. Cross-device history comes from D1, not browser storage. Links expire after 365 days of inactivity. Authenticated dashboard access renews this period.
- Secret: `/s#<one Base62 value>`. The browser unpacks one version byte and three independent 256-bit values (ID, redemption token, AES key). This is compact encoding, not encryption or hashing. Random bytes do not meaningfully compress. The value uses only ASCII letters and digits. Earlier development link formats are not supported. Authorization tokens deliberately go to the API; the AES key never does.
- AES-256-GCM with fresh keys, distinct 96-bit secret / key-check nonces. Incorrect keys fail before a claim.
- GET only returns an authorized key-check envelope. POST Reveal wins a conditional D1 update before reading R2. Missing storage after a claim fails closed. Ciphertext deletion is best effort; D1 prevents replay.
- Metadata includes nonsecret labels and dates, never recoverable share links. “Accessed” is ciphertext issuance, not proof of human reading. An incomplete claim is shown as “Unavailable”.
- Verification is performed by a dedicated cross-origin widget inside a trusted bridge window opened with `noopener,noreferrer`; only its proof travels back over a random BroadcastChannel. The create/reveal documents load no external scripts.

## Local development

Node.js 22+ and pnpm. Install from the lockfile:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000. The development command creates missing local config files (`.env.local`, `.dev.vars`, `wrangler.toml`, `cleanup/wrangler.toml`) from the committed examples using public test keys and placeholder resource IDs, applies local D1 migrations, starts Wrangler's API runtime on loopback port 8788, and runs Next App Router with Fast Refresh on port 3000. Browser API calls remain same-origin through a development-only rewrite. Existing local configuration is preserved. Stop both processes with Ctrl+C. No production build is needed for UI edits.

For production-like verification, stop development and run `pnpm build`, then `pnpm preview --port 3000` with `SITE_ORIGIN=http://localhost:3000` in `.dev.vars`. Restart that preview after each rebuild so CSP hashes stay current. Production remains a static export: the development rewrite and development headers are not included. Strict production CSP is checked using the Pages preview, not the HMR server. `pnpm dev:frontend` is available if you want to manage the API process separately.

The example Turnstile keys are Cloudflare's public testing keys, not credentials. `LOCAL_TURNSTILE_TESTING=true` accepts Cloudflare's successful dummy-token response only when both the request URL and configured site origin are loopback hosts and the public test secret is selected. Public test secrets fail closed on production hosts. Browser tests mock verification and the API; integration tests run D1/R2 in workerd.

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm audit
```

The integration suite races 24 claims through two independent Worker instances sharing a real local D1 database and R2 namespace. Exactly one may receive ciphertext. It also tests expiry, wrong tokens, failed storage reads, unsafe bodies/origins, scope isolation, crypto and key exclusion from requests/storage. This is local D1 emulation, not a claim of remote production race verification.

The locally owned UI components in `components/ui/` are adapted from the shadcn/ui registry. Its MIT license is retained in `licenses/shadcn-ui.txt`.

## Release and security

Use `pnpm install --frozen-lockfile` and `pnpm check` on a reviewed commit. Source maps are not published by the build. Run dependency audits and keep the lockfile current.

Read [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md), and the public `/security` and `/privacy` pages. Open source does not prove deployed JavaScript matches a reviewed commit. Malicious client code, extensions, clipboard history and leaked links remain risks.

License: [Apache-2.0](LICENSE).

### Dependency audit (2026-10-12)

`pnpm audit` reports zero vulnerabilities, including development dependencies. `undici` and `sharp` overrides (in `pnpm-workspace.yaml`) select patched versions of local runtime tooling dependencies and are covered by the local integration checks.

### Toolchain compatibility

Type checking uses stable TypeScript 7 through the `@typescript/native` npm alias (`tsc`). The `typescript` dependency aliases Microsoft’s `@typescript/typescript6` compatibility package so Next.js can use the older compiler API. See [Microsoft’s supported side-by-side setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0).

Direct dependencies were checked against stable npm releases on 2026-10-11. Miniflare remains on its latest stable release; its npm `latest` tag currently points to an alpha. Formatting and linting use Biome. The dependency audit has no known vulnerabilities.
