import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import sharp from 'sharp'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { printers, printerJobs } from '../../db/schema/printers'
import {
  IPV4_RE,
  MODEL_RE,
  OPTION_RE,
  OPTION_VALUE_RE,
  PRINTER_ALLOWED_EXTENSIONS,
  QUEUE_RE,
  SNMP_OIDS,
  SNMP_STATES,
  categoryFor,
  chooseDriver,
  compactName,
  densityOptions,
  deviceFields,
  isPrinterSides,
  mergeSupplies,
  parseIpp,
  parseLpinfo,
  parseQueueOptions,
  printerCondition,
  printerIssues,
  readingsFromIpp,
  replacementFor,
  supplyPercent,
  type CupsDriver,
  type PrinterDiscovery,
  type PrinterStats,
  type QueueOption,
} from '../../../shared/printers'
import { PrintError } from './errors'
import { cupsAvailable, cupsCmd, cupsPrintersReport } from './cups'
import { sendDirectToPrinter } from './direct-print'
import { brotherReadings, looksLikeBrother, snmpGet, OID_MODEL } from './brother-snmp'
import {
  bindHost,
  cachedStatus,
  connectTailnet,
  deviceStatus,
  disconnectTailnet,
  hasNode,
  localForward,
  openTcp,
  resumeTailnet,
  tailnetNotice,
} from './tailnet'
import {
  getPrinterRow,
  listPrinterEventRows,
  listPrinterJobRows,
  listPrinterRows,
  printerSettingsMap,
  printersDataDir,
  recordPrinterEvent,
  setPrinterSetting,
} from './store'
import { describePrinterImage } from './images'

const SNAPSHOT_TTL = 30_000
const snapshots = new Map<string, { at: number, online: boolean, stats: PrinterStats | null }>()
const queueLocks = new Set<string>()

function snapshotKey(host: string, protocol: string) {
  return `${host}|${protocol || ''}`
}

function kickPrinterImage(db: Db, queue: string) {
  void import('./images').then(mod => mod.resolvePrinterImage(db, queue)).catch(() => null)
}

export function clearPrinterSnapshots() {
  snapshots.clear()
}

function rememberSnapshot(host: string, protocol: string, online: boolean, stats: PrinterStats | null) {
  snapshots.set(snapshotKey(host, protocol), { at: Date.now(), online, stats })
}

export async function pageSnapshot(host: string, protocol: string, identity = '') {
  const row = snapshots.get(snapshotKey(host, protocol))
  if (row && Date.now() - row.at < SNAPSHOT_TTL) return { online: row.online, stats: row.stats }
  return readSnapshot(host, protocol, identity)
}

export async function readSnapshot(host: string, protocol: string, identity = '') {
  const online = await printerReachable(host, protocol, 2)
  const stats = online ? await printerStats(host, identity) : null
  rememberSnapshot(host, protocol, online, stats)
  return { online, stats }
}

export async function refreshSnapshots(db: Db) {
  const rows = await listPrinterRows(db)
  for (const row of rows) {
    try {
      await readSnapshot(row.host, row.protocol, row.identity || row.label || '')
    }
    catch { /* skip */ }
  }
}

export async function printerReachable(host: string, protocol: string, timeout = 2): Promise<boolean> {
  const port = protocol === 'ipp' ? 631 : 9100
  try {
    const sock = await openTcp(host, port, timeout)
    sock.destroy()
    return true
  }
  catch {
    return false
  }
}

function requireIpv4(ip: string): string {
  const address = String(ip || '').trim()
  if (!IPV4_RE.test(address)) throw new PrintError('Enter a numeric printer IP address')
  return address
}

async function readSocket(sock: import('node:net').Socket, limit = 200000): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    const done = () => resolve(Buffer.concat(chunks))
    sock.on('data', (chunk) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      chunks.push(buf)
      total += buf.length
      if (total >= limit) {
        sock.destroy()
        done()
      }
    })
    sock.on('end', done)
    sock.on('error', reject)
    sock.setTimeout(8000, () => {
      sock.destroy()
      done()
    })
  })
}

function ippAttr(tag: number, name: string, value: string): Buffer {
  const encoded = Buffer.from(value, 'utf8')
  const nameBuf = Buffer.from(name, 'ascii')
  const out = Buffer.alloc(1 + 2 + nameBuf.length + 2 + encoded.length)
  out[0] = tag
  out.writeUInt16BE(nameBuf.length, 1)
  nameBuf.copy(out, 3)
  out.writeUInt16BE(encoded.length, 3 + nameBuf.length)
  encoded.copy(out, 5 + nameBuf.length)
  return out
}

function ippRequest(host: string, detailed = false): Buffer {
  const uri = `ipp://${host}/ipp/print`
  const parts = [
    Buffer.from([0x02, 0x00, 0x00, 0x0B, 0x00, 0x00, 0x00, 0x01, 0x01]),
    ippAttr(0x47, 'attributes-charset', 'utf-8'),
    ippAttr(0x48, 'attributes-natural-language', 'en'),
    ippAttr(0x45, 'printer-uri', uri),
  ]
  if (detailed) {
    const fields = [
      'printer-make-and-model', 'printer-device-id', 'printer-state', 'printer-state-reasons',
      'printer-is-accepting-jobs', 'marker-names', 'marker-levels', 'marker-high-levels',
      'printer-firmware-string', 'printer-firmware-name', 'printer-firmware-version', 'printer-icons',
    ]
    parts.push(ippAttr(0x44, 'requested-attributes', fields[0]!))
    for (const name of fields.slice(1)) parts.push(ippAttr(0x44, '', name))
  }
  parts.push(Buffer.from([0x03]))
  return Buffer.concat(parts)
}

export async function ippAttributes(host: string): Promise<Record<string, Array<string | number | boolean>>> {
  for (const detailed of [true, false]) {
    const body = ippRequest(host, detailed)
    const http = Buffer.concat([
      Buffer.from(
        `POST /ipp/print HTTP/1.1\r\nHost: ${host}:631\r\nContent-Type: application/ipp\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`,
        'ascii',
      ),
      body,
    ])
    for (const payload of [http, body]) {
      try {
        const sock = await openTcp(host, 631, 6)
        sock.write(payload)
        const parsed = parseIpp(await readSocket(sock))
        sock.destroy()
        if (parsed['printer-make-and-model'] || parsed['printer-device-id'] || parsed['printer-state']) return parsed
      }
      catch { continue }
    }
  }
  return {}
}

