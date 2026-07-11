import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  E2E_PASSWORD,
  loginViaApi,
  type E2EFixtures,
} from './helpers/fixtures'
import { MOCKUP_SCREENS, resolveScreenPath } from './helpers/screens'

const FIXTURE_FILE = join(process.cwd(), 'tests/e2e/.fixture-cache.json')

function loadFixtures(): E2EFixtures | null {
  if (!existsSync(FIXTURE_FILE)) return null
  return JSON.parse(readFileSync(FIXTURE_FILE, 'utf8')) as E2EFixtures
}

async function applyAuth(context: import('@playwright/test').BrowserContext, fx: E2EFixtures, auth: 'none' | 'staff' | 'portal') {
  if (auth === 'none') return
  const baseURL = test.info().project.use.baseURL ?? 'http://localhost:3000'
  const cookie = auth === 'staff'
    ? await loginViaApi(baseURL, fx.staffEmail, E2E_PASSWORD, 'staff')
    : await loginViaApi(baseURL, fx.portalUsername, E2E_PASSWORD, 'customer')
  await context.addCookies([cookie])
}

function idMap(fx: E2EFixtures) {
  return {
    invoiceId: fx.invoiceId,
    editorInvoiceId: fx.editorInvoiceId,
    customerId: fx.customerId,
    vehicleId: fx.vehicleId,
    serviceLogId: fx.serviceLogId,
    estimateId: fx.estimateId,
    pendingUserId: fx.pendingUserId,
  }
}

async function assertScreenLoaded(page: import('@playwright/test').Page, screen: typeof MOCKUP_SCREENS[number]) {
  if (screen.id === 'setup-wizard') {
    await expect(page.locator('.setup-scrim')).toBeVisible({ timeout: 25_000 })
    await expect(page.getByRole('heading', { name: /Setup is locked|Server setup walkthrough/i })).toBeVisible()
    return
  }
  if (screen.id.startsWith('auth-')) {
    await expect(page.locator('.auth-screen')).toBeVisible({ timeout: 25_000 })
    await expect(page.locator('.auth-head b')).toHaveText('DORINC')
    return
  }
  if (screen.auth === 'staff') {
    await expect(page.locator('.main')).toBeVisible({ timeout: 25_000 })
  }
  else if (screen.auth === 'portal') {
    await expect(page.locator('.portal-shell')).toBeVisible({ timeout: 25_000 })
  }

  if (screen.id === 'template-designer') {
    await expect(page.getByRole('button', { name: /Open template editor/i })).toBeVisible({ timeout: 25_000 })
    await expect(page.getByRole('combobox', { name: /System template/i })).toBeVisible({ timeout: 25_000 })
    return
  }
  if (screen.id === 'invoice-editor') {
    await expect(page.getByRole('heading', { name: /Invoice Editor/i })).toBeVisible({ timeout: 25_000 })
    return
  }

  const heading = page.locator('.pagehead h2, main h2').first()
  await expect(heading).toBeVisible({ timeout: 25_000 })

  if (typeof screen.heading === 'string') {
    await expect(heading).toContainText(screen.heading)
  }
  else {
    await expect(heading).toContainText(screen.heading)
  }
}

for (const screen of MOCKUP_SCREENS) {
  test(`${screen.id} — ${screen.name}`, async ({ page, context }) => {
    const fx = loadFixtures()
    test.skip(!fx, 'DATABASE_URL + Playwright globalSetup fixtures required')

    await applyAuth(context, fx!, screen.auth)

    const path = resolveScreenPath(screen.path, idMap(fx!))
    await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined)

    await assertScreenLoaded(page, screen)
  })
}

test('PWA manifest is served', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest')
  expect(res.ok()).toBeTruthy()
  const manifest = await res.json()
  expect(manifest.name).toBe('DORINC')
  expect(manifest.icons?.length).toBeGreaterThan(0)
})

test('service worker registers on load', async ({ page }) => {
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false
    const reg = await navigator.serviceWorker.getRegistration()
    return !!reg
  }, { timeout: 15_000 })
})
