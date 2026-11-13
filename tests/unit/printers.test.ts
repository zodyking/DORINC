import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildIppPrintJob,
  categoryFor,
  chooseDriver,
  evaluateMailMessage,
  identifyPrinter,
  illustrationUrl,
  ippStatusCode,
  ippSucceeded,
  jamWord,
  paperWord,
  parseIpp,
  parseLpinfo,
  parsePrintCommand,
  parseQueueOptions,
  printerCondition,
  printerIssues,
  replacementFor,
  supplyPercent,
} from '../../shared/printers'
import { cupsAvailable, interpretLpstat, resetCupsAvailableForTests } from '../../server/services/printers/cups'
import { ACCOUNT_TYPE_BUNDLES } from '../../shared/permissions/keys'
import { PERMISSION_AREAS } from '../../shared/permissions/display'

const root = new URL('../../', import.meta.url)
function source(path: string): string {
  return readFileSync(new URL(path, root), 'utf8')
}

describe('print command parsing', () => {
  it('reads duplex, short edge, copies, and PIN', () => {
    expect(parsePrintCommand('PRINT PIN:abcDEF12 DUPLEX COPIES=3', 'abcdef12')).toEqual({
      sides: 'two-sided-long-edge',
      copies: 3,
    })
    expect(parsePrintCommand('PRINT PIN:abcDEF12 SHORT EDGE', 'abcdef12')?.sides).toBe('two-sided-short-edge')
    expect(parsePrintCommand('PRINT DUPLEX', 'abcdef12')).toBeNull()
    expect(parsePrintCommand('PRINT PIN:abcDEF12 COPIES=99', 'abcdef12')).toBeNull()
    expect(parsePrintCommand('PRINT DUPLEX COPIES=2', '')).toEqual({
      sides: 'two-sided-long-edge',
      copies: 2,
    })
    expect(parsePrintCommand('COPIES=99', '')).toBeNull()
  })

  it('allowlists senders and requires the subject PIN', () => {
    const cfg = {
      allowed_senders: 'trusted@example.com',
      mail_recipient: 'print@example.com',
      email_pin: 'abcdef12',
      default_sides: 'one-sided',
    }
    expect(evaluateMailMessage({
      from: 'Trusted <trusted@example.com>',
      to: 'print@example.com',
      subject: 'PRINT PIN:abcdef12',
      config: cfg,
    }).ok).toBe(true)
    expect(evaluateMailMessage({
      from: 'attacker@example.com',
      to: 'print@example.com',
      subject: 'PRINT PIN:abcdef12',
      config: cfg,
    }).ok).toBe(false)
    expect(evaluateMailMessage({
      from: 'trusted@example.com',
      to: 'Other <print@example.com>',
      subject: 'PRINT PIN:abcdef12',
      config: cfg,
    }).ok).toBe(true)
  })
})

describe('printer helpers', () => {
  it('matches TN660 families and falls back to an Amazon search', () => {
    const found = replacementFor('Brother HL-L2380DW')
    expect(found?.name).toBe('TN660')
    expect(found?.url).toContain('amazon.com')
    expect(replacementFor('HP LaserJet Pro')).toBeTruthy()
  })

  it('classifies illustrations and supply percents', () => {
    expect(categoryFor('Brother MFC-L2700DW')).toBe('mfp')
    expect(categoryFor('HL-L2380DW laser')).toBe('mono')
    expect(illustrationUrl('mono')).toBe('/printers/mono.svg')
    expect(illustrationUrl('mystery')).toBe('/printers/generic.svg')
    expect(supplyPercent(50, 100)).toBe(50)
    expect(supplyPercent(12, 0)).toBe(12)
    expect(paperWord('empty')).toBe('Out of paper')
    expect(jamWord('jam')).toBe('Paper jam')
  })

  it('identifies maker and model codes for product photos', () => {
    const brother = identifyPrinter('Brother HL-L2380DW')
    expect(brother.manufacturer).toBe('brother')
    expect(brother.code).toBe('hll2380dw')
    expect(brother.key).toBe('brother|hll2380dw')
    expect(identifyPrinter('HP LaserJet Pro M404dn').code).toBe('m404dn')
    expect(identifyPrinter('Epson EcoTank ET-2800').code).toBe('et2800')
  })

  it('builds condition and hold issues from readings', () => {
    const stats = {
      state: 'Idle',
      reasons: ['Out of paper', 'Paper jam'],
      pages: 12,
      pages_label: '12',
      supplies: [{ name: 'Black Toner', percent: 8 }],
      serial: 'ABC',
      firmware: '',
      checks: [],
      model: 'HL-L2380DW',
      device_id: '',
    }
    const condition = printerCondition(stats, true)
    expect(condition.paper).toBe('empty')
    expect(condition.jam).toBe('jam')
    expect(condition.toner?.percent).toBe(8)
    expect(printerIssues(stats, true).join(' ')).toMatch(/paper tray is empty/i)
    expect(printerIssues(null, false)).toEqual(['The printer is not connected.'])
  })

  it('parses lpinfo, queue options, and IPP payloads', () => {
    const drivers = parseLpinfo('drv:///sample.drv/generic.ppd Generic Printer\nbrother-brlaser-hl2380 Brother HL-L2380DW, using brlaser\n')
    expect(drivers.some(item => item.name.includes('brother') || (item['make-and-model'] || '').includes('Brother'))).toBe(true)
    const options = parseQueueOptions('PageSize/Media Size: *Letter Legal A4\nInputSlot/Source: *Tray1 Tray2\n')
    expect(options[0]?.paper).toBe(true)
    expect(options[0]?.current).toBe('Letter')
    const body = Buffer.concat([
      Buffer.from([0x02, 0x00, 0x00, 0x0B, 0x00, 0x00, 0x00, 0x01, 0x01]),
      Buffer.from([0x03]),
    ])
    expect(parseIpp(body)).toEqual({})
  })

  it('prefers a matching model driver and falls back to IPP Everywhere', () => {
    const discovery = {
      reachable: true,
      ipp: true,
      socket: true,
      make: 'brother',
      model: 'hl-l2380dw',
      device_id: 'MFG:Brother;MDL:HL-L2380DW;',
      identity: 'Brother HL-L2380DW',
    }
    const choice = chooseDriver(discovery, [{
      name: 'brother-hl-l2380dw.ppd',
      'make-and-model': 'Brother HL-L2380DW',
      'device-id': 'MFG:Brother;MDL:HL-L2380DW;',
    }])
    expect(choice.protocol).toBe('socket')
    expect(chooseDriver({ ...discovery, socket: false, ipp: true }, [])).toMatchObject({
      model: 'everywhere',
      protocol: 'ipp',
    })
  })
})

