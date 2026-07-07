# Devon On Site Repairs Inc — Invoice Suite

**Authoritative build specification for Cursor agents**

| Field | Value |
|---|---|
| Status | Authoritative |
| Version | 1.0 |
| Sources merged | PRD.txt + TAD.txt |
| UI reference | `Agent-Files/invoice-ui-mockups.html` |
| Build checklist | `Agent-Files/BUILD-CHECKLIST.md` |

---

## Cursor instructions

1. **SPEC.md** defines *what* and *how* to build.
2. **BUILD-CHECKLIST.md** is the execution tracker — work items in order, mark complete only when acceptance criteria pass.
3. **invoice-ui-mockups.html** is the visual source of truth for layout, tokens, navigation, and screen inventory.
4. Older planning notes must not override this document.

---

## 1. Product overview

### Purpose

Build a private, self-hosted invoice and service log management platform for **Devon On Site Repairs Inc (DORINC)**.

The platform manages customers, vehicles/buses, service logs, parts/services catalog, invoices, optional estimates, customer portal access, invoice PDFs, PostgreSQL file storage, backups, account types, permissions, audit logs, and approved AI features.

### Primary goals

- Mechanics upload service log photos from mobile.
- Accountants review logs and create professional invoices.
- Customers view their own vehicles and invoice PDFs.
- Customers submit service requests and correction requests.
- All live business data and files stay in PostgreSQL.
- The system is secure, auditable, and self-hosted.
- AI is used only where it gives clear value.

### Non-goals

- No separate role system — **account types only**.
- No external object storage for MVP live files.
- No jsPDF or browser print for official invoice PDFs.
- No forced estimate workflow — direct invoices remain first class.
- No AI auto-editing official records.

---

## 2. Technology stack

| Layer | Choice |
|---|---|
| Frontend | Nuxt 3, Vue 3 Composition API, TypeScript, Pinia, Tailwind CSS or UnoCSS, Nuxt UI / shadcn-vue / custom |
| Backend | Nuxt server routes (Nitro) |
| Database | **External PostgreSQL** (not containerized with app) |
| ORM | Drizzle (preferred) or Prisma |
| PDF engine | **Playwright Chromium** (server-side, dedicated `pdf-worker` container) |
| AI | OpenRouter (backend-only, encrypted API key) |
| Email | SMTP |
| Backups | Encrypted dumps → Google Drive; Gmail/SMTP for status notifications |
| Queue (optional) | Redis |

### Deployment architecture (updated)

Deploy via **Docker Compose on Dockploy**.

| Rule | Detail |
|---|---|
| Compose | One container **per application service** |
| External DB | PostgreSQL is **hosted outside** the compose stack (managed Postgres, Dockploy external DB, or dedicated DB host). App services connect via `DATABASE_URL`. |
| Not in compose | `postgres` container |
| MVP compose services | `nuxt-app` |
| Production compose services | `nuxt-app`, `worker`, `pdf-worker`, `redis` (optional) |
| Persistent files | All business files in PostgreSQL — no host filesystem dependency for live data |
| Secrets | Environment variables + encrypted admin settings only |

```
┌─────────────────────────────────────────────────────────────┐
│                     Dockploy (Docker Compose)               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  nuxt-app   │  │   worker    │  │ pdf-worker  │         │
│  │  (Nuxt 3)   │  │ OCR/AI/jobs │  │ Playwright  │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┼────────────────┘                 │
│                          │                                  │
│                   ┌──────▼──────┐   ┌─────────────┐        │
│                   │ redis (opt) │   │   SMTP      │        │
│                   └─────────────┘   └─────────────┘        │
└──────────────────────────┬──────────────────────────────────┘
                           │ DATABASE_URL
                    ┌──────▼──────┐
                    │ PostgreSQL  │  ← EXTERNAL (not in compose)
                    │  + bytea    │
                    └─────────────┘
```

---

## 3. Design system (from UI mockup)

Implement the **Ledger** design system from `invoice-ui-mockups.html`:

| Token | Value |
|---|---|
| Background | `#f8fafc` |
| Surface | `#ffffff` |
| Ink | `#0f172a` |
| Muted | `#64748b` |
| Accent | `#4f46e5` |
| Line | `#e2e8f0` |
| Radius | 10px / 14px |
| Font | Inter (UI), IBM Plex Mono (numbers/codes) |

