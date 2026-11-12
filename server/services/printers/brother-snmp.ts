import { createSocket } from 'node:dgram'
import { proxyFor, udpExchange } from './tailnet'
import { TailscaleError } from './errors'
import type { PrinterCheck, PrinterSupply } from '../../../shared/printers'

export const OID_MODEL = '1.3.6.1.4.1.2435.2.3.9.1.1.7.0'
export const OID_SERIAL = '1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.1.0'
export const OID_STATUS = '1.3.6.1.4.1.2435.2.3.9.4.2.1.5.4.5.2.0'
export const OID_COUNTERS = '1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.10.0'
export const OID_MAINTENANCE = '1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.8.0'
export const OID_NEXTCARE = '1.3.6.1.4.1.2435.2.3.9.4.2.1.5.5.11.0'
export const OID_PAGES = '1.3.6.1.2.1.43.10.2.1.4.1.1'
export const OID_DEVICE = '1.3.6.1.2.1.25.3.2.1.5.1'
export const OID_PRINTER = '1.3.6.1.2.1.25.3.5.1.1.1'
export const OID_ERRORS = '1.3.6.1.2.1.25.3.5.1.2.1'

const ASK = [
  OID_MODEL, OID_SERIAL, OID_STATUS, OID_COUNTERS, OID_MAINTENANCE, OID_NEXTCARE,
  OID_PAGES, OID_DEVICE, OID_PRINTER, OID_ERRORS,
]

const DEVICE_STATUS: Record<string, string> = { 1: 'Unknown', 2: 'Running', 3: 'Warning', 4: 'Testing', 5: 'Down' }
const PRINTER_STATUS: Record<string, string> = { 1: 'Other', 2: 'Unknown', 3: 'Idle', 4: 'Printing', 5: 'Warming up' }
const ERROR_BITS = [
  'low_paper', 'no_paper', 'low_toner', 'no_toner', 'door_open', 'jammed', 'offline',
  'service_requested', 'input_tray_missing', 'output_tray_missing', 'marker_supply_missing',
  'output_near_full', 'output_full', 'input_tray_empty', 'overdue_prevent_maint',
]
const COUNTERS: Record<string, string> = {
  '00': 'pages', '01': 'bw_pages', '02': 'color_pages', '06': 'duplex_pages',
  '12': 'black_pages', '13': 'cyan_pages', '14': 'magenta_pages', '15': 'yellow_pages',
  '16': 'image_pages',
}
const LASER: Record<string, string> = {
  '11': 'drum_pages',
  '41': 'drum', '69': 'belt', '6a': 'fuser', '6b': 'laser',
  '6c': 'pf_mp', '6d': 'pf_1',
  '6f': 'black_toner', '70': 'cyan_toner', '71': 'magenta_toner', '72': 'yellow_toner',
  '73': 'cyan_drum_pages', '74': 'magenta_drum_pages', '75': 'yellow_drum_pages',
  '79': 'cyan_drum', '7a': 'magenta_drum', '7b': 'yellow_drum', '7e': 'black_drum_pages',
  '80': 'black_drum',
  a1: 'black_toner', a2: 'cyan_toner', a3: 'magenta_toner', a4: 'yellow_toner',
}
const INK: Record<string, string> = {
  '6f': 'black_ink', '70': 'cyan_ink', '71': 'magenta_ink', '72': 'yellow_ink',
  a1: 'black_ink', a2: 'cyan_ink', a3: 'magenta_ink', a4: 'yellow_ink',
}
const NEXTCARE: Record<string, string> = {
  '73': 'laser_pages_left', '77': 'pf_1_pages_left', '82': 'drum_pages_left',
  '86': 'pf_mp_pages_left', '88': 'belt_pages_left', '89': 'fuser_pages_left',
  a4: 'black_drum_pages_left', a5: 'cyan_drum_pages_left',
  a6: 'magenta_drum_pages_left', a7: 'yellow_drum_pages_left',
}
const PERCENTS = new Set([
  'drum', 'belt', 'fuser', 'laser', 'pf_mp', 'pf_1',
  'black_toner', 'cyan_toner', 'magenta_toner', 'yellow_toner',
  'black_ink', 'cyan_ink', 'magenta_ink', 'yellow_ink',
  'black_drum', 'cyan_drum', 'magenta_drum', 'yellow_drum',
])
const SUPPLY_NAMES: Record<string, string> = {
  black_toner: 'Black Toner', cyan_toner: 'Cyan Toner',
  magenta_toner: 'Magenta Toner', yellow_toner: 'Yellow Toner',
  black_ink: 'Black Ink', cyan_ink: 'Cyan Ink',
  magenta_ink: 'Magenta Ink', yellow_ink: 'Yellow Ink',
  drum: 'Drum', black_drum: 'Black Drum', cyan_drum: 'Cyan Drum',
  magenta_drum: 'Magenta Drum', yellow_drum: 'Yellow Drum',
}

