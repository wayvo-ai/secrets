# Security review

Reviewed locally on 2026-10-11. The initial implementation and reviewed security fixes are combined in one initial commit on `main`.

## Review methods

- Independent Codex review of the repository, followed by verification of the route-limiting and dashboard-expiry fixes.
- Claude Code source review using `claude-opus-5-5`, confirmed from its session metadata. The first pass received a source-only snapshot, excluding local credentials. The second pass included verification assets and the revised implementation and reported no concrete exploitable issue in the supplied source. Its snapshot omitted the reveal page and migrations; these were inspected locally: key verification precedes the claim, successful reveal clears the fragment, and the schema enforces unique counters, active status, and the atomic quota trigger. Real interactive Turnstile behavior is not covered by these tests.
- Local integration tests with D1/R2 emulation, desktop/mobile browser tests against a production build, lint/type checks, and dependency audit.

These are code reviews and local tests, not a penetration-test certification.

## Verified findings and resolutions

| Finding                                                                                                 | Resolution                                                                                                                                        | Evidence                                                                                                                   |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Reveal expiry used request-arrival time, allowing a delayed body to finish after expiry                 | Atomic reveal uses a fresh claim timestamp after parsing/authentication                                                                           | Regression advances time during body read and verifies no claim occurs                                                     |
| Arbitrary API paths created independent D1 rate-counter entries before route matching                   | Reject unknown routes and wrong methods before any rate-counter access                                                                            | Regression sends 150 unknown paths without increasing row count; independent reviewer verified zero DB accesses            |
| Remembered access expired one year after saving, potentially later than the dashboard                   | API returns creation-based expiry; browser saves that value and removes expired entries on a subsequent visit                                     | Integration checks exact expiry; browser checks opt-in, reopening, removal, and expired entries                            |
| Same-origin Turnstile script could read remembered dashboard localStorage                               | Trusted app-origin bridge embeds a dedicated cross-origin verification site; exact origin/source checks, sandbox, bounded proof, pinned CSP       | VM tests reject wrong origins/sources and repeated completions; browser test confirms storage isolation and proof delivery |
| AES-GCM key-check ciphertext could be substituted for secret ciphertext by an actor controlling storage | Envelope v2 authenticates protocol/version/algorithm and distinct secret/check purposes with additional authenticated data; explicit 128-bit tags | Substitution regression rejects both directions; existing encrypt/decrypt and one-time-claim tests pass                    |
| Preview configuration could inherit production data bindings                                            | Preview environment explicitly has no D1/R2 bindings and API is disabled                                                                          | Disabled environment regression fails closed before accessing bindings                                                     |
| Labels could contain invisible control/bidirectional overrides                                          | API rejects control and directional override characters                                                                                           | Server validation inspected; ordinary Unicode labels remain supported                                                      |
| Turnstile verification could wait indefinitely                                                          | Ten-second request timeout; strict boolean success checks                                                                                         | Timeout configured in server verification call                                                                             |
| Retention wording conflated logical expiration with physical removal                                    | Privacy and security documentation distinguish daily cleanup, next-visit browser removal, and asynchronous storage deletion                       | Documentation review                                                                                                       |

Additional hardening: API noindex headers, static secret/dashboard noindex headers, app COOP/CORP headers, and omission of an undefined CORS origin when configuration is missing.

Envelope v2 deliberately does not support previously created development secrets. Recreate any old test secrets.

## Reviewed recommendations not treated as implementation vulnerabilities

- Revocation and dashboard rotation are potential future features. The supplied MVP explicitly excludes delete/revoke controls. Dashboard and redemption URLs remain bearer capabilities until expiration or claim; keep them private.
- The seven-day R2 lifecycle is an asynchronous physical-deletion backstop, not a promise that one-hour secrets disappear from storage at one hour. API expiration remains immediate. This limitation is disclosed.
- Secret IDs in status URLs are non-authorizing identifiers; retrieval still needs an independent capability. Operational logs still require review.
- Per-IP application rate limits do not prevent distributed or IPv6-address-rotation attacks and still consume database resources on valid endpoints. See the 2026-10-12 section below.
- Encryption does not protect against malicious delivered JavaScript, a compromised device, leaked full links, or a trusted dependency acting maliciously.

## Final local validation

`npm run check` passed formatting, lint, TypeScript, all 27 unit/integration tests, and the production build. `npm run test:e2e` passed all 22 desktop/mobile browser tests. Browser verification tests use a mocked cross-origin widget; they prove bridge isolation and message handling, not the live Cloudflare challenge. The fresh reveal-time check was added after the second Claude snapshot and validated by a focused regression and the full suite.

## Dependency audit

The production-only audit reports zero known vulnerabilities. The full audit reports five high-severity development-tool entries caused by one unpatched `braces` advisory (GHSA-vfj7-8cjw-p6xm) in the Next ESLint glob dependency chain. These are not shipped in the browser or API bundle. Do not supply untrusted glob patterns to lint tooling; check for an upstream patch. Downgrading Next’s lint configuration across major versions is not a safe automatic remediation.

## Subsequent inactivity policy change

At the operator’s request, dashboard lifetime now runs for 365 days after its last authenticated dashboard access, instead of creation. A migration backfills existing records from creation time. An atomic conditional update renews active dashboards without reviving expired ones; cleanup uses the same inactivity boundary. Remembered access on the current browser refreshes to the server-provided expiry when the dashboard is opened. Other browsers retain their last observed expiry until they revisit using a saved link. This policy change occurred after the independent review rounds described above.

## Subsequent abuse-protection changes (2026-10-12)

Changes made:

- IPv6 clients are rate-limited per /64 prefix instead of per address, so a prefix holder cannot mint a fresh bucket per address.
- Sources already over a limit in the current minute are refused from isolate memory without a D1 write. The first excess request on each isolate still writes, and distributed traffic still reaches D1 once per source per minute.
- A scheduled Worker in `cleanup/` runs the statements of `scripts/cleanup.sql` daily at 04:17 UTC and logs only row counts. A unit test pins its statements to that file and verifies the retention boundaries.

Application counters are not a defense against distributed volumetric traffic.