async function pjlIdentity(host: string): Promise<string> {
  const query = Buffer.from('\x1b%-12345X@PJL INFO ID\r\n\x1b%-12345X')
  try {
    const sock = await openTcp(host, 9100, 3)
    sock.write(query)
    const data = await readSocket(sock, 4000)
    sock.destroy()
    const text = data.toString('latin1')
    const match = text.match(/INFO ID\s*\r?\n"([^"]+)"/i) || text.match(/"([^"]{3,80})"/)
    return match?.[1]?.trim().slice(0, 120) || ''
  }
  catch {
    return ''
  }
}

function identityText(raw: unknown): string {
  let text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || '')
  text = text.trim().replace(/^"|"$/g, '')
  if (text.toUpperCase().startsWith('MDL:')) text = text.split(':').slice(1).join(':').trim()
  const low = text.toLowerCase()
  if (!text || low.includes('nosuch') || low.includes('no such')) return ''
  return text.slice(0, 120)
}

async function snmpIdentity(host: string): Promise<string> {
  const oids = ['1.3.6.1.2.1.25.3.2.1.3.1', '1.3.6.1.2.1.1.1.0', OID_MODEL]
  try {
    const values = await snmpGet(host, oids, 'public', 161, 1.5) || {}
    for (const oid of oids) {
      const text = identityText(values[oid])
      if (text) return text
    }
  }
  catch { /* ignore */ }
  return ''
}

export async function discoverPrinter(host: string): Promise<PrinterDiscovery> {
  const ippOpen = await printerReachable(host, 'ipp')
  const rawOpen = await printerReachable(host, 'socket')
  const found: PrinterDiscovery = {
    reachable: Boolean(ippOpen || rawOpen),
    ipp: Boolean(ippOpen),
    socket: Boolean(rawOpen),
    make: '',
    model: '',
    device_id: '',
    identity: '',
  }
  if (ippOpen) {
    const attrs = await ippAttributes(host)
    const deviceId = String((attrs['printer-device-id'] || [''])[0] || '')
    const makeModel = String((attrs['printer-make-and-model'] || [''])[0] || '').trim()
    const fields = deviceFields(deviceId)
    found.device_id = deviceId.slice(0, 300)
    found.make = (fields.MFG || '').slice(0, 80)
    found.model = (fields.MDL || '').slice(0, 80)
    found.identity = makeModel.slice(0, 120)
  }
  if (rawOpen && !found.model) {
    const pjl = await pjlIdentity(host)
    if (pjl && !found.identity) {
      found.identity = pjl
      found.model = pjl
    }
  }
  if (!found.identity) found.identity = await snmpIdentity(host)
  if (found.identity && !found.model) found.model = found.identity
  if (!found.identity) found.identity = [found.make, found.model].filter(Boolean).join(' ').slice(0, 120)
  if (['', 'printer', 'unknown'].includes(compactName(found.identity))) {
    const named = [found.make, found.model].filter(part => part && !['', 'printer', 'unknown'].includes(compactName(part))).join(' ')
    if (named) found.identity = named.slice(0, 120)
  }
  else if (found.model && !['', 'printer', 'unknown'].includes(compactName(found.model))) {
    if (!compactName(found.identity).includes(compactName(found.model))) {
      found.identity = `${found.identity} ${found.model}`.trim().slice(0, 120)
    }
  }
  return found
}

export async function loadDrivers(): Promise<CupsDriver[]> {
  let info = await cupsCmd(['lpinfo', '-m', '-l'], 25000)
  if (info.returncode && !(info.stdout || '').trim()) info = await cupsCmd(['lpinfo', '-m'], 25000)
  if (info.returncode && !(info.stdout || '').trim()) {
    throw new PrintError((info.stderr || info.stdout || 'Could not list printer drivers').slice(0, 400))
  }
  const drivers = parseLpinfo(info.stdout)
  if (!drivers.length) throw new PrintError('No printer drivers are installed')
  return drivers
}

export async function queueOptions(queue: string): Promise<QueueOption[]> {
  if (!QUEUE_RE.test(queue || '')) return []
  try {
    const listed = await cupsCmd(['lpoptions', '-p', queue, '-l'], 15000)
    if (listed.returncode) return []
    return parseQueueOptions(listed.stdout)
  }
  catch {
    return []
  }
}

async function setOptions(queue: string, pairs: Array<[string, string]>) {
  for (const [key, value] of pairs) {
    if (!OPTION_RE.test(key) || !OPTION_VALUE_RE.test(String(value))) continue
    const result = await cupsCmd(['lpadmin', '-p', queue, '-o', `${key}=${value}`], 15000)
    if (result.returncode) {
      throw new PrintError((result.stderr || result.stdout || `${key} could not be saved`).slice(0, 400))
    }
  }
}

export async function applyQueueOptions(db: Db, queue: string, choices: Record<string, string>) {
  if (!QUEUE_RE.test(queue || '')) throw new PrintError('Invalid queue')
  const known = Object.fromEntries((await queueOptions(queue)).map(item => [item.key, item]))
  const pairs: Array<[string, string]> = []
  for (const [key, value] of Object.entries(choices || {})) {
    const option = known[key]
    if (!option || !option.values.includes(String(value)) || String(value) === option.current) continue
    pairs.push([key, String(value)])
  }
  await setOptions(queue, pairs)
  if (pairs.length) await recordPrinterEvent(db, 'success', `Printer ${queue} settings saved`)
  return pairs.map(([key]) => key)
}

async function deviceUri(queue: string, address: string, protocol: string): Promise<string> {
  const remote = protocol === 'socket' ? 9100 : 631
  const local = await localForward(queue, address, remote).catch(() => 0)
  if (local) return protocol === 'socket' ? `socket://127.0.0.1:${local}` : `ipp://127.0.0.1:${local}/ipp/print`
  return protocol === 'socket' ? `socket://${address}:9100` : `ipp://${address}/ipp/print`
}

async function pointQueue(queue: string, uri: string) {
  try {
    const result = await cupsCmd(['lpadmin', '-p', queue, '-v', uri], 20000)
    if (result.returncode === 0) return
    const text = (result.stderr || result.stdout || '').toLowerCase()
    if (text.includes('unknown') || text.includes('does not exist') || text.includes('no such')) return
    throw new PrintError((result.stderr || result.stdout || 'The printer queue could not be moved').slice(0, 400))
  }
  catch (err) {
    if (err instanceof PrintError && err.message.includes('not installed')) return
    throw err
  }
}

export async function useTailRoute(queue: string, address: string, protocol: string) {
  const uri = await deviceUri(queue, address, protocol || 'socket')
  if (!uri.includes('127.0.0.1')) return
  await pointQueue(queue, uri)
}

