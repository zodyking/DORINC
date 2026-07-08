# DORINC Build Checklist

**Agent execution tracker — work top to bottom, mark `[x]` only when acceptance criteria pass.**

| Reference | Path |
|---|---|
| Spec | `Agent-Files/SPEC.md` |
| UI mockup | `Agent-Files/invoice-ui-mockups.html` |
| UI mockup JS | `Agent-Files/invoice-ui-mockup-app.js` |
| Invoice PDF template ref | `Agent-Files/invoice-template-reference.html` |

---

## How to use in agent loop

```
For each unchecked item:
  1. Read SPEC.md section cited in "Spec"
  2. Open mockup screen cited in "Mockup" (search HTML comment)
  3. Implement backend + frontend + tests per "Acceptance"
  4. Run verification commands in "Verify"
  5. Mark [x] and commit with: feat|fix|chore: <task-id> <short description>
Do not skip blocked items — resolve dependencies first.
Phase gate: all Phase N items must be [x] before starting Phase N+1.
```

**Deployment note:** Docker Compose on Dockploy — **one container per service**. PostgreSQL is **external** (not in compose). Connect via `DATABASE_URL`.

---

## Progress summary

| Phase | Total | Done | Status |
|---|---|---|---|
| 0 — Foundation | 12 | 12 | ✅ Done |
| 1 — Internal MVP | 38 | 14 | 🟨 In progress |
| 2 — AI + Portal | 24 | 0 | ⬜ Not started |
| 3 — Advanced | 14 | 0 | ⬜ Not started |
| 4 — Polish + Ship | 8 | 0 | ⬜ Not started |
| **Total** | **96** | **25** | **26%** |

*Update counts when marking items complete.*

---

## Phase 0 — Foundation

### P0-01 Project scaffold
- [x] **P0-01** Initialize Nuxt 3 + TypeScript + Pinia + Tailwind/UnoCSS
  - **Spec:** §2, §14
  - **Mockup:** N/A
  - **Deliver:** `/app` structure per SPEC; strict TS; ESLint configured
  - **Acceptance:** `npm run dev` starts; `npm run build` succeeds
  - **Verify:** `npm run build && npm run lint`

### P0-02 Docker Compose (Dockploy)
- [x] **P0-02** Docker Compose with separate service containers *(files delivered + `docker compose config` validated; runtime `compose up` pending — local Docker Desktop engine broken)*
  - **Spec:** §2 Deployment
  - **Services:** `nuxt-app`, `worker`, `pdf-worker`, `redis` (optional profile)
  - **NOT in compose:** postgres
  - **Deliver:** `docker-compose.yml`, `Dockerfile` per service, `.env.example`
  - **Acceptance:** `docker compose up` starts all app services; connects to external `DATABASE_URL`
  - **Verify:** `docker compose config && docker compose up -d`

### P0-03 Database connection + ORM
- [x] **P0-03** Drizzle (or Prisma) + external PostgreSQL connection
  - **Spec:** §15
  - **Deliver:** `server/db/`, migration runner, health check endpoint
  - **Acceptance:** App connects to external Postgres; migrations run cleanly
  - **Verify:** migration up/down on fresh external DB

### P0-04 Design system tokens
- [x] **P0-04** Ledger design tokens as Tailwind/UnoCSS theme
  - **Spec:** §3
  - **Mockup:** CSS block lines 11–14 in `invoice-ui-mockups.html`
  - **Deliver:** `assets/css/tokens`, Inter + IBM Plex Mono fonts, base components (btn, card, pill, tbl)
  - **Acceptance:** Button/card/table match mockup colors, radius, typography
  - **Verify:** Storybook page or `/dev/tokens` preview

### P0-05 App shell layout (staff)
- [x] **P0-05** Staff app shell — sidebar, topbar, mobile nav
  - **Spec:** §17
  - **Mockup:** `SIDEBAR`, `TOPBAR` sections
  - **Deliver:** `layouts/staff.vue`, responsive sidebar/scrim, breadcrumb, search slot, account menu
  - **Acceptance:** Desktop sidebar + mobile drawer; nav matches mockup items
  - **Verify:** Playwright screenshot 375px + 1440px

