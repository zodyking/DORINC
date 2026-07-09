# P4-07 — Security review pass

**Date:** 2026-07-08  
**Scope:** IDOR, auth, file access, AI scope  
**Method:** Route audit + existing integration tests + targeted code review

## Summary

| Area | Result | Critical fixes |
|---|---|---|
| Portal IDOR | **Pass** | None — `requirePortalCustomer` + `assertPortalCustomerScope` on all portal routes; integration tests in `portal-auth`, `portal-invoices`, `portal-requests` |
| Staff auth | **Pass** (1 fix) | Bootstrap hardening applied |
| File access | **Pass** (design note) | None |
| AI scope | **Pass** | None |

---

## IDOR — Customer portal

**Findings (all mitigated):**

- Portal invoices, estimates, PDFs, vehicles, requests: scoped by `customerId` from session; cross-customer access returns 404 (not 403) via `assertPortalCustomerScope`.
- Integration coverage: `tests/integration/portal-auth.test.ts`, `portal-invoices.test.ts`, `portal-requests.test.ts`, `portal-estimates` tests.

**Residual (low):** Portal users could enumerate UUIDs if responses differed — mitigated by uniform 404.

---

## Auth — Staff + bootstrap

**Findings:**

| Severity | Issue | Status |
|---|---|---|
| **Critical** | `/api/setup/bootstrap` unauthenticated; no rate limit; `ADMIN_BOOTSTRAP_EMAIL` documented but not enforced; race on concurrent bootstrap | **Fixed** — IP rate limit (3/hr), email gate when env set, `pg_advisory_xact_lock` on bootstrap transaction |
| Low | `/api/setup/status` public (`needsBootstrap` flag) | Accepted — required for setup wizard routing |
| Low | `/api/health` public (version + DB status) | Accepted — standard health probe |
| Low | Signup/verify-email public with rate limits | Accepted — P2-20 |

**Fix details (critical):**

- `server/api/setup/bootstrap.post.ts` — rate limit + `ADMIN_BOOTSTRAP_EMAIL` check
- `server/services/setup.service.ts` — advisory lock inside transaction

---

## File access

**Findings:**

| Severity | Issue | Status |
|---|---|---|
| Info | Staff `/api/files/:id/download|preview` gated by `files.read.all` — any staff with permission can fetch any file by UUID | **By design** — staff are trusted; permission bundle controls access |
| Info | Upload allows arbitrary `ownerEntityType` + `ownerEntityId` for users with `files.upload.all` | **Accepted** — staff-only; no owner-entity ACL at file layer |
| Pass | MIME allowlist + magic-byte sniffing; `MAX_UPLOAD_MB` enforced in service + multipart `maxSize` | Verified in `files.service.ts` + `files.test.ts` + P4-04 load smoke |
| Pass | List endpoints return metadata only (no `binaryData`) | SPEC §8 |
| Pass | Portal PDF download uses `getPortalInvoicePdfDownload` with customer scope | P2-05 |

**Residual (medium, not fixed):** Mechanic `.own` scope on service logs does not extend to standalone file download — mechanics need `files.read.all` or files served via service log detail metadata. Acceptable for current permission model.

---

## AI scope

**Findings:**

| Feature | Permission gates | Mutations | Status |
|---|---|---|---|
| Platform help | `ai.help.all` + rate limit | None — read-only Q&A; system prompt forbids mutations | **Pass** |
| Service log extraction | `ai.extract.all` + `service_logs.review.all` | Apply only via `reviewAiSuggestion` after human review | **Pass** |
| Invoice description | `ai.describe.all` + `invoices.update.all` + edit session | Description-only apply; original note preserved | **Pass** |
| Suggestion review | Feature-specific perm + entity perm (`service_logs.review.all` / `invoices.update.all`) | Line item must belong to suggestion invoice | **Pass** |
| Spend caps | `assertSpendCapAllowsRequest` blocks new AI calls | — | **Pass** |

**Residual (low):** User with `ai.extract.all` + `service_logs.review.all` can review any pending extraction suggestion by ID — intentional for review staff.

---

## Recommendations (non-critical, future)

1. Add integration test for bootstrap email gate + rate limit.
2. Consider owner-entity validation on file upload (verify service_log/invoice exists and caller has access).
3. Run OWASP ZAP or similar against staging before P4-08 gate.
