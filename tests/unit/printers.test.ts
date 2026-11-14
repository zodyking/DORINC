import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { jamWord, paperWord, isValidIpv4, QUEUE_RE } from '../../shared/printers'
import {
  addPrinterSchema,
  jobIdParamSchema,
  mailSettingsSchema,
  printersPageQuerySchema,
  sendToPrinterSchema,
  tailscaleActionSchema,
} from '../../shared/validators/printers'
import { engineFile, engineJson, engineUrl, submitPrint } from '../../server/services/printers/engine'
import { PrintEngineUnavailable, PrintError } from '../../server/services/printers/errors'
import { printersPage, printTargets } from '../../server/services/printers/page'
import { formatPrinterWhen, printersBusy } from '../../app/utils/printers-ui'
import type { PrintersPage } from '../../app/utils/printers-ui'
import { ACCOUNT_TYPE_BUNDLES } from '../../shared/permissions/keys'
import { PERMISSION_AREAS } from '../../shared/permissions/display'

const root = new URL('../../', import.meta.url)
function source(path: string): string {
  return readFileSync(new URL(path, root), 'utf8')
}

type Page = {
  engine: { ok: boolean, message: string }
  printers: Array<{ image: { url: string, candidates: Array<{ url: string }> } }>
  settings: Record<string, unknown>
  events: unknown[]
}

type Call = { url: string, method: string, headers: Record<string, string>, body: unknown }

