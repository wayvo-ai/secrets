# Contributing

Use Node.js 22+ and `pnpm install --frozen-lockfile`. Read README.md and SECURITY.md before changing authorization, crypto, storage, or telemetry. Run `pnpm check` and `pnpm test:e2e` before submitting a pull request. Describe the behavior change and verification evidence. Never include live credentials, plaintext, capability URLs, or sensitive labels in fixtures, screenshots, logs or issues.

Preserve static export and API-only Pages Functions routing. Keep decryption keys exclusively in the browser. Any redemption changes must retain atomic claim-before-read and the two-Worker concurrency test. Add meaningful regression tests for changes to trust boundaries. Report vulnerabilities privately according to SECURITY.md.

The project is licensed under Apache-2.0; contributions are accepted under the repository license.