export async function useDirectRoute(queue: string, address: string, protocol: string) {
  const uri = protocol === 'socket' ? `socket://${address}:9100` : `ipp://${address}/ipp/print`
  await pointQueue(queue, uri)
}

async function configureQueue(
  queue: string,
  address: string,
  discovery: PrinterDiscovery,
  drivers: CupsDriver[],
  keepOptions = false,
) {
  const choice = chooseDriver(discovery, drivers)
  if (!MODEL_RE.test(choice.model)) throw new PrintError('The selected driver name was not usable')
  const saved = keepOptions ? (await queueOptions(queue)).map(item => [item.key, item.current] as [string, string]) : []
  const uri = await deviceUri(queue, address, choice.protocol)
  const result = await cupsCmd(['lpadmin', '-p', queue, '-E', '-v', uri, '-m', choice.model], 40000)
  if (result.returncode) throw new PrintError((result.stderr || result.stdout || 'The printer could not be added').slice(0, 400))
  if (saved.length) await setOptions(queue, saved)
  else {
    const listed = await cupsCmd(['lpoptions', '-p', queue, '-l'], 15000)
    if (listed.returncode === 0) await setOptions(queue, densityOptions(listed.stdout))
  }
  await cupsCmd(['cupsaccept', queue]).catch(() => null)
  await cupsCmd(['cupsenable', queue]).catch(() => null)
  return choice
}

async function savePrinter(
  db: Db,
  queue: string,
  label: string,
  address: string,
  choice: { protocol: string, label?: string, driver?: string },
  tail?: { hostname?: string, ip?: string } | null,
) {
  const hostname = tail?.hostname || ''
  const ip = tail?.ip || ''
  await db.insert(printers).values({
    queue,
    label: label.slice(0, 100),
    host: address,
    protocol: choice.protocol,
    identity: (choice.label || '').slice(0, 120),
    driver: (choice.driver || '').slice(0, 120),
    tailHostname: hostname,
    tailIp: ip,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: printers.queue,
    set: {
      label: label.slice(0, 100),
      host: address,
      protocol: choice.protocol,
      identity: (choice.label || '').slice(0, 120),
      driver: (choice.driver || '').slice(0, 120),
      updatedAt: new Date(),
    },
  })
}

export async function addPrinter(
  db: Db,
  opts: { label: string, queue: string, host: string, authKey?: string, tailHostname?: string },
) {
  const queue = opts.queue.trim()
  if (!QUEUE_RE.test(queue)) throw new PrintError('Queue must begin with a letter and contain only letters, numbers, _ or -')
  const address = requireIpv4(opts.host)
  const name = opts.label.trim().slice(0, 100)
  if (!name) throw new PrintError('Enter a display name')
  let joined: { hostname?: string, ip?: string } | null = null
  let saved = false
  try {
    if (opts.authKey?.trim()) {
      joined = await connectTailnet(queue, opts.authKey, opts.tailHostname || '', name)
      bindHost(queue, address)
    }
    const discovery = await discoverPrinter(address)
    if (!discovery.reachable) {
      if (!joined) throw new PrintError('The printer did not answer. Check the address and that this host can reach it.')
      await savePrinter(db, queue, name, address, { protocol: 'socket', label: '', driver: '' }, joined)
      saved = true
      await recordPrinterEvent(db, 'warning', `Printer ${queue} joined the tailnet but did not answer`)
      kickPrinterImage(db, queue)
      return 'joined the tailnet, waiting for the printer'
    }
    let choice: { protocol: string, label: string, driver: string }
    try {
      choice = await configureQueue(queue, address, discovery, await loadDrivers())
    }
    catch (err) {
      if (!(err instanceof PrintError) || !/not installed|not on PATH/i.test(err.message)) throw err
      await savePrinter(db, queue, name, address, {
        protocol: discovery.socket ? 'socket' : 'ipp',
        label: discovery.identity,
        driver: '',
      }, joined)
      saved = true
      await recordPrinterEvent(db, 'warning', `Printer ${queue} saved. ${err.message}`)
      kickPrinterImage(db, queue)
      return discovery.identity || name
    }
    await savePrinter(db, queue, name, address, choice, joined)
    saved = true
    await recordPrinterEvent(db, 'success', `Printer ${queue} configured on ${address} (${choice.label.slice(0, 80)})`)
    kickPrinterImage(db, queue)
    return choice.label
  }
  catch (err) {
    if (joined && !saved) {
      try { disconnectTailnet(queue) }
      catch {
        await recordPrinterEvent(db, 'warning', `Printer ${queue} could not be saved, and its tailnet device may still be signed in`)
      }
    }
    throw err
  }
}

export async function updatePrinter(db: Db, queue: string, label: string, ip: string, reread = false) {
  if (!QUEUE_RE.test(queue)) throw new PrintError('Invalid queue')
  const address = requireIpv4(ip)
  const name = label.trim().slice(0, 100)
  if (!name) throw new PrintError('Enter a display name')
  const row = await getPrinterRow(db, queue)
  if (!row) throw new PrintError('Printer not found')
  if (address === row.host && !reread) {
    await db.update(printers).set({ label: name, updatedAt: new Date() }).where(eq(printers.queue, queue))
    await recordPrinterEvent(db, 'success', `Printer ${queue} renamed to ${name}`)
    return (row.identity || name).slice(0, 120)
  }
  const owned = hasNode(queue)
  if (owned) bindHost(queue, address)
  try {
    const discovery = await discoverPrinter(address)
    if (!discovery.reachable) throw new PrintError('The printer did not answer. The saved printer was left unchanged.')
    let choice: { protocol: string, label: string, driver: string }
    try {
      choice = await configureQueue(queue, address, discovery, await loadDrivers(), address === row.host)
    }
    catch (err) {
      if (!(err instanceof PrintError) || !/not installed|not on PATH/i.test(err.message)) throw err
      choice = {
        protocol: discovery.socket ? 'socket' : 'ipp',
        label: discovery.identity || name,
        driver: '',
      }
    }
    await savePrinter(db, queue, name, address, choice)
  }
  catch (err) {
    if (owned) bindHost(queue, row.host)
    throw err
  }
  await recordPrinterEvent(db, 'success', `Printer ${queue} updated on ${address}`)
  kickPrinterImage(db, queue)
  return name
}