**UX principle:** Mobile-first — mobile feels like a polished iPhone app; desktop feels like a command center (tables, split panes, filters, previews).

---

## 4. Account types and permissions

### Account types (no roles layer)

Super Admin · Admin · Manager · Accountant · Mechanic · Viewer · External Auditor · Customer

### Permission rules

- Each user has **one** account type.
- Account types carry permission bundles; user overrides allowed for edge cases.
- **Server enforces permissions on every API route** — UI hiding is not security.
- Deny overrides allow.
- Sensitive actions require step-up verification.
- High-risk actions require audit logging and a reason.

### Permission evaluation order

1. Load authenticated user → confirm active
2. Confirm internal users are email-verified and approved
3. Load account type permission bundle
4. Apply user permission overrides
5. Deny wins over allow
6. Validate record scope
7. Require step-up for sensitive actions if configured

### Permission key format

`module.action.scope` — e.g. `customers.read.all`, `invoices.send.all`, `service_logs.upload.own`

### Core tables

`account_types`, `permissions`, `account_type_permissions`, `user_permission_overrides`

**Do not use in MVP:** `roles`, `role_permissions`, `user_roles`

### Account type summaries

| Type | Summary |
|---|---|
| Super Admin | Full control; cannot be deleted/demoted by normal Admin |
| Admin | Day-to-day admin; no audit tampering or Super Admin demotion |
| Manager | Operational oversight; no backup/secret/permission mgmt unless granted |
| Accountant | Billing workflow — logs, invoices, PDFs, AI suggestions |
| Mechanic | Mobile upload; no invoice create/approve/send/void |
| Viewer | Read-only internal |
| External Auditor | Restricted read-only for CPA/bookkeeper/legal |
| Customer | Portal only; staff-created accounts; no self-signup |

---

## 5. Authentication

### Internal signup flow

1. Sign up → 2. Verify email (SMTP) → 3. Pending approval → 4. Admin/Super Admin approves → 5. Account type assigned

### First Super Admin bootstrap

- If no Super Admin exists → first-run setup screen
- First verified setup user becomes Super Admin
- Bootstrap locks after first Super Admin is created

### Session model (MVP)

Secure HTTP-only session cookies backed by PostgreSQL `sessions` table.

Cookie requirements: HTTP-only, Secure in production, SameSite Lax/Strict, rotated after login, expiration + inactivity timeout.

### Customer auth

- Staff creates portal access from customer menu
- Staff sends/resends credential email manually
- Every send logged in `customer_credential_email_logs`
- Temporary passwords expire; first login requires password change

---

## 6. Core modules

### 6.1 Customers

CRUD, archive/restore, billing/service addresses, contacts, tax exempt, payment terms, notes. Search by name, contact, bus #, VIN, plate, invoice #. Full history timeline.

### 6.2 Vehicles and buses

Belong to customers. Fields: bus number (unique per customer), unit/tag, VIN, plate, year/make/model/trim, body, engine, fuel, mileage, color, status, notes. VIN decode via **NHTSA vPIC** server-side — store normalized + raw JSON.

### 6.3 Parts and services catalog

Types: service, part, fee, labor rate. Default pricing, taxable flag, category, SKU, vendor, cost, markup, UOM. Invoice line items store **catalog snapshots**. Inventory tracking disabled in MVP.

### 6.4 Service logs

Mechanics upload photos from mobile. Statuses: `uploaded`, `ocr_processing`, `ai_processing`, `ready_for_review`, `in_review`, `needs_info`, `approved_for_invoice`, `converted_to_invoice`, `rejected`, `archived`.

### 6.5 Invoices

Direct creation is first class. Paths: blank, from customer, vehicle, service log, service request, approved estimate, duplicate. Server calculates totals. Finalized PDFs immutable. Corrections via revisions/adjustments — never silent overwrite.

### 6.6 Estimates (optional — Phase 3)

Customer approve/reject in portal. Approved estimate converts to invoice or future work order.

---

## 7. Customer portal and requests

### Portal capabilities

View own company, vehicles, invoices, PDFs. Submit: invoice corrections, vehicle corrections, new vehicle requests, service requests. Cannot edit official records or see internal data.

### Request workflows

