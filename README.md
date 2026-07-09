<p align="center">
  <img src="public/images/banner-1.png" alt="DORINC Suite — Shop Invoice Software" width="100%">
</p>

# DORINC Suite

Self-hosted invoice, customer, vehicle, and fleet billing software for service shops.

Deploy the app, open `/setup`, connect your PostgreSQL database, and configure SMTP, security, and admin access in the browser. No required `.env` file for a normal install.

## Features

- **Invoices** — create, send, track, and record payments; PDF generation via Playwright
- **Customers & vehicles** — fleet-aware customer records with VIN / unit tracking
- **Service logs** — shop work history tied to vehicles and invoices
- **Catalog** — parts and labor line items
- **Customer portal** — customers view invoices, vehicles, and submit requests
- **Template designer** — customize invoice layout
- **Admin control** — users, permissions, audit logs, backups, SMTP, optional AI (OpenRouter)
- **First-run wizard** — database, security, and mail configured in the UI

## Requirements

| Dependency | Notes |
|---|---|
| **PostgreSQL** | External database (not bundled). Managed Postgres, Dockploy DB, or your own host. |
| **Node.js 24+** | For local development only. Docker images use Node 24. |
| **Docker** (recommended) | Production deploy via Compose |

Optional: Redis + background workers for mail/PDF queues in production.

## Quick start (Docker)

```bash
docker compose up -d --build
```

Open **http://localhost:3000/setup** and complete the wizard:

1. Connect PostgreSQL (connection is stored under `.data/` / the `dorinc-runtime` volume)
2. Create the Super Admin account
3. Configure SMTP (optional but recommended)
4. Finish security / app URL settings

The app listens on port **3000**. Persist the `dorinc-runtime` volume so database connection settings survive restarts.

### Production workers (optional)

```bash
docker compose --profile workers up -d --build
```

This starts the general worker and PDF worker alongside the app. Add Redis with `--profile redis` if you use a queue.

### Migrations on upgrade

First install migrates through `/setup`. For later upgrades:

```bash
docker compose --profile migrate run --rm migrate
```

## Local development

```bash
npm install
npm run dev
```

Then open **http://localhost:3000/setup** (same wizard as production).

Useful scripts:

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run db:seed` | Seed data (dev/test) |
| `npm test` | Unit + Playwright tests |
| `npm run lint` | ESLint |

## Configuration

Normal installs need **no environment variables**. The setup wizard writes:

- `.data/runtime.json` — PostgreSQL connection
- Encrypted `app_settings` in the database — SMTP, keys, app URL, etc.

Optional overrides (CI, advanced operators) are documented in [`.env.example`](.env.example):

```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
APP_URL=https://invoices.example.com
SESSION_SECRET=
ENCRYPTION_MASTER_KEY=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

## Stack

| Layer | Choice |
|---|---|
| App | Nuxt 4 / Vue 3 / TypeScript / Pinia / Tailwind |
| API | Nitro server routes |
| Database | PostgreSQL + Drizzle ORM |
| Files | Stored in PostgreSQL |
| PDF | Playwright Chromium (`pdf-worker`) |
| Email | SMTP |
| AI (optional) | OpenRouter |
| Deploy | Docker Compose (e.g. Dockploy) |

## Project layout

```
app/           Nuxt UI (pages, layouts, components)
server/        API routes, services, workers, mail
shared/        Shared validators & types
public/        Static assets (icons, banner, favicon)
docker/        App, worker, and PDF worker Dockerfiles
```

## License

Private / proprietary unless a license file is added to this repository.