export function looksLikeBrother(text: string | null | undefined): boolean {
  const low = String(text || '').toLowerCase()
  if (low.includes('brother')) return true
  return /\b(?:hl|mfc|dcp|fax)-/.test(low)
}

function kindOf(identity: string): 'ink' | 'laser' {
  const low = identity.toLowerCase()
  if (['inkjet', ' ink', 'dcp-j', 'mfc-j'].some(word => low.includes(word))) return 'ink'
  return 'laser'
}

function lenBytes(value: Buffer): Buffer {
  const size = value.length
  if (size < 128) return Buffer.from([size])
  const raw = Buffer.alloc((Math.floor(Math.log2(size)) + 8) >> 3)
  raw.writeUIntBE(size, 0, raw.length)
  return Buffer.concat([Buffer.from([0x80 | raw.length]), raw])
}

function tlv(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), lenBytes(value), value])
}

function integer(number: number): Buffer {
  let hex = (number | 0).toString(16)
  if (hex.length % 2) hex = `0${hex}`
  let raw = Buffer.from(hex, 'hex')
  if (!raw.length) raw = Buffer.from([0])
  if (number >= 0 && raw[0]! & 0x80) raw = Buffer.concat([Buffer.from([0]), raw])
  return tlv(0x02, raw)
}

function encodeOid(oid: string): Buffer {
  const parts = oid.split('.').filter(Boolean).map(Number)
  const body: number[] = [parts[0]! * 40 + parts[1]!]
  for (const part of parts.slice(2)) {
    if (part < 128) {
      body.push(part)
      continue
    }
    const stack = [part & 0x7F]
    let rest = part >> 7
    while (rest) {
      stack.push(0x80 | (rest & 0x7F))
      rest >>= 7
    }
    body.push(...stack.reverse())
  }
  return tlv(0x06, Buffer.from(body))
}

function decodeOid(raw: Buffer): string {
  if (!raw.length) return ''
  const first = Math.floor(raw[0]! / 40)
  const second = raw[0]! % 40
  const parts = [String(first), String(second)]
  let value = 0
  for (const byte of raw.subarray(1)) {
    value = (value << 7) | (byte & 0x7F)
    if (!(byte & 0x80)) {
      parts.push(String(value))
      value = 0
    }
  }
  return parts.join('.')
}

function walk(data: Buffer, index = 0): [number, Buffer, number] {
  if (index >= data.length) throw new Error('short snmp')
  const tag = data[index]!
  index += 1
  let size = data[index]!
  index += 1
  if (size & 0x80) {
    const count = size & 0x7F
    size = data.subarray(index, index + count).reduce((n, b) => (n << 8) + b, 0)
    index += count
  }
  return [tag, data.subarray(index, index + size), index + size]
}

function decodeValue(tag: number, raw: Buffer): string | number | Buffer | null {
  if (tag === 0x02 || tag === 0x41 || tag === 0x42 || tag === 0x43 || tag === 0x46) {
    if (!raw.length) return 0
    if (tag === 0x02) return raw.readIntBE(0, raw.length)
    return raw.readUIntBE(0, Math.min(raw.length, 6))
  }
  if (tag === 0x04) return raw
  if (tag === 0x06) return decodeOid(raw)
  return null
}

function decodeMessage(data: Buffer): [number, number, number, Record<string, string | number | Buffer | null>] {
  const [, message] = walk(data)
  let at = 0
  ;[, , at] = walk(message, at)
  ;[, , at] = walk(message, at)
  const [, pdu] = walk(message, at)
  const [, request, afterRequest] = walk(pdu, 0)
  const [, status, afterStatus] = walk(pdu, afterRequest)
  const [, indexBuf, afterIndex] = walk(pdu, afterStatus)
  const [, binds] = walk(pdu, afterIndex)
  const found: Record<string, string | number | Buffer | null> = {}
  let cursor = 0
  while (cursor < binds.length) {
    const [, pair, next] = walk(binds, cursor)
    cursor = next
    const [, oidRaw, mid] = walk(pair)
    const [tag, raw] = walk(pair, mid)
    found[decodeOid(oidRaw)] = decodeValue(tag, raw)
  }
  const asInt = (buf: Buffer) => (buf.length ? buf.readIntBE(0, buf.length) : 0)
  return [asInt(request), asInt(status), asInt(indexBuf), found]
}