describe('printers staff integration', () => {
  it('registers Printers permissions, nav, and schema', () => {
    const area = PERMISSION_AREAS.find(item => item.id === 'printers')
    expect(area?.navKeys).toEqual(['printers.read.all'])
    expect(ACCOUNT_TYPE_BUNDLES.manager).toContain('printers.manage.all')
    expect(ACCOUNT_TYPE_BUNDLES.mechanic).toContain('printers.print.all')
    expect(ACCOUNT_TYPE_BUNDLES.viewer).toContain('printers.read.all')
    expect(source('app/layouts/staff.vue')).toContain("label: 'Print'")
    expect(source('app/layouts/staff.vue')).toContain("to: '/printers'")
    expect(source('app/layouts/staff.vue')).not.toContain("to: '/staples'")
    expect(source('server/db/schema/index.ts')).toContain('./printers')
    expect(source('server/db/migrations/meta/_journal.json')).toContain('0084_printers')
  })

  it('keeps stats and jobs on Print and setup in Control Panel', () => {
    const printPage = source('app/pages/printers/index.vue')
    const settings = source('app/components/admin/settings/SettingsPrintersPanel.vue')
    expect(printPage).toContain('Shop printers')
    expect(printPage).toContain('StaplesPrintJobsPanel')
    expect(printPage).toContain('Print queue')
    expect(printPage).toContain('/printers/mono.svg')
    expect(printPage).not.toContain('Create printer queue')
    expect(printPage).not.toContain('Enable email printing')
    expect(printPage).not.toContain('Current CUPS queue')
    expect(printPage).not.toContain('lpstat is not installed')
    expect(settings).toContain('Create printer queue')
    expect(settings).toContain('Enable email printing')
    expect(settings).toContain('Look up product photos automatically')
    expect(settings).toContain('prints over IPP or port 9100')
    expect(source('app/utils/control-panel-nav.ts')).toContain("id: 'printers'")
    expect(source('app/pages/admin/index.vue')).toContain('SettingsPrintersPanel')
    expect(source('app/pages/staples/index.vue')).toContain("tab: 'staples'")
    expect(source('public/printers/generic.svg')).toMatch(/#1e293b|#334155|#475569/)
    expect(source('server/api/printers/[queue]/image.get.ts')).toContain('new Uint8Array')
    expect(source('server/api/internal/printers/tick.post.ts')).toContain('resolvePendingPrinterImages')
    expect(source('server/services/printers/engine.ts')).toContain('sendDirectToPrinter')
  })
})

describe('CUPS-optional printing', () => {
  it('treats empty CUPS lpstat as success, not a missing-binary error', () => {
    expect(interpretLpstat({
      returncode: 1,
      stdout: '',
      stderr: 'lpstat: no active jobs',
    })).toEqual({ ok: true, available: true, lines: [], error: '' })
  })

  it('can report that CUPS tools are absent without throwing', () => {
    resetCupsAvailableForTests(false)
    expect(cupsAvailable()).toBe(false)
    resetCupsAvailableForTests(null)
  })

  it('builds an IPP Print-Job that reports success for status 0', () => {
    const pdf = Buffer.from('%PDF-1.4 minimal')
    const job = buildIppPrintJob({
      printerUri: 'ipp://192.168.1.20/ipp/print',
      jobName: 'letter.pdf',
      copies: 2,
      sides: 'two-sided-long-edge',
      document: pdf,
    })
    expect(job.subarray(0, 4).equals(Buffer.from([0x02, 0x00, 0x00, 0x02]))).toBe(true)
    expect(job.includes(pdf)).toBe(true)
    expect(job.includes(Buffer.from('two-sided-long-edge'))).toBe(true)
    const ok = Buffer.from([0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01])
    expect(ippStatusCode(ok)).toBe(0)
    expect(ippSucceeded(0)).toBe(true)
    expect(ippSucceeded(0x0400)).toBe(false)
  })
})