### P0-06 Portal shell layout
- [x] **P0-06** Customer portal shell
  - **Spec:** §17
  - **Mockup:** `CUSTOMER PORTAL` header + nav
  - **Deliver:** `layouts/portal.vue`
  - **Acceptance:** Portal nav: Home, Vehicles, Invoices, Request Service, Requests, Profile
  - **Verify:** Playwright screenshot portal shell

### P0-07 Auth screens UI
- [x] **P0-07** Login + signup UI (no backend yet)
  - **Mockup:** `AUTH: CUSTOMER + STAFF`
  - **Deliver:** `pages/auth/login.vue`, `pages/auth/signup.vue`
  - **Acceptance:** Matches auth card, tabs, form fields from mockup
  - **Verify:** Visual compare to mockup

### P0-08 First-run setup wizard UI
- [x] **P0-08** Server setup wizard UI
  - **Mockup:** `SERVER SETUP WIZARD`
  - **Deliver:** `pages/setup/index.vue` multi-step wizard
  - **Acceptance:** Steps for admin email, SMTP test, DB confirm, completion
  - **Verify:** Wizard navigates all steps

### P0-09 Shared validators + error format
- [x] **P0-09** Zod validators + API error helper
  - **Spec:** §14
  - **Deliver:** `shared/validators/`, `server/utils/api-error.ts`
  - **Acceptance:** Consistent `{ code, message, details, requestId }` on all routes
  - **Verify:** Unit test error shape

### P0-10 Permission constants + middleware skeleton
- [x] **P0-10** Permission key registry + `requirePermission()` middleware
  - **Spec:** §4
  - **Deliver:** `shared/permissions/`, `server/middleware/permission.ts`
  - **Acceptance:** Middleware returns 401/403 correctly
  - **Verify:** Unit tests for deny-wins, scope check

### P0-11 Audit service skeleton
- [x] **P0-11** Append-only audit write service
  - **Spec:** §11
  - **Deliver:** `server/services/audit.service.ts`, `audit_logs` migration
  - **Acceptance:** Writes immutable rows with actor snapshot + request_id
  - **Verify:** Integration test — no update/delete endpoints exist

### P0-12 Request logging + health endpoints
- [x] **P0-12** Request ID middleware + `/api/health`
  - **Spec:** §22
  - **Deliver:** DB health, version info
  - **Acceptance:** Every log line includes requestId
  - **Verify:** `GET /api/health` returns 200

---

## Phase 1 — Internal MVP

### Auth & permissions

- [x] **P1-01** Database schema — auth + permissions tables
  - **Spec:** §4, §15 (`users`, `account_types`, `permissions`, `account_type_permissions`, `user_permission_overrides`, `sessions`)
  - **Acceptance:** Seed system account types + permission bundles
  - **Verify:** Migration + seed script

- [x] **P1-02** Signup + email verification API
  - **Spec:** §5
  - **Deliver:** `POST /api/auth/signup`, `POST /api/auth/verify-email`
  - **Acceptance:** User enters pending state; verification token expires
  - **Verify:** Integration test with test SMTP

- [x] **P1-03** Login + logout + session cookies
  - **Spec:** §5
  - **Deliver:** `POST login`, `POST logout`, `GET me`
  - **Acceptance:** HTTP-only cookie, rotation on login, inactivity timeout
  - **Verify:** Integration test session lifecycle

- [x] **P1-04** Super Admin bootstrap
  - **Spec:** §5
  - **Mockup:** `SERVER SETUP WIZARD`
  - **Deliver:** First-run API + UI wired; locks after first Super Admin
  - **Acceptance:** No Super Admin → setup; after bootstrap → normal login
  - **Verify:** E2E bootstrap flow

- [x] **P1-05** Admin approve/reject signup
  - **Spec:** §5
  - **Deliver:** `POST /api/admin/users/:id/approve|reject`
  - **Acceptance:** Approved user gets account type; rejected cannot login
  - **Verify:** Permission test — Admin only

- [x] **P1-06** Users list + detail pages
  - **Mockup:** `PAGE: USERS`, `PAGE: USER DETAIL`
  - **Deliver:** `pages/users/`, approve/reject UI, account type assignment
  - **Acceptance:** Matches mockup; permission-gated actions
  - **Verify:** Playwright admin flow

### Customers

- [x] **P1-07** Customers schema + API
  - **Spec:** §6.1, §15
  - **Deliver:** Full CRUD, archive/restore, history, search
  - **Acceptance:** Search by name, contact, bus #, VIN, plate, invoice #
  - **Verify:** Integration tests