function requestPacket(oids: string[], community: string): Buffer {
  const binds = Buffer.concat(oids.map(oid => tlv(0x30, Buffer.concat([encodeOid(oid), tlv(0x05, Buffer.alloc(0))]))))
  const pdu = tlv(0xA0, Buffer.concat([integer(1), integer(0), integer(0), tlv(0x30, binds)]))
  return tlv(0x30, Buffer.concat([integer(0), tlv(0x04, Buffer.from(community, 'ascii')), pdu]))
}

async function udpSend(host: string, port: number, packet: Buffer, timeout: number): Promise<Buffer | null> {
  return await new Promise((resolve) => {
    const sock = createSocket('udp4')
    const timer = setTimeout(() => {
      sock.close()
      resolve(null)
    }, timeout * 1000)
    sock.once('error', () => {
      clearTimeout(timer)
      sock.close()
      resolve(null)
    })
    sock.once('message', (msg) => {
      clearTimeout(timer)
      sock.close()
      resolve(msg)
    })
    sock.send(packet, port, host, (err) => {
      if (err) {
        clearTimeout(timer)
        sock.close()
        resolve(null)
      }
    })
  })
}

async function snmpPayload(host: string, port: number, packet: Buffer, timeout: number): Promise<Buffer | null> {
  try {
    const proxied = await udpExchange(host, port, packet, Math.max(timeout, 3))
    if (proxied) return proxied
    if (proxyFor(host)) return proxied
  }
  catch (err) {
    if (!(err instanceof TailscaleError) && !(err instanceof Error)) throw err
  }
  return udpSend(host, port, packet, timeout)
}

export async function snmpGet(
  host: string,
  oids: string[],
  community = 'public',
  port = 161,
  timeout = 1.2,
): Promise<Record<string, string | number | Buffer | null> | null> {
  if (!oids.length) return {}
  const packet = requestPacket(oids, community)
  const payload = await snmpPayload(host, port, packet, timeout)
  if (!payload) return null
  try {
    const [, status, index, values] = decodeMessage(payload)
    if (status === 2 && index >= 1 && index <= oids.length) {
      const kept = oids.filter((_, i) => i + 1 !== index)
      return snmpGet(host, kept, community, port, timeout)
    }
    if (status === 1 && oids.length > 1) {
      const middle = Math.floor(oids.length / 2)
      const left = await snmpGet(host, oids.slice(0, middle), community, port, timeout)
      const right = await snmpGet(host, oids.slice(middle), community, port, timeout)
      if (!left && !right) return null
      return { ...(left || {}), ...(right || {}) }
    }
    if (status) return null
    return values
  }
  catch {
    return null
  }
}

function legacy(text: string): boolean {
  const idxs = []
  for (let i = 10; i < text.length; i += 10) idxs.push(i)
  if (!idxs.length) return false
  return idxs.every(index => text.slice(index - 2, index) === '14')
}

function records(blob: unknown, mapping: Record<string, string>, useLegacy = false): Record<string, number> {
  const found: Record<string, number> = {}
  if (!Buffer.isBuffer(blob) || blob.length < 2) return found
  const text = blob.subarray(0, blob.length - 1).toString('hex')
  const size = useLegacy ? 10 : 14
  for (let start = 0; start + size <= text.length; start += size) {
    const word = text.slice(start, start + size)
    const key = mapping[word.slice(0, 2)]
    if (!key) continue
    try {
      if (useLegacy) {
        const whole = Number.parseInt(word.slice(8, 10), 16)
        if (whole <= 0) continue
        found[key] = Math.round(Number.parseInt(word.slice(6, 8), 16) / whole * 100)
      }
      else {
        const number = Number.parseInt(word.slice(-8), 16)
        found[key] = PERCENTS.has(key) ? Math.round(number / 100) : number
      }
    }
    catch {
      continue
    }
  }
  return found
}

function errorFlags(raw: unknown): Set<string> {
  const flags = new Set<string>()
  if (!Buffer.isBuffer(raw) || !raw.length) return flags
  const text = raw.toString('hex')
  const value = BigInt(`0x${text}`)
  const width = text.length * 4
  ERROR_BITS.forEach((name, index) => {
    if (index < width && ((value >> BigInt(width - 1 - index)) & 1n) === 1n) flags.add(name)
  })
  return flags
}

