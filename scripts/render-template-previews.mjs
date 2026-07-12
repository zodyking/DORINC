// Renders every built-in invoice template (default view + shipped presets)
// through the laravel-pdf service and writes PDF + PNG previews for review.
// Usage: node scripts/render-template-previews.mjs [http://127.0.0.1:8091]
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:8091'
const outDir = join(process.cwd(), '.data', 'template-previews')
mkdirSync(outDir, { recursive: true })

const sections = Object.fromEntries([
  'company_info', 'invoice_meta', 'customer', 'job_summary', 'vehicle',
  'symptoms', 'line_items', 'totals', 'payment', 'terms', 'footer',
].map(key => [key, { visible: true }]))

const data = {
  documentType: 'invoice',
  documentTitle: 'INVOICE',
  numberLabel: 'Invoice #',
  number: 'INV-000697',
  dateLabel: 'Date',
  date: '7/2/2026',
  dueDateLabel: 'Due',
  dueLabel: 'Due on receipt',
  statusLabel: 'SENT',
  generatedAt: '07/11/2026, 11:42 PM',
  customer: {
    name: 'Bnos Menachem Inc',
    addressLines: ['739 E New York Ave', 'Brooklyn, NY 11203'],
    phone: '(718) 555-0142',
    email: 'accounts@bnosmenachem.org',
  },
  vehicle: {
    unitNumber: '18',
    year: '2019',
    makeModel: 'Blue Bird Vision',
    vin: '4DRBUAAN1EB791868',
    plate: 'Not on file',
  },
  lineItems: [
    { description: 'Replace fuel pump assembly — includes priming and leak test', typeBadge: 'P', quantity: '1.00', unitPrice: '$950.00', lineAmount: '$950.00' },
    { description: 'Diagnostic — no-start condition, fuel pressure test', typeBadge: 'L', quantity: '1.50', unitPrice: '$140.00', lineAmount: '$210.00' },
    { description: 'Fuel filter, primary', typeBadge: 'P', quantity: '1.00', unitPrice: '$38.50', lineAmount: '$38.50' },
    { description: 'Shop supplies & disposal', typeBadge: 'F', quantity: '1.00', unitPrice: '$25.00', lineAmount: '$25.00' },
  ],
  totals: {
    parts: '$988.50',
    labor: '$210.00',
    fees: '$25.00',
    discount: '$0.00',
    tax: '$0.00',
    total: '$1,223.50',
    balanceDue: '$1,223.50',
  },
  note: 'Unit towed in with a no-start condition. Fuel pressure at rail measured below spec; fuel pump assembly replaced and primary filter serviced. Road-tested 12 miles — starts and idles within spec.',
  company: {
    name: 'Devon Onsite Repairs INC',
    addressLine1: '4501 Foster Ave',
    addressLine2: 'Brooklyn, NY 11203',
    phone: '(347) 555-0188',
    email: 'service@devononsiterepairs.com',
    website: 'https://devononsiterepairs.com/',
  },
  design: {
    accentColor: '#0a0a0a',
    accentColor2: '#0a0a0a',
    fontSans: 'DejaVu Sans, Helvetica, Arial, sans-serif',
    fontMono: 'DejaVu Sans Mono, Courier, monospace',
    sections,
  },
}

const options = { paper: 'letter', margins: { top: 0.75, right: 0.75, bottom: 0.75, left: 0.75 } }

const presetsDir = join(process.cwd(), 'server/assets/invoice-template-presets')
const targets = [
  { name: 'standard-invoice', bladeSource: undefined },
  ...readdirSync(presetsDir)
    .filter(f => f.endsWith('.blade.php'))
    .map(f => ({
      name: f.replace('.blade.php', ''),
      bladeSource: readFileSync(join(presetsDir, f), 'utf8'),
    })),
]

let failed = false
for (const target of targets) {
  const payload = {
    documentType: 'invoice',
    data,
    options: { ...options, ...(target.bladeSource ? { bladeSource: target.bladeSource } : {}) },
  }

  for (const format of ['pdf', 'html']) {
    const url = format === 'html' ? `${baseUrl}/api/render/invoice/html` : `${baseUrl}/api/render/invoice`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload),
    })
    const buf = Buffer.from(await res.arrayBuffer())
    if (!res.ok) {
      failed = true
      console.error(`FAIL ${target.name} [${format}] status=${res.status}`)
      console.error(buf.toString('utf8').slice(0, 800))
      continue
    }
    const ext = format === 'html' ? 'html' : 'pdf'
    const file = join(outDir, `${target.name}.${ext}`)
    writeFileSync(file, buf)
    console.log(`OK   ${target.name} [${format}] ${buf.length} bytes`)
    if (format === 'pdf') {
      execFileSync('pdftoppm', ['-png', '-r', '90', file, join(outDir, target.name)])
    }
  }
}

console.log(failed ? 'DONE WITH FAILURES' : 'ALL TEMPLATES RENDERED OK')
process.exit(failed ? 1 : 0)