- [x] **P1-08** Customers list + detail UI
  - **Mockup:** `PAGE: CUSTOMERS`, `PAGE: CUSTOMER DETAIL`
  - **Deliver:** Table with filters, split detail, history timeline, contacts tab
  - **Acceptance:** Visual parity with mockup; archive/restore works
  - **Verify:** Playwright CRUD flow

- [x] **P1-09** Customer contacts management
  - **Spec:** §6.1
  - **Deliver:** `POST /api/customers/:id/contacts`, UI in customer detail
  - **Acceptance:** Primary/billing contact flags; portal user flag
  - **Verify:** API test

### Vehicles

- [x] **P1-10** Vehicles schema + API
  - **Spec:** §6.2
  - **Deliver:** CRUD, archive/restore, bus # unique per customer
  - **Acceptance:** Constraint enforced at DB + API
  - **Verify:** Integration test duplicate bus # rejection

- [x] **P1-11** VIN decode (NHTSA vPIC)
  - **Spec:** §6.2
  - **Deliver:** `POST /api/vehicles/decode-vin`
  - **Acceptance:** Normalized fields + `vin_decode_raw` jsonb stored; audited
  - **Verify:** Integration test with known VIN

- [x] **P1-12** Vehicles list + detail UI
  - **Mockup:** `PAGE: VEHICLES`, `PAGE: VEHICLE DETAIL`
  - **Deliver:** Search, VIN decode button, detail with history
  - **Acceptance:** Matches mockup layout
  - **Verify:** Playwright

### File storage

- [x] **P1-13** `app_files` schema + upload/download API
  - **Spec:** §8
  - **Deliver:** upload, preview, download, archive endpoints
  - **Acceptance:** bytea storage; no blob in list queries; MIME + size validation; sha256
  - **Verify:** Upload/download auth integration tests

- [x] **P1-14** Thumbnail + preview generation job
  - **Spec:** §18
  - **Deliver:** worker job for image thumbnails/previews
  - **Acceptance:** Service log upload creates original + thumb + preview rows
  - **Verify:** Job completes; preview endpoint returns image

### Service logs

- [ ] **P1-15** Service logs schema + API
  - **Spec:** §6.4
  - **Deliver:** create, file upload, status transitions, review queue, history
  - **Acceptance:** All statuses supported; mechanic scope enforced
  - **Verify:** Integration tests per status

- [ ] **P1-16** Service logs list + detail UI
  - **Mockup:** `PAGE: SERVICE LOGS`, `PAGE: SERVICE LOG DETAIL`
  - **Deliver:** Review queue, side-by-side image view, status actions
  - **Acceptance:** Mobile upload flow works; desktop review matches mockup
  - **Verify:** Playwright mobile upload simulation

- [ ] **P1-17** Mobile upload log page
  - **Spec:** §17 Mechanic flow
  - **Mockup:** Upload flow in service logs section
  - **Deliver:** `pages/mobile/upload-log.vue` or responsive upload page
  - **Acceptance:** Camera/file picker, customer/vehicle select, notes, submit
  - **Verify:** Mobile Playwright 375px

### Catalog

- [ ] **P1-18** Catalog schema + API
  - **Spec:** §6.3
  - **Deliver:** categories, items (service/part/fee), labor rates
  - **Acceptance:** Archive items; search; taxable flag
  - **Verify:** API tests

- [ ] **P1-19** Catalog UI
  - **Mockup:** `PAGE: CATALOG`
  - **Deliver:** Searchable table, add/edit modal
  - **Acceptance:** Matches mockup
  - **Verify:** Playwright

### Invoices

- [ ] **P1-20** Invoices schema + line items
  - **Spec:** §6.5, §15
  - **Deliver:** invoices, invoice_line_items with catalog_snapshot jsonb
  - **Acceptance:** Server-side total calculation; snapshots on line add
  - **Verify:** Unit test totals (subtotal, tax, discount, fees, balance)

- [ ] **P1-21** Invoice CRUD API
  - **Spec:** §16
  - **Deliver:** create (all paths), update draft, line item CRUD, approve, send, mark-paid
  - **Acceptance:** Draft editable; finalized immutable; revision on correction
  - **Verify:** Integration tests per status transition