| Request | Flow |
|---|---|
| Vehicle add | Customer submits → staff reviews → approved creates vehicle |
| Vehicle correction | Customer requests → staff approves → official record updated |
| Invoice correction | Customer submits → accountant reviews → revision/adjustment if valid |
| Service request | Customer selects vehicle, describes issue → staff creates invoice/estimate/work order |

---

## 8. PostgreSQL file storage

All live business files in PostgreSQL for MVP — no external object storage.

**Stored:** service log originals/previews/thumbnails, invoice/estimate PDFs, customer/vehicle/request attachments.

### `app_files` schema

`id`, `owner_entity_type`, `owner_entity_id`, `file_kind`, `original_filename`, `mime_type`, `file_size_bytes`, `sha256_hash`, `width`, `height`, `binary_data`, `created_by`, `created_at`, `archived_at`

**Rules:** No blobs in list views. Generate thumbnails/previews. Stream large files. Enforce upload limits. Validate MIME. Archive instead of delete.

---

## 9. PDF and invoice designer

### PDF rules

- Official PDFs: **server-side Playwright Chromium only**
- No jsPDF, no client print for official documents
- Finalized PDFs immutable; template version stored with each PDF
- Default template: **Professional Bill Matrix**

### Template sections

Company logo/info · invoice #, status, dates, terms · bill to · service location · vehicle block · PO · service log ref · line item matrix · totals · notes · payment instructions · T&C · footer (page #, template version)

### Designer (Phase 3 advanced; basic in Phase 1)

Logo, accent color, font, Letter/A4, margins, section visibility/labels, preview with real data, draft/publish/version/duplicate/archive, set default. No custom code injection.

### PDF flow

1. Validate permission + status → 2. Build render payload → 3. Create `pdf_render_jobs` row → 4. `pdf-worker` renders → 5. Store PDF in `app_files` → 6. Create `invoice_files`/`estimate_files` → 7. Audit log

---

## 10. Approved AI features (Phase 2)

**In scope:** Service log extraction · Invoice description writer · Platform help assistant

**Explicitly excluded:** Auto invoice send, auto record edit, generic chatbots, tax decisions, predictive parts, voice assistant, daily brief, dispute assistant, quality check

### Service log extraction

Extract fields from photos; accountant reviews beside image; accept/edit/reject only; audited.

### Invoice description writer

Rewords mechanic notes for customer-facing descriptions only — cannot change price, qty, hours, tax, parts, totals. Original note preserved.

### Platform help

Explains app usage only — cannot modify records or bypass permissions.

### OpenRouter admin (`Settings > AI Settings`)

Encrypted API key, model selection per feature, spend caps, feature toggles, test connection, usage logs, key rotation, disable AI.

---

## 11. Audit logging

Append-only. Track all sensitive actions: CRUD on customers/vehicles, VIN decode, service log lifecycle, AI decisions, invoice/estimate lifecycle, PDF gen/download, portal credential emails, customer requests, permission changes, signup approval, backups, OpenRouter changes, editing sessions.

### `audit_logs` fields

`entity_type`, `entity_id`, `action`, `before_data`, `after_data`, `changed_fields`, actor snapshots, `permission_key`, `risk_level`, `ip_address`, `user_agent`, `request_id`, hash chain fields (Phase 3).

---

## 12. Editing sessions

Prevent concurrent edits on sensitive records.

- Acquire on edit mode open; others see read-only + editor name
- Heartbeat every 15–30s; stale after 60–120s without heartbeat
- Admin force-release requires reason + audit entry
- Table: `editing_sessions`

---

## 13. Backup and recovery

- **Destination:** Google Drive (encrypted); Gmail/SMTP for notifications
- **Format:** `backup_devon_invoice_suite_YYYYMMDD_HHMMSS.dump.zst.enc`
- **Includes:** Full DB (records + bytea files + audit + settings)
- **Schedule:** Nightly automatic + manual by permitted user
- **Retention:** daily 30d, weekly 12w, monthly 12mo
- **Recovery:** Super Admin + step-up + fresh safety backup + audit

Tables: `backup_integrations`, `backup_settings`, `backup_runs`

---

## 14. Application architecture

### Project structure

```
/app
  app.vue, layouts/, pages/, components/, composables/, stores/, middleware/
  server/
    api/, services/, repositories/, middleware/, jobs/
    pdf/, ai/, auth/, mail/, backups/, db/
  shared/types/, constants/, permissions/, validators/
```

### Layer rules

