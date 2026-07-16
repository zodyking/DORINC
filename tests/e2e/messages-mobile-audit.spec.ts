import { test, expect } from '@playwright/test'
import path from 'node:path'

const fixture = path.resolve('tests/e2e/fixtures/messages-mobile-audit.html')
const fileUrl = `file://${fixture}`

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    }
  })
  expect(overflow.scrollWidth, 'page should not overflow horizontally').toBeLessThanOrEqual(overflow.clientWidth + 1)
}

test.describe('Messages fluid mobile audit fixture', () => {
  test('mobile 375 — CTAs, tabs, and list stay fully visible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(fileUrl)

    const newMessage = page.getByRole('button', { name: 'New message' })
    const newEmail = page.getByRole('button', { name: 'New email' })
    await expect(newMessage).toBeVisible()
    await expect(newEmail).toBeVisible()

    // Full labels must remain readable (no ellipsis truncation).
    await expect(newMessage).toHaveText('New message')
    await expect(newEmail).toHaveText('New email')

    const messageBox = await newMessage.boundingBox()
    const emailBox = await newEmail.boundingBox()
    expect(messageBox).toBeTruthy()
    expect(emailBox).toBeTruthy()
    expect(messageBox!.width).toBeGreaterThan(300)
    expect(emailBox!.width).toBeGreaterThan(300)

    // Stacked, not side-by-side.
    expect(emailBox!.y).toBeGreaterThan(messageBox!.y + messageBox!.height - 1)

    const tabBoxes = []
    for (const label of ['All', 'Team', 'Email']) {
      const tab = page.getByRole('button', { name: label, exact: true })
      await expect(tab).toBeVisible()
      const box = await tab.boundingBox()
      expect(box).toBeTruthy()
      expect(box!.x + box!.width).toBeLessThanOrEqual(375 + 1)
      expect(box!.x).toBeGreaterThanOrEqual(-1)
      tabBoxes.push(box!)
    }
    // Equal-width fluid tabs — no clipping / leftover empty track.
    expect(Math.abs(tabBoxes[0]!.width - tabBoxes[1]!.width)).toBeLessThan(2)
    expect(Math.abs(tabBoxes[1]!.width - tabBoxes[2]!.width)).toBeLessThan(2)
    expect(tabBoxes[0]!.width).toBeGreaterThan(90)

    // Email address hidden on mobile list rows for density.
    await expect(page.locator('.dm-conv-email').first()).toBeHidden()

    await assertNoHorizontalOverflow(page)
    await page.screenshot({
      path: '/opt/cursor/artifacts/screenshots/messages-mobile-375.png',
      fullPage: true,
    })
  })

  test('desktop 1440 — split pane remains fluid', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(fileUrl)

    // Sidebar actions are mobile-only; page still renders without overflow.
    await assertNoHorizontalOverflow(page)
    await page.screenshot({
      path: '/opt/cursor/artifacts/screenshots/messages-desktop-1440.png',
      fullPage: true,
    })
  })
})