function asText(raw: unknown): string {
  if (Buffer.isBuffer(raw)) return raw.toString('utf8').trim()
  return String(raw || '').trim()
}

function flag(name: string, bad: boolean, problem: string): PrinterCheck {
  return { label: name, value: bad ? problem : 'OK', bad }
}

export function brotherSnapshot(values: Record<string, string | number | Buffer | null> | null, identity = '') {
  if (!values) return null
  const model = asText(values[OID_MODEL])
  if (!/MDL:[\w-]+/.test(model)) return null
  if (['mfc-8660dn', 'mfc-8860dn'].some(name => model.toLowerCase().includes(name))) return null
  const kind = kindOf(`${identity} ${model}`)
  const maintenance = kind === 'laser' ? LASER : INK
  const maintenanceBlob = values[OID_MAINTENANCE]
  const maintenanceText = Buffer.isBuffer(maintenanceBlob) && maintenanceBlob.length > 1
    ? maintenanceBlob.subarray(0, maintenanceBlob.length - 1).toString('hex')
    : ''
  const data: Record<string, number> = {}
  if (legacy(maintenanceText)) Object.assign(data, records(maintenanceBlob, maintenance, true))
  else {
    Object.assign(data, records(values[OID_COUNTERS], COUNTERS))
    Object.assign(data, records(maintenanceBlob, maintenance))
    if (kind === 'laser') Object.assign(data, records(values[OID_NEXTCARE], NEXTCARE))
  }
  let pages = data.pages
  if (pages == null && typeof values[OID_PAGES] === 'number' && values[OID_PAGES]! >= 0) pages = values[OID_PAGES] as number
  const flags = errorFlags(values[OID_ERRORS])
  const supplies: PrinterSupply[] = []
  for (const [key, name] of Object.entries(SUPPLY_NAMES)) {
    const percent = data[key]
    if (typeof percent === 'number') supplies.push({ name, percent: Math.max(0, Math.min(100, percent)) })
  }
  const reasons: string[] = []
  if (flags.has('no_paper') || flags.has('input_tray_empty')) reasons.push('Out of paper')
  else if (flags.has('low_paper')) reasons.push('Paper low')
  if (flags.has('jammed')) reasons.push('Paper jam')
  const status = PRINTER_STATUS[String(values[OID_PRINTER] || '')] || ''
  const health = DEVICE_STATUS[String(values[OID_DEVICE] || '')] || ''
  const checks: PrinterCheck[] = []
  if (status) checks.push({ label: 'Status', value: status, bad: false })
  if (health) checks.push({ label: 'Health', value: health, bad: health === 'Warning' || health === 'Down' })
  if (Buffer.isBuffer(values[OID_ERRORS])) {
    checks.push(flag('Door', flags.has('door_open'), 'Open'))
    if (kind === 'laser') {
      checks.push(flag('Low toner', flags.has('low_toner'), 'Low'))
      checks.push(flag('No toner', flags.has('no_toner'), 'Empty'))
    }
    else {
      checks.push(flag('Low ink', flags.has('low_toner'), 'Low'))
      checks.push(flag('No ink', flags.has('no_toner'), 'Empty'))
    }
    checks.push(flag('No paper', flags.has('no_paper') || flags.has('input_tray_empty'), 'Empty'))
    checks.push(flag('Paper jam', flags.has('jammed'), 'Jam'))
  }
  if (typeof data.drum_pages === 'number') checks.push({ label: 'Drum pages', value: data.drum_pages.toLocaleString(), bad: false })
  if (typeof data.drum_pages_left === 'number') checks.push({ label: 'Drum pages left', value: data.drum_pages_left.toLocaleString(), bad: false })
  return {
    state: status,
    health,
    pages: pages ?? null,
    serial: asText(values[OID_SERIAL]).slice(0, 40),
    supplies,
    reasons,
    checks,
  }
}

export async function brotherReadings(host: string, identity = '') {
  const community = (process.env.SNMP_COMMUNITY || 'public').trim() || 'public'
  const target = String(host || '').trim()
  if (!target) return null
  const port = Number(process.env.SNMP_PORT || 161) || 161
  const values = await snmpGet(target, ASK, community, port)
  if (!values) return null
  return brotherSnapshot(values, identity)
}