Pages/components → API routes → services (business rules) → repositories (DB). Permission checks before mutations. Audit inside/after transactions. Background jobs idempotent where possible.

### API lifecycle

Parse → authenticate → load user/account type → enforce permission → validate (Zod) → service → transaction → audit → typed response

### Error shape

```json
{ "code": "FORBIDDEN", "message": "...", "details": {}, "requestId": "..." }
```

Standard codes: `UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `EDIT_SESSION_ACTIVE`, `RATE_LIMITED`, `INTERNAL_ERROR`

---

## 15. Database architecture

- PostgreSQL is the sole system of record
- UUID primary keys on major tables
- `created_at` / `updated_at` on mutable tables; `archived_at` where archivable
- Money: `numeric(12,2)` — never float
- JSON: `jsonb` for snapshots, raw API payloads, render payloads, audit diffs, settings

### Schema groups

`auth` · `permissions` · `customers` · `vehicles` · `catalog` · `service_logs` · `invoices` · `estimates` · `customer_portal` · `files` · `ai` · `pdf` · `audit` · `backups` · `settings`

Full table definitions are in TAD sections 8–15 (preserved in checklist task references). Key tables: `users`, `customers`, `customer_contacts`, `customer_credential_email_logs`, `vehicles`, `catalog_items`, `catalog_labor_rates`, `service_logs`, `invoices`, `invoice_line_items`, `estimates`, `app_files`, `service_requests`, `vehicle_change_requests`, `invoice_change_requests`, `pdf_render_jobs`, `invoice_templates`, `invoice_template_versions`, `ai_provider_settings`, `ai_jobs`, `ai_suggestions`, `ai_usage_logs`, `audit_logs`, `editing_sessions`, `backup_*`, `mail_jobs`, `sessions`.

---

## 16. API surface

### Auth
`POST signup`, `verify-email`, `login`, `logout` · `GET me` · `POST admin/users/:id/approve|reject`

### Customers
CRUD, archive/restore, history, contacts, portal-access, send-credentials, credential-email-history

### Vehicles
CRUD, archive/restore, decode-vin, history

### Catalog
items, categories, labor-rates

### Service logs
CRUD, files upload, review-queue, ai-extract, convert-to-invoice, history

### Invoices
CRUD, line-items, improve-description, approve, send, mark-paid, generate-pdf, pdf download, history

### Estimates (Phase 3)
CRUD, send, customer approve/reject, convert-to-invoice, generate-pdf

### Customer portal
`GET portal/me|company|vehicles|invoices`, pdf download, vehicle/invoice-change/service requests, request comments

### Files
upload, preview, download, archive

### Editing sessions
acquire, heartbeat, release, admin release

### AI
service-log-extraction, invoice-description, platform-help, admin settings/usage

### Backups
status, settings, run, runs list, test-connection

### Audit
global search, entity history

---

## 17. UI screens (mockup inventory)

Map each Nuxt page to the mockup section in `invoice-ui-mockups.html`:

| Screen | Mockup section | Shell |
|---|---|---|
| Auth (login/signup) | AUTH | auth-screen |
| First-run setup | SERVER SETUP WIZARD | auth-screen |
| Staff dashboard | PAGE: DASHBOARD | app-shell |
| Invoices list | PAGE: INVOICES | app-shell |
| Invoice detail | PAGE: INVOICE DETAIL | app-shell |
| Invoice creator wizard | PAGE: INVOICE CREATOR | app-shell |
| Invoice editor | PAGE: INVOICE EDITOR | app-shell |
| Template designer | PAGE: TEMPLATE DESIGNER | app-shell |
| Record payment | PAGE: RECORD PAYMENT | app-shell |
| Customers list | PAGE: CUSTOMERS | app-shell |
| Customer detail | PAGE: CUSTOMER DETAIL | app-shell |
| Vehicles list | PAGE: VEHICLES | app-shell |
| Vehicle detail | PAGE: VEHICLE DETAIL | app-shell |
| Service logs queue | PAGE: SERVICE LOGS | app-shell |
| Service log detail | PAGE: SERVICE LOG DETAIL | app-shell |
| Catalog | PAGE: CATALOG | app-shell |
| Users list | PAGE: USERS | app-shell |
| User detail | PAGE: USER DETAIL | app-shell |
| Super Admin panel | PAGE: SUPER ADMIN CONTROL PANEL | app-shell |
| System logs (audit) | PAGE: SYSTEM LOGS | app-shell |
| My account | PAGE: MY ACCOUNT | app-shell |
| Platform help assistant | Platform help widget | app-shell |
| AI description popover | AI description assist | app-shell |
| Portal dashboard | Portal Dashboard | portal-shell |
| Portal invoices | Portal Invoices + detail | portal-shell |
| Portal vehicles | Portal Vehicles | portal-shell |
| Portal requests | Portal Requests (service/billing/general) | portal-shell |
| Portal account | Portal Account | portal-shell |

### Internal mobile nav

Home · Customers · Vehicles · Upload Log · Invoices · Activity · Profile

### Customer portal nav

Home · Vehicles · Invoices · Request Service · Requests · Profile

---

## 18. Background jobs

| Job type | Container |
|---|---|
| `service_log_ai_extraction` | worker |
| `invoice_description_ai` | worker |
| `pdf_render` | pdf-worker |
| `email_send` | worker |
| `backup_run`, `backup_verify` | worker |
| `thumbnail_generate`, `preview_generate` | worker |

Jobs must be retry-safe, store status/errors, and never block manual fallback.

---

## 19. Security

- Passwords: Argon2id or bcrypt
- `ENCRYPTION_MASTER_KEY` from env; OpenRouter/Google tokens encrypted in DB
- Rate limits: login, verify-email, credential send, AI, upload, PDF gen, backup
- Customer portal: every query scoped by linked `customer_id`
- Never expose: internal notes, costs, margins, audit logs to customers

---

## 20. Environment variables

### Required

`DATABASE_URL`, `APP_URL`, `SESSION_SECRET`, `ENCRYPTION_MASTER_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `ADMIN_BOOTSTRAP_EMAIL`, `MAX_UPLOAD_MB`