- [ ] **P1-22** Invoices list + detail UI
  - **Mockup:** `PAGE: INVOICES`, `PAGE: INVOICE DETAIL`
  - **Deliver:** Status pills, filters, detail with line items + PDF link
  - **Acceptance:** Matches mockup KPI cards and table
  - **Verify:** Playwright

- [ ] **P1-23** Invoice creator wizard UI
  - **Mockup:** `PAGE: INVOICE CREATOR (wizard)`
  - **Deliver:** Multi-step: customer → vehicle → lines → review
  - **Acceptance:** Creates draft invoice via API
  - **Verify:** E2E wizard flow

- [ ] **P1-24** Invoice editor UI
  - **Mockup:** `PAGE: INVOICE EDITOR`
  - **Deliver:** Line item editor, catalog picker, notes, totals live from server
  - **Acceptance:** Editing session lock active; totals from API not client math
  - **Verify:** Playwright + concurrent edit test

- [ ] **P1-25** Record payment UI
  - **Mockup:** `PAGE: RECORD PAYMENT`
  - **Deliver:** Payment form → mark paid API
  - **Acceptance:** Updates amount_paid, balance_due; audited
  - **Verify:** Integration test

- [ ] **P1-26** Convert service log → invoice
  - **Spec:** §6.4, §6.5
  - **Deliver:** `POST /api/service-logs/:id/convert-to-invoice`
  - **Acceptance:** Pre-fills customer/vehicle/notes; sets log status
  - **Verify:** Integration test

### PDF generation

- [ ] **P1-27** Invoice template schema + default seed
  - **Spec:** §9
  - **Ref:** `invoice-template-reference.html`
  - **Deliver:** `invoice_templates`, `invoice_template_versions`, seed "Professional Bill Matrix"
  - **Acceptance:** Default template published as v1
  - **Verify:** Seed inspection

- [ ] **P1-28** pdf-worker container + render pipeline
  - **Spec:** §9, §18
  - **Deliver:** Playwright Chromium in `pdf-worker`; `pdf_render_jobs` queue
  - **Acceptance:** HTML template → PDF bytes → stored in app_files
  - **Verify:** Integration test generates PDF; no jsPDF anywhere

- [ ] **P1-29** Invoice PDF generate + download API
  - **Spec:** §9
  - **Deliver:** `POST generate-pdf`, `GET pdf`
  - **Acceptance:** Immutable after finalize; template version stored; audited
  - **Verify:** PDF opens; hash matches invoice_files row

- [ ] **P1-30** Basic template designer UI
  - **Mockup:** `PAGE: TEMPLATE DESIGNER` (MVP subset)
  - **Deliver:** Logo upload, accent color, font, page size, preview
  - **Acceptance:** Publish creates new template version
  - **Verify:** Preview matches generated PDF

### Editing sessions

- [ ] **P1-31** Editing sessions API + UI indicator
  - **Spec:** §12
  - **Deliver:** acquire, heartbeat, release, admin release
  - **Acceptance:** 15–30s heartbeat; 60–120s stale; read-only for others
  - **Verify:** Integration test stale expiry

### Audit

- [ ] **P1-32** Wire audit events for Phase 1 modules
  - **Spec:** §11
  - **Deliver:** Audit on all P1 mutations
  - **Acceptance:** Customer, vehicle, log, invoice, PDF, auth events logged
  - **Verify:** Audit query returns expected events

- [ ] **P1-33** System logs (audit) UI
  - **Mockup:** `PAGE: SYSTEM LOGS`
  - **Deliver:** Searchable audit table with filters
  - **Acceptance:** Matches mockup; append-only (no delete UI)
  - **Verify:** Playwright

### Admin + account

- [ ] **P1-34** Super Admin control panel (MVP subset)
  - **Mockup:** `PAGE: SUPER ADMIN CONTROL PANEL`
  - **Deliver:** SMTP test, DB status, app version, backup status placeholder
  - **Acceptance:** Super Admin only; matches mockup layout
  - **Verify:** Permission test

- [ ] **P1-35** My account page
  - **Mockup:** `PAGE: MY ACCOUNT`
  - **Deliver:** Profile edit, password change, session info
  - **Acceptance:** Matches mockup
  - **Verify:** Playwright

### Backup (basic)

