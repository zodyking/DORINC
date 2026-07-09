/**
 * Capture welcome-slide screenshots from Agent-Files/invoice-ui-mockups.html
 * into public/images/welcome-*.png
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mockup = path.join(root, 'Agent-Files', 'invoice-ui-mockups.html')
const outDir = path.join(root, 'public', 'images')
const fileUrl = `file:///${mockup.replace(/\\/g, '/')}`

const shots = [
  { file: 'welcome-invoices.png', mode: 'staff', nav: 'invoices' },
  { file: 'welcome-vehicles.png', mode: 'staff', nav: 'vehicles' },
  { file: 'welcome-portal.png', mode: 'portal', nav: null },
  { file: 'welcome-service-logs.png', mode: 'staff', nav: 'servicelog-detail' },
  { file: 'welcome-catalog.png', mode: 'staff', nav: 'catalog' },
  { file: 'welcome-templates.png', mode: 'staff', nav: 'designer' },
  { file: 'welcome-estimates.png', mode: 'staff', nav: 'create' },
  { file: 'welcome-customers.png', mode: 'staff', nav: 'customers' },
  {
    file: 'welcome-ai-descriptions.png',
    mode: 'staff',
    nav: 'editor',
    prep: async (page) => {
      await page.click('#ed-ai-btn')
      await page.waitForTimeout(200)
      await page.evaluate(() => {
        const pop = document.getElementById('ai-pop')
        if (!pop) return
        pop.classList.add('open')
        Object.assign(pop.style, {
          display: 'block',
          position: 'fixed',
          right: '56px',
          top: '160px',
          zIndex: '9999',
          opacity: '1',
        })
      })
    },
  },
  {
    file: 'welcome-ai-extraction.png',
    mode: 'staff',
    nav: 'servicelog-detail',
    prep: async (page) => {
      await page.evaluate(() => {
        const host = document.querySelector('#page-servicelog-detail .cols .stack')
        if (!host || document.getElementById('welcome-ai-extract-card')) return
        const card = document.createElement('div')
        card.id = 'welcome-ai-extract-card'
        card.className = 'card'
        card.style.cssText = 'margin-bottom:14px;border-color:#c7d2fe;background:linear-gradient(180deg,#eef2ff,#fff)'
        card.innerHTML = `
          <div class="chead"><h3>✦ AI extraction · pending approval</h3>
            <div class="right"><span class="pill indigo">Review required</span></div>
          </div>
          <div class="cbody" style="font-size:13px;color:#475569;line-height:1.55">
            <p style="margin:0 0 10px">Suggested from uploaded sheet + photos:</p>
            <ul style="margin:0;padding-left:18px">
              <li>Fuel filter, primary (OEM) · qty 1</li>
              <li>Labor — PM service B · 2.5 hr</li>
              <li>Brake lining inspection · 0.5 hr</li>
            </ul>
            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
              <button class="btn sm primary">Accept all</button>
              <button class="btn sm">Edit suggestions</button>
              <button class="btn sm">Dismiss</button>
            </div>
          </div>`
        host.prepend(card)
      })
    },
  },
  {
    file: 'welcome-ai-help.png',
    mode: 'staff',
    nav: 'dashboard',
    prep: async (page) => {
      await page.evaluate(() => {
        const widget = document.getElementById('help-widget')
        const panel = document.getElementById('help-panel')
        const msgs = document.getElementById('help-msgs')
        if (!widget || !panel) return
        widget.classList.remove('hidden')
        panel.classList.add('open')
        if (msgs) {
          msgs.innerHTML = `
            <div class="hm bot"><span class="av">✦</span><div class="bubble">
              <b>Platform Assistant</b>
              <p>Ask how to create an invoice, add a fleet vehicle, or review a service log.</p>
            </div></div>
            <div class="hm user"><span class="av">DR</span><div class="bubble">
              <p>How do I send an invoice PDF to a customer?</p>
            </div></div>
            <div class="hm bot"><span class="av">✦</span><div class="bubble">
              <p>Open the invoice, click <b>Send</b>, and choose email. The PDF attaches automatically.</p>
            </div></div>`
        }
      })
      await page.waitForTimeout(150)
    },
  },
]

async function enterStaff(page) {
  await page.evaluate(() => {
    document.getElementById('auth-open-staff')?.click()
  })
  await page.waitForTimeout(100)
  await page.fill('#login-form input[type="email"], #auth-login input[type="email"]', 'devon@dorinc.local').catch(() => {})
  await page.fill('#login-form input[type="password"], #auth-login input[type="password"]', 'password').catch(() => {})
  const submitted = await page.evaluate(() => {
    const form = document.getElementById('login-form')
    if (form) {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      return true
    }
    return false
  })
  if (!submitted) {
    await page.click('#login-form button[type="submit"], #auth-login button[type="submit"]').catch(() => {})
  }
  await page.waitForSelector('#app-shell:not(.hidden)', { timeout: 5000 })
  await page.waitForTimeout(250)
}

async function enterPortal(page) {
  // Reload to reset state cleanly
  await page.goto(fileUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    document.getElementById('auth-open-customer')?.click()
  })
  await page.waitForTimeout(80)
  await page.evaluate(() => {
    const form = document.getElementById('portal-login-form')
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  await page.waitForSelector('#portal-shell:not(.hidden)', { timeout: 5000 })
  await page.waitForTimeout(250)
}

async function goNav(page, nav) {
  await page.evaluate((name) => {
    const btn = document.querySelector(`.side .nav-item[data-nav="${name}"]`)
      || document.querySelector(`#app-shell [data-nav="${name}"]`)
    if (btn) {
      btn.click()
      return
    }
    // Fallback: activate page section directly
    const target = document.getElementById(`page-${name}`)
    if (target) {
      document.querySelectorAll('#app-shell .page').forEach((p) => p.classList.remove('active'))
      target.classList.add('active')
      const crumb = document.querySelector('.crumb')
      if (crumb) crumb.textContent = name
    }
  }, nav)
  await page.waitForTimeout(300)
}

async function hideChromeNoise(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.toast, .toast-rack .toast').forEach((el) => { el.style.display = 'none' })
    document.getElementById('demobar')?.classList.remove('show')
    const demobar = document.querySelector('.demobar')
    if (demobar) demobar.style.display = 'none'
  })
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  })

  await page.goto(fileUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(400)
  await enterStaff(page)
  await hideChromeNoise(page)

  for (const shot of shots) {
    if (shot.mode === 'portal') {
      await enterPortal(page)
      await hideChromeNoise(page)
    }
    else {
      // Ensure staff shell
      const staffVisible = await page.evaluate(() => !document.getElementById('app-shell')?.classList.contains('hidden'))
      if (!staffVisible) {
        await page.goto(fileUrl, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(300)
        await enterStaff(page)
      }
      await page.evaluate(() => {
        document.getElementById('help-widget')?.classList.add('hidden')
        document.getElementById('help-panel')?.classList.remove('open')
        const pop = document.getElementById('ai-pop')
        if (pop) {
          pop.classList.remove('open')
          pop.style.display = ''
        }
        document.getElementById('welcome-ai-extract-card')?.remove()
      })
      if (shot.nav) await goNav(page, shot.nav)
    }

    if (shot.prep) await shot.prep(page)
    await hideChromeNoise(page)
    await page.waitForTimeout(200)

    const out = path.join(outDir, shot.file)
    // Capture the main content area (prefer .main inside app shell)
    const clip = await page.evaluate((mode) => {
      const el = mode === 'portal'
        ? document.querySelector('#portal-shell')
        : document.querySelector('#app-shell .main') || document.querySelector('#app-shell')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        x: Math.max(0, Math.round(r.x)),
        y: Math.max(0, Math.round(r.y)),
        width: Math.max(200, Math.min(Math.round(r.width), window.innerWidth - Math.max(0, Math.round(r.x)))),
        height: Math.max(200, Math.min(Math.round(r.height), window.innerHeight - Math.max(0, Math.round(r.y)))),
      }
    }, shot.mode)

    if (clip) await page.screenshot({ path: out, clip, type: 'png' })
    else await page.screenshot({ path: out, type: 'png' })
    console.log('wrote', shot.file, clip)
  }

  await browser.close()
  console.log('done')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