### Optional

`REDIS_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BACKUP_SCHEDULE`, `OCR_ENABLED`, `NODE_ENV`, `LOG_LEVEL`

---

## 21. Development phases

### Phase 1 — Internal MVP

Docker Compose (external DB), auth, permissions, customers, vehicles, VIN decode, catalog, service log upload, manual invoices, PDF generation, audit, editing sessions, basic encrypted backup

### Phase 2 — AI and customer portal

OpenRouter, AI features (3), customer portal, request queues, Google Drive backup

### Phase 3 — Advanced billing

Estimates, advanced designer, reports, audit hash chain, recovery test, suspicious activity, retention pruning

### Phase 4 — Future

PWA offline, push notifications, work orders, inventory, POs, PrinceXML, local AI

---

## 22. Non-negotiable engineering rules

1. Account types, not roles
2. Server enforces permissions on every route
3. All live files in PostgreSQL
4. No external object storage (MVP)
5. Direct invoice creation stays first class
6. Estimates optional
7. AI MVP: extraction, description writer, platform help only
8. AI cannot change records without human approval
9. OpenRouter key encrypted, backend-only
10. Official PDFs server-generated (Playwright)
11. No jsPDF / client print for official PDFs
12. Finalized PDFs immutable
13. Audit logs append-only
14. Users disabled, not deleted
15. Customers/vehicles/logs archived, not hard-deleted
16. Invoices revised/adjusted, not silently overwritten
17. Sensitive actions audited; step-up where configured

---

## 23. MVP acceptance criteria

MVP is complete when all of the following pass:

- [ ] Super Admin first-run setup works against external PostgreSQL
- [ ] Signup → verify email → pending → admin approval → account type
- [ ] Mechanics upload service log photos from mobile
- [ ] Accountants review logs and create invoices
- [ ] Customer/vehicle CRUD + search
- [ ] VIN decode server-side with raw response stored
- [ ] Catalog items on invoice line items with snapshots
- [ ] Invoice totals calculated server-side
- [ ] Professional PDFs generated and stored in PostgreSQL
- [ ] Customer portal: own vehicles + invoice PDFs only
- [ ] Customer requests enter internal review queues
- [ ] AI extraction via OpenRouter with accountant review
- [ ] AI description writer changes wording only
- [ ] Platform help answers app questions only
- [ ] Important actions create audit entries
- [ ] Encrypted backup runs and verifies
- [ ] Docker Compose deploys on Dockploy (nuxt-app + workers; DB external)
- [ ] UI matches Ledger design system from HTML mockup

---

*End of SPEC*