export async function removePrinter(db: Db, queue: string) {
  if (!QUEUE_RE.test(queue)) throw new PrintError('Invalid queue')
  const result = await cupsCmd(['lpadmin', '-x', queue]).catch((err: unknown) => {
    if (err instanceof PrintError && err.message.includes('not installed')) return { returncode: 0, stdout: '', stderr: '' }
    throw err
  })
  if (result.returncode) throw new PrintError(result.stderr || 'Could not delete queue')
  try { disconnectTailnet(queue) }
  catch { await recordPrinterEvent(db, 'warning', `Printer ${queue} was removed, but its tailnet device may still be signed in`) }
  await db.delete(printers).where(eq(printers.queue, queue))
}

export async function joinPrinterTailnet(db: Db, queue: string, authKey: string, hostname: string) {
  if (!QUEUE_RE.test(queue || '')) throw new PrintError('Invalid queue')
  const row = await getPrinterRow(db, queue)
  if (!row) throw new PrintError('Add the printer before joining it to the tailnet')
  const info = await connectTailnet(queue, authKey, hostname, row.label)
  bindHost(queue, row.host)
  try { await useTailRoute(queue, row.host, row.protocol || 'socket') }
  catch (err) {
    if (err instanceof PrintError) {
      await recordPrinterEvent(db, 'warning', `Printer ${queue} joined the tailnet. Its queue will use that device once the printer answers.`)
    }
    else throw err
  }
  await db.update(printers).set({
    tailHostname: info.hostname || hostname,
    tailIp: info.ip || '',
    updatedAt: new Date(),
  }).where(eq(printers.queue, queue))
  return info
}

export async function leavePrinterTailnet(db: Db, queue: string) {
  if (!QUEUE_RE.test(queue || '')) throw new PrintError('Invalid queue')
  const row = await getPrinterRow(db, queue)
  if (!row) throw new PrintError('Printer not found')
  disconnectTailnet(queue)
  await useDirectRoute(queue, row.host, row.protocol || 'socket')
  await db.update(printers).set({ tailHostname: '', tailIp: '', updatedAt: new Date() }).where(eq(printers.queue, queue))
}

export async function installedDriver(queue: string) {
  const blank = { uri: '', ppd: '', nickname: '' }
  if (!QUEUE_RE.test(queue || '')) return blank
  try {
    const listed = await cupsCmd(['lpstat', '-l', '-p', queue], 6000)
    const info = { ...blank }
    for (const line of (listed.stdout || '').split(/\n/)) {
      const stripped = line.trim()
      const lower = stripped.toLowerCase()
      if (lower.startsWith('interface:')) info.ppd = stripped.split(':').slice(1).join(':').trim()
      else if (lower.startsWith('device uri:')) info.uri = stripped.split(':').slice(1).join(':').trim()
    }
    if (info.ppd && existsSync(info.ppd)) {
      try {
        for (const raw of readFileSync(info.ppd, 'utf8').split(/\n/)) {
          if (raw.startsWith('*NickName:')) {
            info.nickname = raw.split(':').slice(1).join(':').trim().replace(/^"|"$/g, '').slice(0, 120)
            break
          }
        }
      }
      catch { /* ignore */ }
    }
    return info
  }
  catch {
    return blank
  }
}

export function describeDriver(saved: string, protocol = '', live?: { uri?: string, ppd?: string, nickname?: string }) {
  const text = (saved || '').trim()
  live = live || {}
  const nickname = (live.nickname || '').trim()
  const shown = nickname || text
  let [name, packageName] = [shown, '']
  if (shown.includes(', using ')) {
    const parts = shown.split(', using ')
    name = parts[0] || shown
    packageName = (parts[1] || '').trim()
  }
  const blob = `${text} ${nickname} ${live.ppd || ''}`.toLowerCase()
  if (!packageName && blob.includes('brlaser')) packageName = 'brlaser'
  else if (!packageName && blob.includes('gutenprint')) packageName = 'Gutenprint'
  else if (!packageName && blob.includes('everywhere')) packageName = 'IPP Everywhere'
  const uri = live.uri || ''
  let connection = ''
  if (uri.startsWith('socket://') || protocol === 'socket') connection = 'Port 9100'
  else if (uri.startsWith('ipp://') || protocol === 'ipp') connection = 'IPP'
  const ppd = basename(live.ppd || '')
  if (!name) {
    name = 'Not selected yet'
    packageName = ''
  }
  return { name: name.slice(0, 120), package: packageName.slice(0, 80), connection, ppd: ppd.slice(0, 80) }
}

function snmpText(raw: unknown): string {
  let text = String(raw || '').trim().replace(/^"|"$/g, '')
  const low = text.toLowerCase()
  if (!text || low.includes('no such') || low.includes('nosuch') || ['null', 'nosuchobject', 'nosuchinstance'].includes(low)) return ''
  if (/^(?:[0-9A-Fa-f]{2} )+[0-9A-Fa-f]{2}$/.test(text)) {
    try { text = Buffer.from(text.replace(/ /g, ''), 'hex').toString('utf8').trim() }
    catch { return '' }
  }
  return text
}

function snmpInt(raw: unknown): number | null {
  const text = snmpText(raw).split(/\s+/)[0] || ''
  if (/^-?\d+$/.test(text)) return Number(text)
  return null
}

function readingsFromSnmp(lines: string[] | null) {
  const blank = { state: '', reasons: [] as string[], pages: null as number | null, supplies: [] as Array<{ name: string, percent: number }>, serial: '', firmware: '' }
  if (!lines || lines.length < SNMP_OIDS.length) return blank
  let pages = snmpInt(lines[0])
  if (pages != null && pages < 0) pages = null
  const serial = snmpText(lines[1]).slice(0, 40)
  const state = SNMP_STATES[snmpInt(lines[2]) || 0] || ''
  const supplies = []
  for (let offset = 3; offset < SNMP_OIDS.length; offset += 3) {
    const name = snmpText(lines[offset]) || 'Toner'
    const percent = supplyPercent(snmpInt(lines[offset + 2]), snmpInt(lines[offset + 1]))
    if (percent == null) continue
    supplies.push({ name: name.slice(0, 40), percent })
  }
  return { state, reasons: [] as string[], pages, supplies: supplies.slice(0, 6), serial, firmware: '' }
}

async function snmpLines(host: string): Promise<string[] | null> {
  const community = process.env.SNMP_COMMUNITY || 'public'
  const port = Number(process.env.SNMP_PORT || 161) || 161
  const values = await snmpGet(host, [...SNMP_OIDS], community, port, 3)
  if (!values) return null
  return SNMP_OIDS.map((oid) => {
    const raw = values[oid]
    if (Buffer.isBuffer(raw)) return raw.toString('utf8').trim()
    return String(raw ?? '').trim()
  })
}

