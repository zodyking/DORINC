# AGENTS.md

## Cursor Cloud specific instructions

DORINC is a **Nuxt 4** self-hosted invoice/shop-billing app (Nitro server, Vue 3, Pinia,
Tailwind 4, Drizzle ORM on PostgreSQL) plus background workers and an optional Laravel PDF
service. Standard commands live in `README.md` and `package.json` scripts — this section only
records the non-obvious things needed to run/test it in the Cursor Cloud VM.

### Runtime / services

| Service | Required | How to run (dev) | Notes |
|---|---|---|---|
| Nuxt dev server | yes | `PORT=3000 npm run dev` | Web app + all API routes + `/setup` wizard. Needs the `/shared` symlink (below). |
| PostgreSQL | yes | `sudo pg_ctlcluster 16 main start` | Not bundled. Local dev DB: `postgresql://dorinc:dorinc@127.0.0.1:5432/dorinc`. |
| General worker | optional | `npm run worker` | Mail/backups/AI/retention/IMAP. Without it, mail stays **Queued**. |
| PDF worker | optional | `PDF_RENDER_URL=http://localhost:8099 npm run worker:pdf` | Renders invoice/estimate PDFs **via the Laravel PDF service only** (no local Playwright). Jobs fail unless that service runs — expected in dev. |
| Laravel PDF service | only for PDF output | `docker/Dockerfile.laravel-pdf` (PHP 8.4 + DomPDF) | Everything except PDF generation works without it. |
| Redis | no | — | `redis` compose profile only; jobs use Postgres row locks. |

### Node version (important)

Requires **Node.js 24+**. `nvm` default is set to 24, so tmux/login shells get it. However
`/exec-daemon/node` (Node 22) is force-prepended to `PATH` for every tool-wrapped shell command,
so a plain `node`/`npm` in a wrapped command resolves to 22. For one-off wrapped commands that
must use 24, prepend the nvm bin:
`export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`. Long-running processes started in
tmux login shells already use 24.

### `/shared` symlink — required for `npm run dev`

`npm run dev` fails on every request (`Cannot find module '/shared/*.mjs'`) unless a root symlink
exists: `sudo ln -sfn /workspace/shared /shared`. The update script creates it; recreate it with
that command if missing. Root cause: with the pinned toolchain (`nitropack 2.13.4` + `vite 8.1.3`),
Nitro's dev bundle externalizes the three `.mjs` files in `shared/`
(`email-attachment-mime.mjs`, `email-css-artifact.mjs`, `email-quote-stripping.mjs`) and emits a
relative path with too many `../`, which resolves to `/shared/*.mjs`. The production build
(`npm run build`) inlines them correctly and does **not** need the symlink. The proper code-level
fix (not applied here to keep the repo unmodified) is to make the server import the `.ts` versions
(or add a Nitro externals/alias config) so the `.mjs` files are not externalized in dev.

### `.env` (gitignored) — dev secrets

A local `.env` provides `DATABASE_URL`, `APP_URL=http://localhost:3000`, and
`ENCRYPTION_MASTER_KEY` + `SESSION_SECRET`. The security keys are intentionally supplied via env
(the app reads/locks them from env) so **dev login survives running the test suite** — see the
test caveat below. The `/setup` wizard has already been completed (config in `.data/runtime.json`).
Super Admin: `admin@dorinc.local` / `DorincAdmin2026!`.

### Tests

Standard command: `npm test` (`vitest run` + `playwright test`). Tests read `DATABASE_URL` from
`.env`/env. As of setup, `npx vitest run` gives ~737 passing and ~40 failing across 782 tests. The
failures are **pre-existing on this branch**, not environment issues: name **title-casing
normalization** (app stores `Custtest…`, tests expect `CustTest…`), direct messaging disabled by
default (`DM_DISABLED`), and cascading aborted-transaction errors after the first failure in a file.

- Integration tests **truncate `app_settings`**, which wipes the setup-stored session secret /
  master key and would break dev login — this is why those keys are pinned in `.env`. Prefer a
  **dedicated test database** to avoid clobbering dev data: create `dorinc_test`, apply migrations,
  then run with `DATABASE_URL=postgresql://dorinc:dorinc@127.0.0.1:5432/dorinc_test`.
- Playwright e2e uses the dev server + `tests/e2e/global-setup.ts` fixtures and needs `DATABASE_URL`.

### Staff login via the browser (testing caveat)

Staff UI login sends a browser **geolocation accuracy** value; in the headless VM this exceeds the
backend cap (100000 m) and returns `geo-accuracy` validation error, blocking browser login. The
**API login works** (`POST /api/auth/login`). Do not edit `app/utils/staff-login-geo.ts` to work
around this — test staff-authenticated flows via API, or set up a real geolocation, instead.

### Production/alternative run path

`npm run build` then `PORT=3000 npm run preview` serves the Nitro `node-server` output (the Docker
deploy path). It does not need the `/shared` symlink and runs embedded workers when
`NODE_ENV=production`.
