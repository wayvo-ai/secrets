<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Toolchain

This is a standalone open-source repository and is **not** built on `@wayvo-ai/core`. It
shares only the pnpm + Biome toolchain with the workspace root `CLAUDE.md`:

- **pnpm**: `pnpm install --frozen-lockfile`, `pnpm <script>`; `pnpm-lock.yaml` is the only lockfile.
- **Biome** for formatting and lint (no ESLint, no Prettier); config in `biome.json`.
- **Node.js 22+** (CI pins 22).

A husky pre-commit hook (`.husky/pre-commit`, installed by `pnpm install`) formats staged files and re-stages them,
then runs `pnpm lint` and `pnpm typecheck`. Before pushing, run the full gate: `pnpm check` (format check, lint,
typecheck, unit/integration tests, build) and `pnpm test:e2e` after a build.
Security notes live in `README.md`, `SECURITY.md` and `docs/security-review.md`.
