<p align="center">
  <img src="public/images/banner-1.png" alt="DORINC — Shop Invoice Software" width="100%">
</p>

# DORINC

Self-hosted invoice, customer, vehicle, and fleet billing software for service shops.

Deploy with **Docker Compose on Dockploy**, open `/setup`, and finish configuration in the browser. No `.env` file is required for a normal install.

## Features

- Invoices, payments, and PDF generation
- Customers, vehicles, and fleet tracking
- Service logs, parts/labor catalog
- Customer portal
- Invoice template designer
- Admin: users, permissions, audit, backups, SMTP, optional AI

## Deploy on Dockploy

### 1. Provision PostgreSQL

Use an external database (Dockploy Postgres, managed Postgres, or your own host). PostgreSQL is **not** included in the compose stack.

### 2. Create the Compose app

In Dockploy, create a Compose application from this repo using `docker-compose.yml`.

| Service | Profile | Role |
|---|---|---|
| `nuxt-app` | default | Web app (port **3000**) |
| `worker` | `workers` | Mail, backups, AI, retention |
| `pdf-worker` | `workers` | Playwright PDF rendering |
| `migrate` | `migrate` | One-shot DB migrations on upgrade |
| `redis` | `redis` | Optional |

Persist the **`dorinc-runtime`** volume — it stores database connection settings under `.data/`.

### 3. Deploy and open setup

Deploy the default profile (`nuxt-app`). Then open:

```text
https://your-domain/setup
```

Complete the wizard:

1. Connect PostgreSQL
2. Create the Super Admin account
3. Configure security / app URL
4. Configure SMTP (recommended)
5. Optional: PDF, backup, and AI settings

Health check: `GET /api/health`

### 4. Enable workers (recommended)

In Dockploy, enable the `workers` profile so mail and PDF jobs run in the background.

### 5. Upgrades

After pulling a new release, run migrations once:

```bash
docker compose --profile migrate run --rm migrate
```

Then redeploy `nuxt-app` (and workers if enabled).

## Local development

```bash
npm install
npm run dev
```

Open **http://localhost:3000/setup**. Requires Node.js 24+ and PostgreSQL.

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run db:migrate` | Apply migrations |
| `npm test` | Unit + Playwright tests |

## License

Private / proprietary unless a license file is added to this repository.