export async function printerStats(host: string, identity = ''): Promise<PrinterStats | null> {
  try {
    const attrs = await ippAttributes(host)
    const ipp = readingsFromIpp(attrs)
    const snmp = readingsFromSnmp(await snmpLines(host))
    const hint = [identity, String((attrs['printer-make-and-model'] || [''])[0]), String((attrs['printer-device-id'] || [''])[0])].join(' ')
    const reported = [...(ipp.supplies || []), ...(snmp.supplies || [])]
    const extra = (looksLikeBrother(hint) || (reported.some(item => /drum|opc|imaging|photoconductor/i.test(item.name)) && !reported.some(item => /toner|ink/i.test(item.name) && !/drum/i.test(item.name))))
      ? await brotherReadings(host, hint).catch(() => null)
      : null
    let pages = snmp.pages
    if (pages == null && extra && typeof extra.pages === 'number') pages = extra.pages
    const reasons = [...ipp.reasons]
    for (const item of extra?.reasons || []) {
      if (!reasons.includes(item)) reasons.push(item)
    }
    const fields = deviceFields(String((attrs['printer-device-id'] || [''])[0] || ''))
    const deviceId = String((attrs['printer-device-id'] || [''])[0] || '').slice(0, 300)
    const reportedName = [fields.MFG, fields.MDL].filter(Boolean).join(' ').trim()
    const makeModel = String((attrs['printer-make-and-model'] || [''])[0] || '').trim()
    let model = makeModel || reportedName
    if (['', 'printer', 'unknown'].includes(compactName(makeModel))) model = reportedName
    else if (reportedName && !compactName(makeModel).includes(compactName(fields.MDL || ''))) model = `${makeModel} ${reportedName}`.trim()
    const stats: PrinterStats = {
      state: ipp.state || snmp.state || extra?.state || '',
      reasons,
      pages,
      pages_label: typeof pages === 'number' ? pages.toLocaleString() : '',
      supplies: mergeSupplies(extra?.supplies, snmp.supplies, ipp.supplies),
      serial: ipp.serial || snmp.serial || extra?.serial || '',
      firmware: ipp.firmware,
      checks: extra?.checks || [],
      model: model.slice(0, 120),
      device_id: deviceId,
      health: extra?.health,
    }
    if (!stats.state && !stats.pages_label && !stats.supplies.length && !stats.serial && !stats.firmware && !stats.reasons.length && !stats.checks.length && !stats.model) {
      return null
    }
    return stats
  }
  catch {
    return null
  }
}

function safeFilename(filename: string): string {
  let name = basename(String(filename || 'document')).trim()
  if (name === '' || name === '.' || name === '..') name = 'document'
  if (name.length > 180) {
    const suffix = extname(name).slice(-16)
    name = name.slice(0, 180 - suffix.length) + suffix
  }
  return name
}

async function renderTxtPdf(text: string, dest: string) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Courier)
  let page = doc.addPage([612, 792])
  let y = 750
  const lines = text.split(/\n/).slice(0, 10000)
  for (const line of lines) {
    const chunks = line.length ? line.match(/.{1,88}/g) || [''] : ['']
    for (const chunk of chunks) {
      if (y < 48) {
        page = doc.addPage([612, 792])
        y = 750
      }
      page.drawText(chunk, { x: 48, y, size: 10, font, color: rgb(0.1, 0.12, 0.16) })
      y -= 14
    }
  }
  writeFileSync(dest, Buffer.from(await doc.save()))
}

async function imagesToPdf(data: Buffer, dest: string, maxPages: number) {
  const meta = await sharp(data, { animated: true, limitInputPixels: 40_000_000 }).metadata()
  const pages = Math.min(Math.max(meta.pages || 1, 1), maxPages)
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) {
    const frame = await sharp(data, { page: i, limitInputPixels: 40_000_000 }).rotate().png().toBuffer()
    const image = await doc.embedPng(frame)
    const page = doc.addPage([612, 792])
    const maxW = 612 - 36
    const maxH = 792 - 36
    const scale = Math.min(maxW / image.width, maxH / image.height, 1)
    const w = image.width * scale
    const h = image.height * scale
    page.drawImage(image, { x: (612 - w) / 2, y: (792 - h) / 2, width: w, height: h })
  }
  writeFileSync(dest, Buffer.from(await doc.save()))
}