function stubEngine(reply: (call: Call) => Response): Call[] {
  const calls: Call[] = []
  vi.stubGlobal('fetch', async (input: URL | string, init: RequestInit = {}) => {
    const call: Call = {
      url: String(input),
      method: init.method || 'GET',
      headers: (init.headers || {}) as Record<string, string>,
      body: init.body,
    }
    calls.push(call)
    return reply(call)
  })
  return calls
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('print engine client', () => {
  it('sends the shared token and the query to the engine', async () => {
    vi.stubEnv('PRINT_ENGINE_URL', 'http://engine.test:47831/')
    vi.stubEnv('PRINT_ENGINE_TOKEN', 'secret')
    const calls = stubEngine(() => json({ ok: true }))
    expect(engineUrl()).toBe('http://engine.test:47831')
    await engineJson('/api/state', { query: { page: 'printers', skip: undefined } })
    expect(calls[0]?.url).toBe('http://engine.test:47831/api/state?page=printers')
    expect(calls[0]?.headers.authorization).toBe('Bearer secret')
  })

  it('reports the engine as unavailable when it cannot be reached', async () => {
    vi.stubEnv('PRINT_ENGINE_TOKEN', 'secret')
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    await expect(engineJson('/api/state')).rejects.toBeInstanceOf(PrintEngineUnavailable)
  })

  it('reports the engine as unavailable until its token exists', async () => {
    vi.stubEnv('PRINT_ENGINE_TOKEN', '')
    vi.stubEnv('PRINT_ENGINE_TOKEN_FILE', '/nonexistent/print-engine/api-token')
    const calls = stubEngine(() => json({ ok: true }))
    await expect(engineJson('/api/state')).rejects.toBeInstanceOf(PrintEngineUnavailable)
    expect(calls).toHaveLength(0)
  })

  it('passes the engine message and status through', async () => {
    vi.stubEnv('PRINT_ENGINE_TOKEN', 'secret')
    stubEngine(call => call.url.endsWith('/missing')
      ? json({ ok: false, message: 'Printer not found' }, 404)
      : call.url.endsWith('/busy')
        ? json({ ok: false, message: 'That printer is already being set up' }, 409)
        : call.url.endsWith('/broken')
          ? json({ detail: 'boom' }, 500)
          : json({ ok: false, message: 'Enter a valid IPv4 address' }, 400))
    const missing = await engineJson('/missing').catch(err => err)
    expect(missing).toBeInstanceOf(PrintError)
    expect(missing.status).toBe(404)
    expect(missing.message).toBe('Printer not found')
    expect((await engineJson('/busy').catch(err => err)).status).toBe(409)
    expect((await engineJson('/bad').catch(err => err)).message).toBe('Enter a valid IPv4 address')
    expect(await engineJson('/broken').catch(err => err)).toBeInstanceOf(PrintEngineUnavailable)
  })

  it('queues a document as a multipart upload and returns the job number', async () => {
    vi.stubEnv('PRINT_ENGINE_TOKEN', 'secret')
    const calls = stubEngine(() => json({ ok: true, id: 12 }))
    const id = await submitPrint({ filename: 'INV-1.pdf', data: Buffer.from('%PDF-1.4'), queue: 'Office_Printer', copies: 2, sides: 'two-sided-long-edge', source: 'app', sender: 'Sam' })
    expect(id).toBe(12)
    const form = calls[0]?.body as FormData
    expect(calls[0]?.method).toBe('POST')
    expect(form.get('printer')).toBe('Office_Printer')
    expect(form.get('copies')).toBe('2')
    expect(form.get('sides')).toBe('two-sided-long-edge')
    expect(form.get('source')).toBe('app')
    expect((form.get('file') as File).name).toBe('INV-1.pdf')
  })

  it('returns files with their type and the pending-picture flag', async () => {
    vi.stubEnv('PRINT_ENGINE_TOKEN', 'secret')
    stubEngine(() => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml', 'x-image-pending': '1' } }))
    const file = await engineFile('/api/printers/Office_Printer/image')
    expect(file.contentType).toBe('image/svg+xml')
    expect(file.pending).toBe(true)
    expect(file.data.toString()).toBe('<svg/>')
  })
})

describe('printers page data', () => {
  const state = () => ({
    ok: true,
    ready: true,
    printers: [
      { queue: 'Office_Printer', label: 'Office Printer', ready: true, image: { version: 'abc', candidates: [{ id: '3', kind: 'candidate' }] } },
      { queue: 'Back_Room', label: 'Back Room', ready: false, image: { version: '', candidates: [] } },
    ],
    setups: [],
    jobs: [],
    events: [{ id: 1, message: 'Added printer' }],
    settings: { max_mb: 25, max_pages: 50, default_queue: 'Office_Printer', default_sides: 'one-sided', imap_username: 'shop@example.com', email_pin: 'abcd' },
  })

  it('points pictures at the app and hides setup details from staff', async () => {
    vi.stubEnv('PRINT_ENGINE_TOKEN', 'secret')
    stubEngine(() => json(state()))
    const manager = await printersPage('printers', true) as unknown as Page
    expect(manager.engine.ok).toBe(true)
    expect(manager.printers[0].image.url).toBe('/api/printers/Office_Printer/image?v=abc')
    expect(manager.printers[0].image.candidates[0].url).toBe('/api/printers/candidates/candidate/3')
    expect(manager.settings.imap_username).toBe('shop@example.com')

    const staff = await printersPage('overview', false) as unknown as Page
    expect(staff.settings).toEqual({ max_mb: 25, max_pages: 50, default_queue: 'Office_Printer', default_sides: 'one-sided' })
    expect(staff.events).toEqual([])
  })

  it('shows a calm empty page while the engine is down', async () => {
    vi.stubEnv('PRINT_ENGINE_TOKEN', 'secret')
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    const page = await printersPage('overview', true) as unknown as Page
    expect(page.engine.ok).toBe(false)
    expect(page.engine.message).toMatch(/print service/i)
    expect(page.printers).toEqual([])
    expect(await printTargets()).toEqual([])
  })

  it('only offers printers that finished setup as print targets', async () => {
    vi.stubEnv('PRINT_ENGINE_TOKEN', 'secret')
    stubEngine(() => json({
      ok: true,
      printers: [
        { queue: 'Office_Printer', label: 'Office Printer', ready: true },
        { queue: 'Back_Room', label: 'Back Room', ready: false },
      ],
    }))
    expect(await printTargets()).toEqual([{ queue: 'Office_Printer', label: 'Office Printer' }])
  })
})

describe('printer requests', () => {
  it('needs only a name and an address to add a printer', () => {
    expect(addPrinterSchema.safeParse({ label: 'Office Printer', host: '192.168.1.50' }).success).toBe(true)
    expect(addPrinterSchema.safeParse({ label: 'Office Printer', host: '192.168.1.50', authKey: 'tskey-auth-abc' }).success).toBe(true)
    expect(addPrinterSchema.safeParse({ label: 'Office Printer', host: 'printer.local' }).success).toBe(false)
    expect(addPrinterSchema.safeParse({ label: '', host: '192.168.1.50' }).success).toBe(false)
    expect(isValidIpv4('192.168.1.50')).toBe(true)
    expect(isValidIpv4('999.1.1.1')).toBe(false)
    expect(QUEUE_RE.test('Office_Printer')).toBe(true)
    expect(QUEUE_RE.test('../etc')).toBe(false)
  })

  it('validates pages, job numbers, Tailscale actions, and mail settings', () => {
    expect(printersPageQuerySchema.safeParse({ tab: 'printers' }).success).toBe(true)
    expect(printersPageQuerySchema.safeParse({ tab: 'nope' }).success).toBe(false)
    expect(jobIdParamSchema.parse({ id: '14' }).id).toBe(14)
    expect(jobIdParamSchema.safeParse({ id: 'abc' }).success).toBe(false)
    expect(tailscaleActionSchema.safeParse({ action: 'join', auth_key: 'tskey-auth-abc' }).success).toBe(true)
    expect(tailscaleActionSchema.safeParse({ action: 'explode' }).success).toBe(false)
    expect(mailSettingsSchema.safeParse({ imap_port: 99999 }).success).toBe(false)
  })

  it('validates send-to-printer requests', () => {
    expect(sendToPrinterSchema.safeParse({ kind: 'service-log-sheet', queue: 'Office_Printer' }).success).toBe(true)
    expect(sendToPrinterSchema.safeParse({ kind: 'invoice', queue: 'Office_Printer' }).success).toBe(false)
    expect(sendToPrinterSchema.safeParse({
      kind: 'invoice',
      queue: 'Office_Printer',
      invoiceIds: ['5b0f3c1e-7d1a-4c55-9a0e-3f2b1c4d5e6f'],
    }).success).toBe(true)
  })
})

describe('printer display helpers', () => {
  it('words paper and jam readings', () => {
    expect(paperWord('empty')).toBe('Out of paper')
    expect(paperWord('unknown')).toBe('Not reported')
    expect(jamWord('jam')).toBe('Paper jam')
    expect(jamWord('clear')).toBe('Clear')
  })

  it('reads engine times as UTC and spots running setups', () => {
    expect(formatPrinterWhen('')).toBe('')
    expect(formatPrinterWhen('2026-11-14 15:30:00')).not.toBe('')
    expect(printersBusy(null)).toBe(false)
    expect(printersBusy({ setups: [], printers: [{ image: { pending: false } }] } as unknown as PrintersPage)).toBe(false)
    expect(printersBusy({ setups: [{ running: true }], printers: [] } as unknown as PrintersPage)).toBe(true)
    expect(printersBusy({ setups: [], printers: [{ image: { pending: true } }] } as unknown as PrintersPage)).toBe(true)
  })
})

describe('printers staff integration', () => {
  it('registers Printers permissions and nav', () => {
    const area = PERMISSION_AREAS.find(item => item.id === 'printers')
    expect(area?.navKeys).toEqual(['printers.read.all'])
    expect(ACCOUNT_TYPE_BUNDLES.manager).toContain('printers.manage.all')
    expect(ACCOUNT_TYPE_BUNDLES.mechanic).toContain('printers.print.all')
    expect(ACCOUNT_TYPE_BUNDLES.viewer).toContain('printers.read.all')
    expect(source('app/layouts/staff.vue')).toContain("label: 'Print'")
    expect(source('app/layouts/staff.vue')).toContain("to: '/printers'")
  })

  it('keeps printing on Print and setup in Control Panel', () => {
    const printPage = source('app/pages/printers/index.vue')
    const settings = source('app/components/admin/settings/SettingsPrintersPanel.vue')
    expect(printPage).toContain('Shop printers')
    expect(printPage).toContain('StaplesPrintJobsPanel')
    expect(printPage).toContain('Print queue')
    expect(printPage).toContain('No shop printer yet')
    expect(printPage).toContain('PrintChooser')
    expect(printPage).toContain('Print a blank sheet')
    expect(printPage).toContain('/api/printers/jobs/${job.id}/file')
    expect(printPage).toContain('PdfViewerDialog')
    expect(printPage).not.toContain('max-width: 1080px')
    expect(settings).toContain("'Add printer'")
    expect(settings).toContain('Email to print')
    expect(settings).toContain('Tailscale auth key')
    expect(settings).not.toContain('CUPS queue')
    expect(settings).not.toContain('Tailscale hostname')
    expect(source('app/pages/admin/index.vue')).toContain('SettingsPrintersPanel')
  })

  it('every printers route checks a permission before calling the engine', () => {
    for (const file of [
      'server/api/printers/index.get.ts',
      'server/api/printers/targets.get.ts',
      'server/api/printers/devices.post.ts',
      'server/api/printers/devices/[queue].patch.ts',
      'server/api/printers/devices/[queue].delete.ts',
      'server/api/printers/devices/[queue]/options.post.ts',
      'server/api/printers/devices/[queue]/tailscale.post.ts',
      'server/api/printers/devices/[queue]/setup.post.ts',
      'server/api/printers/setups/[queue].delete.ts',
      'server/api/printers/[queue]/image.get.ts',
      'server/api/printers/[queue]/image-preview.get.ts',
      'server/api/printers/[queue]/image.post.ts',
      'server/api/printers/candidates/[kind]/[item].get.ts',
      'server/api/printers/images.patch.ts',
      'server/api/printers/settings.patch.ts',
      'server/api/printers/jobs.post.ts',
      'server/api/printers/jobs/[id].delete.ts',
      'server/api/printers/jobs/[id]/retry.post.ts',
      'server/api/printers/jobs/[id]/cancel.post.ts',
      'server/api/printers/jobs/[id]/file.get.ts',
      'server/api/printers/send.post.ts',
    ]) {
      expect(source(file), file).toMatch(/(require(Any)?|has)Permission\(/)
    }
  })

  it('offers one Print action for shop printers, Staples, and this device', () => {
    const chooser = source('app/components/PrintChooser.vue')
    expect(chooser).toContain('Print From This Device')
    expect(chooser).toContain('>Staples<')
    expect(chooser).toContain('Print on this shop printer')
    for (const file of [
      'app/components/invoices/InvoiceListRowActions.vue',
      'app/pages/invoices/[id]/index.vue',
      'app/pages/printers/index.vue',
    ]) {
      const text = source(file)
      expect(text, file).toContain('PrintChooser')
      expect(text, file).not.toContain('Print At Staples')
      expect(text, file).not.toContain('Print From PC')
      expect(text, file).not.toContain('Send Blank Sheet')
    }
    expect(source('app/components/BulkPrintInvoicesButton.vue')).toContain('Print From This Device')
    expect(source('app/components/service-logs/ServiceLogSheetPrintModal.vue')).toContain('Print From This Device')
  })
})

describe('print engine container', () => {
  it('runs PrintHarbor in its own service next to the app', () => {
    const compose = source('docker-compose.yml')
    expect(compose).toContain('dorinc-print-engine:')
    expect(compose).toContain('dockerfile: docker/Dockerfile.printharbor')
    expect(compose).toContain('DATA_DIR: /runtime/printharbor')
    expect(compose).toContain('http://dorinc-print-engine:47831')
    expect(compose).not.toContain('PRINTER_DATA_DIR')

    const engine = source('docker/Dockerfile.printharbor')
    for (const pkg of ['cups', 'printer-driver-gutenprint', 'ghostscript', 'libreoffice-writer', 'tailscale', 'brlaser']) {
      expect(engine, pkg).toContain(pkg)
    }
    expect(engine).toContain('ENTRYPOINT ["/usr/bin/tini", "--"]')

    const app = source('docker/Dockerfile.app')
    expect(app).not.toContain('cups')
    expect(app).not.toContain('tailscale')
  })

  it('shares one generated token through the data volume', () => {
    const start = source('printharbor/start.sh')
    expect(start).toContain('api-token')
    expect(start).toContain('app.api:app')
    const api = source('printharbor/app/api.py')
    expect(api).toContain("'api-token'")
    expect(api).toContain('hmac.compare_digest')
  })

  it('sets printers up in the background and reports progress', () => {
    const api = source('printharbor/app/api.py')
    expect(api).toContain('def _start(')
    for (const phase of ['Joining Tailscale', 'Reading the printer', 'Choosing a driver', 'Installing the driver']) {
      expect(api, phase).toContain(phase)
    }
  })

  it('talks to tailscaled with the host name it accepts', () => {
    const tailnet = source('printharbor/app/tailnet.py')
    expect(tailnet).toContain("'local-tailscaled.sock'")
    expect(tailnet).toContain('--tun=userspace-networking')
    expect(tailnet).toContain('def _signed_in(')
  })
})