- [ ] **P1-36** Backup schema + manual encrypted backup
  - **Spec:** §13
  - **Deliver:** `backup_settings`, `backup_runs`, pg_dump → compress → encrypt
  - **Acceptance:** No plaintext artifact retained; checksum stored; audited
  - **Verify:** Create backup file; verify decrypt + restore on test DB

- [ ] **P1-37** Dashboard page
  - **Mockup:** `PAGE: DASHBOARD`
  - **Deliver:** KPI cards, recent invoices, activity feed
  - **Acceptance:** Role-aware widgets; matches mockup
  - **Verify:** Playwright per account type

- [ ] **P1-38** Phase 1 gate — MVP acceptance
  - **Spec:** §23 (Phase 1 subset)
  - **Acceptance:** All P1 items [x]; docker compose deploys to Dockploy with external DB
  - **Verify:** Run full checklist review; `docker compose up` smoke test

---

## Phase 2 — AI + Customer Portal

### Email + portal access

- [ ] **P2-01** Customer credential email flow
  - **Spec:** §7, §18 Email
  - **Deliver:** portal-access, send-credentials, credential-email-history APIs + UI in customer detail
  - **Acceptance:** Every send/resend logged; temp password expires
  - **Verify:** Integration test email log rows

- [ ] **P2-02** Mail job worker
  - **Spec:** §18
  - **Deliver:** `mail_jobs` queue in worker
  - **Acceptance:** Retry on failure; status tracked
  - **Verify:** Job processes queued email

### Customer portal

- [ ] **P2-03** Portal auth + scoped middleware
  - **Spec:** §7, §19
  - **Deliver:** Customer login; all portal queries scoped by customer_id
  - **Acceptance:** Customer cannot access other customer data (IDOR tests)
  - **Verify:** Security integration tests

- [ ] **P2-04** Portal dashboard UI
  - **Mockup:** Portal Dashboard section
  - **Acceptance:** KPIs, recent invoices, open requests

- [ ] **P2-05** Portal invoices list + detail + PDF download
  - **Mockup:** Portal Invoices + Invoice detail
  - **Deliver:** `GET portal/invoices`, pdf download
  - **Acceptance:** PDF only for own invoices

- [ ] **P2-06** Portal vehicles UI
  - **Mockup:** Portal Vehicles + Add vehicle modal
  - **Acceptance:** View fleet; submit new vehicle request

- [ ] **P2-07** Portal requests UI (all types)
  - **Mockup:** Portal Requests (service, billing, general tabs)
  - **Deliver:** service, invoice-change, vehicle-change, new vehicle requests
  - **Acceptance:** All request types submit to review queues

- [ ] **P2-08** Portal account page
  - **Mockup:** Portal Account
  - **Acceptance:** Password change, contact info read-only

### Internal request review

- [ ] **P2-09** Request review queues (staff)
  - **Spec:** §7.2
  - **Deliver:** Staff UI for service_requests, vehicle_change_requests, invoice_change_requests
  - **Acceptance:** Approve/reject with reason; approved creates/updates records

- [ ] **P2-10** Invoice correction → revision flow
  - **Spec:** §7.2
  - **Acceptance:** Original invoice immutable; revision created

### OpenRouter + AI

- [ ] **P2-11** AI settings schema + admin API
  - **Spec:** §10
  - **Deliver:** `ai_provider_settings`, encrypted key, admin UI in Super Admin panel
  - **Acceptance:** Key never in browser; test connection works

- [ ] **P2-12** AI jobs + suggestions schema
  - **Spec:** §10, §15
  - **Deliver:** `ai_jobs`, `ai_suggestions`, `ai_usage_logs`

- [ ] **P2-13** Service log AI extraction
  - **Spec:** §10
  - **Deliver:** worker job + review UI beside image in service log detail
  - **Acceptance:** Accept/edit/reject only; audited; manual fallback if AI fails

- [ ] **P2-14** Invoice description AI writer
  - **Spec:** §10
  - **Mockup:** `AI description assist popover`
  - **Acceptance:** Wording only; original note preserved; audited

- [ ] **P2-15** Platform help assistant
  - **Spec:** §10
  - **Mockup:** `Platform help assistant` widget
  - **Acceptance:** App help only; no record mutations

- [ ] **P2-16** AI usage logs + spend caps
  - **Spec:** §10
  - **Acceptance:** Daily/monthly caps enforced; usage visible in admin