export async function prepareBytes(filename: string, data: Buffer, maxPages: number): Promise<{ path: string, pages: number }> {
  const suffix = extname(filename).toLowerCase()
  if (!(PRINTER_ALLOWED_EXTENSIONS as readonly string[]).includes(suffix)) {
    throw new PrintError(`Unsupported file type: ${suffix || 'unknown'}`)
  }
  if (!data.length) throw new PrintError('Empty attachment')
  const folder = join(printersDataDir(), 'files')
  mkdirSync(folder, { recursive: true })
  const root = randomUUID().replace(/-/g, '')
  const original = join(folder, `${root}${suffix}`)
  writeFileSync(original, data)
  let dest = join(folder, `${root}.pdf`)
  try {
    if (suffix === '.pdf') {
      if (!data.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new PrintError('Invalid PDF file')
      dest = original
    }
    else if (['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff'].includes(suffix)) {
      await imagesToPdf(data, dest, maxPages)
    }
    else if (suffix === '.txt') {
      await renderTxtPdf(data.toString('utf8'), dest)
    }
    else {
      const tmp = mkdtempSync(join(printersDataDir(), 'tmp', 'lo-'))
      try {
        const bin = existsSync('/usr/bin/libreoffice') ? 'libreoffice' : 'soffice'
        const out = await cupsCmd([
          bin, `-env:UserInstallation=file://${tmp}`,
          '--headless', '--convert-to', 'pdf', '--outdir', folder, original,
        ], 55000)
        if (out.returncode || !existsSync(dest)) {
          throw new PrintError(`Office conversion failed: ${(out.stderr || out.stdout).slice(0, 200)}`)
        }
      }
      finally {
        rmSync(tmp, { recursive: true, force: true })
      }
    }
    const pdf = await PDFDocument.load(readFileSync(dest), { ignoreEncryption: true })
    const pages = pdf.getPageCount()
    if (pages < 1 || pages > maxPages) throw new PrintError(`Document has ${pages} pages; limit is ${maxPages}`)
    if (original !== dest) {
      try { unlinkSync(original) }
      catch { /* ignore */ }
    }
    return { path: dest, pages }
  }
  catch (err) {
    try { unlinkSync(original) }
    catch { /* ignore */ }
    if (dest !== original) {
      try { unlinkSync(dest) }
      catch { /* ignore */ }
    }
    throw err
  }
}

async function sendViaCups(queue: string, copies: number, sides: string, path: string) {
  let command = ['lp', '-d', queue, '-n', String(copies), '-o', `sides=${sides}`, '-o', 'print-scaling=auto', '-o', 'media=Letter', path]
  let result = await cupsCmd(command, 35000)
  const text = `${result.stderr || ''} ${result.stdout || ''}`.toLowerCase()
  if (result.returncode && text.includes('media')) {
    command = ['lp', '-d', queue, '-n', String(copies), '-o', `sides=${sides}`, '-o', 'print-scaling=auto', path]
    result = await cupsCmd(command, 35000)
  }
  return result
}

async function sendToQueue(
  queue: string,
  copies: number,
  sides: string,
  path: string,
  printer: { host: string, protocol: string } | null,
) {
  if (cupsAvailable()) {
    try {
      const result = await sendViaCups(queue, copies, sides, path)
      if (!result.returncode) return result
      const text = `${result.stderr || ''} ${result.stdout || ''}`.toLowerCase()
      if (!/unknown destination|does not exist|no such|not found/.test(text)) return result
    }
    catch (err) {
      if (!(err instanceof PrintError) || !/not installed|not on PATH/i.test(err.message)) throw err
    }
  }
  if (!printer?.host) throw new PrintError('Printer not configured')
  return sendDirectToPrinter({
    queue,
    host: printer.host,
    protocol: printer.protocol,
    copies,
    sides,
    path,
  })
}

async function sheetForDuplex(path: string, sides: string): Promise<string> {
  if (sides !== 'two-sided-long-edge' && sides !== 'two-sided-short-edge') return path
  const bytes = readFileSync(path)
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const count = pdf.getPageCount()
  if (count < 1 || count % 2 === 0) return path
  const last = pdf.getPage(count - 1)
  const { width, height } = last.getSize()
  pdf.addPage([width, height])
  const padded = `${path}.${randomUUID().replace(/-/g, '')}.sheet.pdf`
  writeFileSync(padded, Buffer.from(await pdf.save()))
  return padded
}

export async function recordRejection(
  db: Db,
  filename: string,
  reason: string,
  queue = '',
  source = 'email',
  sender = '',
  dedupe: string | null = null,
  copies = 1,
  sides = 'one-sided',
) {
  const name = filename.split(/\s+/).join(' ').slice(0, 180) || 'Email'
  const why = reason.split(/\s+/).join(' ').slice(0, 500)
  const target = (queue || '').trim() || '—'
  let copyCount = Number(copies)
  if (!Number.isInteger(copyCount) || copyCount < 1 || copyCount > 10) copyCount = 1
  const side = isPrinterSides(sides) ? sides : 'one-sided'
  if (dedupe) {
    const [existing] = await db.select({ id: printerJobs.id }).from(printerJobs).where(eq(printerJobs.dedupe, dedupe)).limit(1)
    if (existing) return existing.id
  }
  const [row] = await db.insert(printerJobs).values({
    dedupe,
    source,
    sender: String(sender || '').slice(0, 200),
    filename: name,
    queue: target,
    copies: copyCount,
    sides: side,
    status: 'rejected',
    error: why,
  }).returning({ id: printerJobs.id })
  return row!.id
}

export async function submitFile(
  db: Db,
  opts: {
    filename: string
    data: Buffer
    queue: string
    copies?: number
    sides?: string
    source?: string
    sender?: string
    dedupe?: string | null
    release?: boolean
  },
) {
  const cfg = await printerSettingsMap(db)
  const maxMb = Math.max(1, Math.min(Number(cfg.max_mb || 12), 30))
  const safeName = safeFilename(opts.filename)
  const copies = Number(opts.copies ?? 1)
  const sides = opts.sides || 'one-sided'
  const source = opts.source || 'upload'
  const sender = opts.sender || ''
  const dedupe = opts.dedupe || null
  if (opts.data.length > maxMb * 1024 * 1024) {
    await recordRejection(db, safeName, `File larger than ${maxMb} MB limit`, opts.queue, source, sender, dedupe, copies, sides)
    throw new PrintError(`File larger than ${maxMb} MB limit`)
  }
  if (!isPrinterSides(sides) || !Number.isInteger(copies) || copies < 1 || copies > 10) {
    await recordRejection(db, safeName, 'Invalid print options', opts.queue, source, sender, dedupe, 1, sides)
    throw new PrintError('Invalid print options')
  }
  const configured = await getPrinterRow(db, opts.queue)
  if (!configured) {
    await recordRejection(db, safeName, 'Printer not configured', opts.queue, source, sender, dedupe, copies, sides)
    throw new PrintError('Printer not configured')
  }
  if (dedupe) {
    const [existing] = await db.select({ id: printerJobs.id, status: printerJobs.status }).from(printerJobs).where(eq(printerJobs.dedupe, dedupe)).limit(1)
    if (existing) {
      if (['submitted', 'cancelled', 'pending', 'sending'].includes(existing.status)) return existing.id
      throw new PrintError('This attachment was already processed; retry the failed job from Print jobs')
    }
  }
  const [inserted] = await db.insert(printerJobs).values({
    dedupe,
    source,
    sender,
    filename: safeName,
    queue: opts.queue,
    copies,
    sides,
    status: 'preparing',
  }).returning({ id: printerJobs.id })
  const jobId = inserted!.id
  try {
    const prepared = await prepareBytes(safeName, opts.data, Math.max(1, Math.min(Number(cfg.max_pages || 40), 200)))
    await db.update(printerJobs).set({
      filepath: prepared.path,
      pages: prepared.pages,
      status: 'pending',
      error: '',
      fileData: readFileSync(prepared.path),
      updatedAt: new Date(),
    }).where(eq(printerJobs.id, jobId))
    if (opts.release !== false) await releaseQueues(db)
    return jobId
  }
  catch (err) {
    await db.update(printerJobs).set({
      status: 'error',
      error: String(err instanceof Error ? err.message : err).slice(0, 500),
      updatedAt: new Date(),
    }).where(eq(printerJobs.id, jobId))
    throw err
  }
}

export async function printerBlock(db: Db, queue: string) {
  if (!QUEUE_RE.test(queue || '')) return null
  const printer = await getPrinterRow(db, queue)
  if (!printer) return null
  const identity = printer.identity || printer.label || ''
  const online = await printerReachable(printer.host, printer.protocol, 1)
  let stats: PrinterStats | null = null
  if (online) {
    try { stats = await printerStats(printer.host, identity) }
    catch { stats = null }
  }
  const issues = printerIssues(stats, online)
  if (!issues.length) return null
  return { issues, label: printer.label }
}

async function markWaiting(db: Db, queue: string, issues: string[]) {
  await db.update(printerJobs)
    .set({ error: issues.join(' ').slice(0, 500), updatedAt: new Date() })
    .where(and(eq(printerJobs.queue, queue), eq(printerJobs.status, 'pending')))
}

export async function dispatchJob(db: Db, jobId: string) {
  const [record] = await db.select().from(printerJobs).where(eq(printerJobs.id, jobId)).limit(1)
  if (!record) throw new PrintError('Job not found')
  let path = record.filepath
  if (!path || !existsSync(path)) {
    if (record.fileData) {
      const folder = join(printersDataDir(), 'files')
      mkdirSync(folder, { recursive: true })
      path = join(folder, `${record.id}.pdf`)
      writeFileSync(path, record.fileData)
      await db.update(printerJobs).set({ filepath: path }).where(eq(printerJobs.id, jobId))
    }
  }
  if (!path || !existsSync(path)) {
    await db.update(printerJobs).set({
      status: 'error',
      error: 'The saved document is not available for retry',
      updatedAt: new Date(),
    }).where(and(eq(printerJobs.id, jobId), eq(printerJobs.status, 'pending')))
    throw new PrintError('The saved document is not available for retry')
  }
  const claimed = await db.update(printerJobs)
    .set({ status: 'sending', error: '', updatedAt: new Date() })
    .where(and(eq(printerJobs.id, jobId), eq(printerJobs.status, 'pending')))
    .returning({ id: printerJobs.id })
  if (!claimed.length) return null
  let printPath = path
  try {
    printPath = await sheetForDuplex(path, record.sides)
    const printer = await getPrinterRow(db, record.queue)
    const result = await sendToQueue(record.queue, record.copies, record.sides, printPath, printer)
    if (result.returncode) {
      const error = (result.stderr || result.stdout || 'CUPS rejected job').slice(0, 400)
      await db.update(printerJobs).set({ status: 'error', error, updatedAt: new Date() }).where(eq(printerJobs.id, jobId))
      throw new PrintError(error)
    }
    const match = (result.stdout || '').match(/request id is (\S+)/)
    await db.update(printerJobs).set({
      status: 'submitted',
      error: '',
      cupsId: match?.[1] || '',
      updatedAt: new Date(),
    }).where(eq(printerJobs.id, jobId))
    await recordPrinterEvent(db, 'success', `Job ${jobId.slice(0, 8)} sent to ${record.queue}: ${record.filename.slice(0, 100)}`)
    return jobId
  }
  catch (err) {
    if (err instanceof PrintError) throw err
    await db.update(printerJobs).set({
      status: 'error',
      error: String(err instanceof Error ? err.message : err).slice(0, 400),
      updatedAt: new Date(),
    }).where(eq(printerJobs.id, jobId))
    throw err
  }
  finally {
    if (printPath !== path) {
      try { unlinkSync(printPath) }
      catch { /* ignore */ }
    }
  }
}

async function releaseQueue(db: Db, queue: string) {
  while (true) {
    const printer = await getPrinterRow(db, queue)
    const [job] = await db.select({ id: printerJobs.id })
      .from(printerJobs)
      .where(and(eq(printerJobs.status, 'pending'), eq(printerJobs.queue, queue)))
      .orderBy(printerJobs.createdAt)
      .limit(1)
    if (!job) return
    if (!printer) {
      await db.update(printerJobs).set({
        status: 'error',
        error: 'Printer not configured',
        updatedAt: new Date(),
      }).where(and(eq(printerJobs.id, job.id), eq(printerJobs.status, 'pending')))
      continue
    }
    const block = await printerBlock(db, queue)
    if (block) {
      await markWaiting(db, queue, block.issues)
      return
    }
    try { await dispatchJob(db, job.id) }
    catch (err) {
      if (!(err instanceof PrintError)) throw err
    }
  }
}

export async function releaseQueues(db: Db) {
  const rows = await db.select({ queue: printerJobs.queue })
    .from(printerJobs)
    .where(eq(printerJobs.status, 'pending'))
    .groupBy(printerJobs.queue)
  for (const row of rows) {
    if (queueLocks.has(row.queue)) continue
    queueLocks.add(row.queue)
    try { await releaseQueue(db, row.queue) }
    finally { queueLocks.delete(row.queue) }
  }
}

export async function requeueJob(db: Db, jobId: string) {
  const [row] = await db.select().from(printerJobs).where(eq(printerJobs.id, jobId)).limit(1)
  if (!row || row.status !== 'error') throw new PrintError('Only failed jobs can be retried')
  if ((!row.filepath || !existsSync(row.filepath)) && !row.fileData) {
    throw new PrintError('The saved document is not available for retry')
  }
  await db.update(printerJobs).set({ status: 'pending', error: '', updatedAt: new Date() })
    .where(and(eq(printerJobs.id, jobId), eq(printerJobs.status, 'error')))
  await releaseQueues(db)
  return jobId
}

export async function cancelPendingJob(db: Db, jobId: string) {
  const [row] = await db.select().from(printerJobs).where(eq(printerJobs.id, jobId)).limit(1)
  if (!row) throw new PrintError('Job not found')
  if (row.status !== 'pending' || row.cupsId) {
    throw new PrintError('A document already sent to the printer cannot be cancelled')
  }
  const updated = await db.update(printerJobs)
    .set({ status: 'cancelled', error: '', updatedAt: new Date() })
    .where(and(eq(printerJobs.id, jobId), eq(printerJobs.status, 'pending'), eq(printerJobs.cupsId, '')))
    .returning({ id: printerJobs.id })
  if (!updated.length) throw new PrintError('A document already sent to the printer cannot be cancelled')
}

export async function retargetSavedQueues(db: Db) {
  const rows = await listPrinterRows(db)
  resumeTailnet(rows.map(row => ({ queue: row.queue, host: row.host, tailHostname: row.tailHostname })))
  if (!rows.length) return
  let drivers: CupsDriver[]
  try { drivers = await loadDrivers() }
  catch (err) {
    await recordPrinterEvent(db, 'warning', `Printer drivers could not be listed: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`)
    return
  }
  for (const row of rows) {
    if (!QUEUE_RE.test(row.queue || '')) continue
    try {
      const address = requireIpv4(row.host)
      const discovery = await discoverPrinter(address)
      const remembered = (row.identity || '').trim()
      if (remembered && !discovery.model) {
        discovery.identity = remembered
        discovery.model = remembered
      }
      if (!discovery.reachable && !discovery.model) {
        if (hasNode(row.queue)) {
          try { await useTailRoute(row.queue, address, row.protocol || 'socket') }
          catch { /* ignore */ }
        }
        continue
      }
      const choice = await configureQueue(row.queue, address, discovery, drivers, true)
      await savePrinter(db, row.queue, row.label || row.queue, address, choice)
    }
    catch (err) {
      await recordPrinterEvent(db, 'warning', `Printer ${row.queue} was not updated: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`)
    }
  }
}

export async function buildPrintersPage(db: Db, tab: string) {
  const cfg = await printerSettingsMap(db)
  const rows = await listPrinterRows(db)
  const live = tab === 'overview' || tab === 'devices'
  const devices = []
  for (const row of rows) {
    const tail = deviceStatus(row.queue, { hostname: row.tailHostname, ip: row.tailIp })
    let online = false
    let stats: PrinterStats | null = null
    if (live) {
      const snap = await pageSnapshot(row.host, row.protocol, row.identity || row.label || '')
      online = snap.online
      stats = snap.stats
    }
    const condition = printerCondition(stats, online)
    const item = {
      queue: row.queue,
      label: row.label,
      host: row.host,
      protocol: row.protocol,
      identity: row.identity,
      driver: row.driver,
      tail,
      online,
      stats,
      condition,
      supply: replacementFor([row.identity, row.driver, stats?.model, stats?.device_id].filter(Boolean).join(' '))
        || replacementFor(row.label),
      image: describePrinterImage(row),
      category: categoryFor(row.identity || row.label),
      options: live && tab === 'devices' ? await queueOptions(row.queue) : [],
      driverInfo: live && tab === 'devices'
        ? describeDriver(row.driver, row.protocol, await installedDriver(row.queue))
        : null,
    }
    devices.push(item)
  }
  const jobs = (tab === 'overview' || tab === 'jobs')
    ? (await listPrinterJobRows(db, 100)).map(job => ({
        ...job,
        createdAt: job.createdAt.toISOString(),
      }))
    : []
  const events = tab === 'devices'
    ? (await listPrinterEventRows(db, 60)).map(event => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      }))
    : []
  const tailDevices = devices.map(item => item.tail)
  const tail = cachedStatus(tailDevices)
  const { mailSnapshot } = await import('./mailer')
  const mail = mailSnapshot()
  return {
    tab,
    printers: devices,
    jobs,
    events,
    settings: publicSettings(cfg),
    mail,
    tail,
    tailNote: tailnetNotice(devices, tail),
    cups: tab === 'devices' ? await cupsPrintersReport() : { ok: true, available: true, lines: [], error: '' },
    activeJobs: { ok: true, available: cupsAvailable(), lines: [], error: '' },
    counts: {
      total: jobs.length,
      errors: jobs.filter(j => j.status === 'error' || j.status === 'rejected').length,
      submitted: jobs.filter(j => j.status === 'submitted').length,
      pending: jobs.filter(j => j.status === 'pending').length,
      printers: devices.length,
    },
  }
}

