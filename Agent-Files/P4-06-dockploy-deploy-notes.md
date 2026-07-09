# P4-06 — Dockploy deploy verification notes

**Purpose:** Pre-flight checklist for Docker Compose on Dockploy with external PostgreSQL.

## Compose validation (local)

```bash
docker compose config
docker compose --profile workers config
docker compose --profile migrate config
```

All three must exit 0 with no interpolation errors.

## Service layout (one container per service)

| Service | Profile | Port | Notes |
|---|---|---|---|
| `nuxt-app` | default | 3000 | Main Nuxt/Nitro app; healthcheck `GET /api/health` |
| `worker` | `workers` | — | General jobs: mail, thumbnails, AI, backups, retention |
| `pdf-worker` | `workers` | — | Playwright Chromium PDF renderer; polls `pdf_render_jobs` |
| `migrate` | `migrate` | — | One-shot: `docker compose run --rm migrate` before rollout |
| `redis` | `redis` | 6379 | Optional; not required for MVP queue (Postgres-backed) |

**NOT in compose:** PostgreSQL — connect all services via shared `DATABASE_URL`.

## Required environment (Dockploy project env)

Set on **every** service container (`nuxt-app`, `worker`, `pdf-worker`, `migrate`):

- `DATABASE_URL` — external Postgres connection string
- `APP_URL` — public URL (cookies, email links, OAuth redirects)
- `SESSION_SECRET` — 32+ random bytes
- `ENCRYPTION_MASTER_KEY` — 32-byte hex for AES-256-GCM
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `ADMIN_BOOTSTRAP_EMAIL` — restricts first-run Super Admin email
- `MAX_UPLOAD_MB` — upload size cap (default 25)

Optional: `REDIS_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NODE_ENV=production`.

## Dockploy rollout sequence

1. **Provision external PostgreSQL** (v15+; project tested on PG 18).
2. **Create Dockploy Compose app** pointing at repo `docker-compose.yml`.
3. **Set env vars** in Dockploy UI for all services.
4. **Run migrations** (one-shot):
   ```bash
   docker compose run --rm migrate
   ```
5. **Start default profile** (`nuxt-app` only) — verify `GET /api/health` → 200.
6. **Enable workers profile** — add `workers` to active profiles; confirm `pdf-worker` and `worker` containers healthy.
7. **First-run bootstrap** — visit `/setup`; email must match `ADMIN_BOOTSTRAP_EMAIL`.
8. **Smoke checks:**
   - Staff login → dashboard
   - `npm run smoke:load` (or run on CI against staging DB)
   - Super Admin → Control Panel health tiles (DB, SMTP, PDF worker, worker queue)
   - Portal login → invoices list scoped to customer

## Known local limitation

`docker compose up` / `docker version` may hang if Docker Desktop engine is unresponsive (same as P0-02/P1-38). Compose **config** validation still passes; runtime smoke must run on Dockploy or a healthy Docker host.

## Rollback

- Redeploy previous image tag.
- DB migrations are forward-only — test `migrate` on staging before production.
- Backup restore requires Super Admin step-up (P3-08).