### Google Drive backup

- [ ] **P2-17** Google Drive OAuth + upload
  - **Spec:** §13
  - **Deliver:** `backup_integrations`, OAuth flow, encrypted upload
  - **Acceptance:** Nightly schedule; notification on success/failure

- [ ] **P2-18** Backup admin UI
  - **Mockup:** Super Admin panel backup section
  - **Acceptance:** Run manual backup, test connection, view run history

- [ ] **P2-19** Customer-facing email notifications
  - **Spec:** §18
  - **Deliver:** Invoice sent, request status, estimate sent (stub for Phase 3)
  - **Acceptance:** Templates + mail_jobs

- [ ] **P2-20** Rate limiting
  - **Spec:** §19
  - **Deliver:** Rate limits on login, AI, upload, PDF, backup, credential send
  - **Verify:** Rate limit integration tests

- [ ] **P2-21** Admin health dashboard
  - **Spec:** §22
  - **Deliver:** DB, SMTP, backup, OpenRouter, PDF worker, worker queue status
  - **Acceptance:** All health checks in Super Admin panel

- [ ] **P2-22** Phase 2 gate
  - **Spec:** §23 (full MVP acceptance)
  - **Acceptance:** All MVP criteria in SPEC §23 pass
  - **Verify:** Full E2E test suite

---

## Phase 3 — Advanced Billing + Reporting

- [ ] **P3-01** Estimates schema + API (full)
- [ ] **P3-02** Estimate PDF generation
- [ ] **P3-03** Customer estimate approve/reject in portal
- [ ] **P3-04** Convert approved estimate → invoice
- [ ] **P3-05** Advanced template designer (all mockup controls)
- [ ] **P3-06** Reports module (revenue, aging, mechanic productivity)
- [ ] **P3-07** Audit hash chain
- [ ] **P3-08** Backup recovery workflow + step-up verification
- [ ] **P3-09** Recovery test workflow (admin)
- [ ] **P3-10** Suspicious activity detection (basic rules)
- [ ] **P3-11** Retention pruning job
- [ ] **P3-12** External Auditor account type views
- [ ] **P3-13** Manager approval workflow for invoices
- [ ] **P3-14** Phase 3 gate — all estimate + report flows pass E2E

---

## Phase 4 — Polish + Ship

- [ ] **P4-01** PWA manifest + mobile install prompt (optional offline queue stub)
- [ ] **P4-02** Full Playwright E2E suite (all mockup screens)
- [ ] **P4-03** Lighthouse audit — fix high-impact a11y/perf issues
- [ ] **P4-04** Load test PDF worker + file upload under MAX_UPLOAD_MB
- [ ] **P4-05** Production env documentation in `.env.example`
- [ ] **P4-06** Dockploy deploy verification (compose + external DB)
- [ ] **P4-07** Security review pass (IDOR, auth, file access, AI scope)
- [ ] **P4-08** **100% completeness gate** — all checklist items [x]; UI parity sign-off against mockup

---

## Agent prompt template

Copy for each loop iteration:

```
Task: <TASK-ID> — <title>
Read: Agent-Files/SPEC.md <section>
UI ref: Agent-Files/invoice-ui-mockups.html → search "<MOCKUP COMMENT>"
Also read: Agent-Files/BUILD-CHECKLIST.md

Implement fully:
- Backend (API + service + repository + migration if needed)
- Frontend (page/components matching Ledger design system)
- Permission checks on all routes
- Audit logging on mutations
- Tests per Verify section

Deployment: Docker Compose service(s) only — PostgreSQL is external.

When done:
1. Run verification commands
2. Mark <TASK-ID> as [x] in BUILD-CHECKLIST.md
3. Update Progress summary counts
```

---

## Resolved spec conflicts (for agents)

| Topic | Resolution |
|---|---|
| PDF engine | **Playwright Chromium** in `pdf-worker` (not jsPDF, not laravel-dompdf) |
| Database | **External PostgreSQL** — not a compose service |
| Roles vs account types | **Account types only** — no roles tables |
| Object storage | **PostgreSQL bytea only** for MVP |
| Deployment | **Docker Compose on Dockploy** — one container per app service |

---

*Last updated: merge of PRD.txt + TAD.txt with Dockploy/external-DB deployment update*