export function publicSettings(cfg: Record<string, string>) {
  const out = { ...cfg }
  if (out.imap_password) out.imap_password = 'saved'
  return out
}

export async function saveMailSettings(db: Db, body: Record<string, string | boolean | number | undefined>) {
  const current = await printerSettingsMap(db)
  const bool = (key: string) => (body[key] ? '1' : '0')
  const str = (key: string, fallback = '') => String(body[key] ?? current[key] ?? fallback)
  await setPrinterSetting(db, 'mail_enabled', bool('mail_enabled'))
  await setPrinterSetting(db, 'imap_host', str('imap_host', 'imap.gmail.com').trim())
  await setPrinterSetting(db, 'imap_port', String(Math.max(1, Math.min(65535, Number(body.imap_port ?? current.imap_port ?? 993)))))
  await setPrinterSetting(db, 'imap_user', str('imap_user').trim())
  const password = String(body.imap_password || '').replace(/\s+/g, '')
  if (password) await setPrinterSetting(db, 'imap_password', password)
  await setPrinterSetting(db, 'imap_folder', str('imap_folder', 'INBOX').trim() || 'INBOX')
  await setPrinterSetting(db, 'default_queue', str('default_queue').trim())
  const sides = str('default_sides', 'one-sided')
  await setPrinterSetting(db, 'default_sides', isPrinterSides(sides) ? sides : 'one-sided')
  await setPrinterSetting(db, 'max_pages', String(Math.max(1, Math.min(200, Number(body.max_pages ?? current.max_pages ?? 40)))))
  await setPrinterSetting(db, 'max_mb', String(Math.max(1, Math.min(30, Number(body.max_mb ?? current.max_mb ?? 12)))))
  await setPrinterSetting(db, 'max_files', String(Math.max(1, Math.min(10, Number(body.max_files ?? current.max_files ?? 5)))))
  await setPrinterSetting(db, 'poll_seconds', String(Math.max(2, Math.min(3600, Number(body.poll_seconds ?? current.poll_seconds ?? 3)))))
  await setPrinterSetting(db, 'print_email_body', bool('print_email_body'))
  await setPrinterSetting(db, 'allowed_senders', str('allowed_senders').trim())
  await setPrinterSetting(db, 'mail_recipient', str('mail_recipient').trim())
  if ('email_pin' in body || 'new_pin' in body) {
    const pin = String(body.new_pin ?? body.email_pin ?? '').trim()
    if (!pin) await setPrinterSetting(db, 'email_pin', '')
    else if (!/^[A-Za-z0-9]{6,32}$/.test(pin)) throw new PrintError('PIN must be 6 to 32 letters or digits')
    else await setPrinterSetting(db, 'email_pin', pin)
  }
  await setPrinterSetting(db, 'reply_enabled', bool('reply_enabled'))
  await setPrinterSetting(db, 'smtp_from', str('smtp_from').trim())
  await setPrinterSetting(db, 'smtp_host', str('smtp_host', 'smtp.gmail.com').trim())
  await setPrinterSetting(db, 'smtp_port', String(Math.max(1, Math.min(65535, Number(body.smtp_port ?? current.smtp_port ?? 587)))))
  await recordPrinterEvent(db, 'success', 'Email automation settings saved')
  return printerSettingsMap(db)
}
