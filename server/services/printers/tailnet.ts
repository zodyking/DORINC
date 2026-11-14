import { createHash } from 'node:crypto'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { createConnection, createServer, type Server, type Socket } from 'node:net'
import { delimiter, join } from 'node:path'
import { spawn, execFileSync, spawnSync } from 'node:child_process'
import { createSocket as createDgram } from 'node:dgram'
import { TailscaleError } from './errors'
import { printersDataDir } from './store'
import { HOSTNAME_RE, QUEUE_RE, hostnameFor } from '../../../shared/printers'

const BIN_DIRS = ['/usr/local/sbin', '/usr/local/bin', '/usr/sbin', '/usr/bin', '/sbin', '/bin']

function which(bin: string): string | null {
  const override = process.env[`DORINC_${bin.toUpperCase()}_PATH`]?.trim()
  if (override && existsSync(override)) return override
  const seen = new Set<string>()
  for (const dir of [...(process.env.PATH || '').split(delimiter), ...BIN_DIRS]) {
    if (!dir || seen.has(dir)) continue
    seen.add(dir)
    const full = join(dir, bin)
    if (existsSync(full)) return full
  }
  return null
}

const HOSTS = new Map<string, string>()
const PROCS = new Map<string, { pid: number, log: number | null }>()
const FORWARDS = new Map<string, { server: Server, host: string, port: number, proxy: number }>()
const PENDING = new Map<string, TailDevice>()
let statusCache: { at: number, value: TailStatus | null } = { at: 0, value: null }

export type TailDevice = {
  queue: string
  online: boolean
  hostname: string
  ip: string
  state: string
  detail: string
}

export type TailStatus = {
  installed: boolean
  online: boolean
  state: string
  detail: string
  hostname?: string
  ip?: string
  devices: TailDevice[]
}

function queueName(queue: string): string {
  if (!QUEUE_RE.test(queue || '')) throw new TailscaleError('Invalid printer')
  return queue
}

function dirFor(queue: string): string {
  return join(printersDataDir(), 'tailscale', queueName(queue))
}

export function socketFor(queue: string): string {
  return join(dirFor(queue), 'tailscaled.sock')
}

export function stateFor(queue: string): string {
  return join(dirFor(queue), 'tailscaled.state')
}

function installed(): boolean {
  return Boolean(which('tailscale') && which('tailscaled'))
}

function authKey(raw: string): string {
  const key = String(raw || '').replace(/\s+/g, '')
  if (!key.startsWith('tskey-auth-') || key.length < 20 || key.length > 300) {
    throw new TailscaleError('Paste a Tailscale auth key. It starts with tskey-auth-.')
  }
  return key
}

function hostnameValue(hostname: string, label: string, queue: string): string {
  const host = (hostname || '').trim() || hostnameFor(label, queue)
  if (!HOSTNAME_RE.test(host)) throw new TailscaleError('Hostname must use letters, numbers, and hyphens.')
  return host
}

function scrub(text: string, key: string): string {
  return String(text || '').replaceAll(key || '', 'auth-key').split(/\s+/).join(' ').slice(0, 180)
}

function socksPort(queue: string): number {
  try {
    const port = Number(readFileSync(join(dirFor(queue), 'socks.port'), 'utf8').trim())
    if (port >= 1024 && port <= 65535) return port
  }
  catch {
    return 0
  }
  return 0
}

export function assignProxy(queue: string, port: number): number {
  const folder = dirFor(queue)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'socks.port'), String(port))
  return port
}

function socketReady(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    const sock = createConnection(path)
    sock.destroy()
    return true
  }
  catch {
    return false
  }
}

function preferredPort(queue: string, salt: string, base: number): number {
  const digest = Number.parseInt(createHash('sha256').update(`${salt}:${queue}`).digest('hex').slice(0, 6), 16)
  return base + (digest % 1800)
}

function freePort(preferred: number): number {
  for (let offset = 0; offset < 20; offset++) {
    const port = preferred + offset
    try {
      const server = createServer()
      server.listen(port, '127.0.0.1')
      server.close()
      return port
    }
    catch {
      continue
    }
  }
  throw new TailscaleError('No local port was free for this printer')
}

function logTail(queue: string): string {
  try {
    const text = readFileSync(join(dirFor(queue), 'tailscaled.log'), 'utf8')
    const lines = text.split(/\n/).map(line => line.trim()).filter(Boolean)
    return lines.slice(-2).join(' ').slice(0, 180)
  }
  catch {
    return ''
  }
}

function runTailscale(args: string[]): { status: number, stdout: string, stderr: string } {
  const name = args[0] || 'tailscale'
  const bin = name.startsWith('/') ? name : (which(name) || name)
  try {
    const stdout = execFileSync(bin, args.slice(1), { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] })
    return { status: 0, stdout: stdout || '', stderr: '' }
  }
  catch (err) {
    const error = err as { status?: number, stdout?: string, stderr?: string, code?: string }
    if (error.code === 'ENOENT') throw new TailscaleError('Tailscale is not installed on this host.')
    if (String(err).includes('ETIMEDOUT')) throw new TailscaleError('Tailscale took too long to answer.')
    return { status: error.status || 1, stdout: error.stdout || '', stderr: error.stderr || String(err) }
  }
}

function startDaemon(queue: string): void {
  queue = queueName(queue)
  const folder = dirFor(queue)
  const sockPath = join(folder, 'tailscaled.sock')
  if (socketReady(sockPath)) return
  if (!installed()) throw new TailscaleError('Tailscale is not installed on this host.')
  mkdirSync(folder, { recursive: true })
  try { chmodSync(folder, 0o700) }
  catch { /* ignore */ }
  if (existsSync(sockPath)) {
    try { unlinkSync(sockPath) }
    catch { /* ignore */ }
  }
  const daemon = which('tailscaled')
  if (!daemon) throw new TailscaleError('Tailscale is not installed on this host.')
  const socks = freePort(preferredPort(queue, 'socks', 41000))
  writeFileSync(join(folder, 'socks.port'), String(socks))
  const logFd = openSync(join(folder, 'tailscaled.log'), 'a')
  const out = spawn(daemon, [
    '--tun=userspace-networking',
    `--state=${join(folder, 'tailscaled.state')}`,
    `--socket=${sockPath}`,
    `--socks5-server=127.0.0.1:${socks}`,
  ], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
  })
  try { closeSync(logFd) }
  catch { /* child keeps the log */ }
  out.unref()
  if (out.pid) writeFileSync(join(folder, 'tailscaled.pid'), String(out.pid))
  PROCS.set(queue, { pid: out.pid || 0, log: null })
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    if (out.exitCode != null) {
      stopDaemon(queue)
      throw new TailscaleError(logTail(queue) || 'The Tailscale device stopped while starting')
    }
    if (socketReady(sockPath)) return
    spawnSync('sleep', ['0.15'])
  }
  stopDaemon(queue)
  throw new TailscaleError(logTail(queue) || 'The Tailscale device did not start')
}

function stopDaemon(queue: string): void {
  const started = PROCS.get(queue)
  PROCS.delete(queue)
  let pid = started?.pid || 0
  if (!pid) {
    try { pid = Number(readFileSync(join(dirFor(queue), 'tailscaled.pid'), 'utf8').trim()) }
    catch { pid = 0 }
  }
  if (pid > 1) {
    try { process.kill(pid, 'SIGTERM') }
    catch { /* ignore */ }
  }
}

function exact(sock: Socket, count: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let got = 0
    const onData = (chunk: Buffer) => {
      chunks.push(chunk)
      got += chunk.length
      if (got >= count) {
        sock.off('data', onData)
        resolve(Buffer.concat(chunks).subarray(0, count))
      }
    }
    sock.on('data', onData)
    sock.once('error', reject)
    sock.once('end', () => reject(new TailscaleError('The tailnet proxy closed the connection')))
  })
}

export async function socksConnect(proxyPort: number, host: string, port: number, timeout: number): Promise<Socket> {
  const sock = await new Promise<Socket>((resolve, reject) => {
    const client = createConnection({ host: '127.0.0.1', port: proxyPort, timeout: timeout * 1000 })
    client.once('connect', () => resolve(client))
    client.once('error', reject)
    client.once('timeout', () => reject(new TailscaleError('The tailnet proxy timed out')))
  })
  try {
    sock.write(Buffer.from([0x05, 0x01, 0x00]))
    const greet = await exact(sock, 2)
    if (!greet.equals(Buffer.from([0x05, 0x00]))) throw new TailscaleError('The tailnet proxy refused the connection')
    let request: Buffer
    try {
      const parts = host.split('.').map(Number)
      if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) throw new Error('not ipv4')
      request = Buffer.concat([
        Buffer.from([0x05, 0x01, 0x00, 0x01]),
        Buffer.from(parts),
        Buffer.from([(port >> 8) & 0xff, port & 0xff]),
      ])
    }
    catch {
      const name = Buffer.from(host, 'utf8')
      if (!name.length || name.length > 255) throw new TailscaleError('That address is too long')
      request = Buffer.concat([
        Buffer.from([0x05, 0x01, 0x00, 0x03, name.length]),
        name,
        Buffer.from([(port >> 8) & 0xff, port & 0xff]),
      ])
    }
    sock.write(request)
    const head = await exact(sock, 4)
    if (head[0] !== 5 || head[1] !== 0) throw new TailscaleError('The printer was not reachable through its tailnet device')
    if (head[3] === 1) await exact(sock, 6)
    else if (head[3] === 4) await exact(sock, 18)
    else if (head[3] === 3) {
      const length = (await exact(sock, 1))[0]!
      await exact(sock, length + 2)
    }
    else throw new TailscaleError('The tailnet proxy sent an unexpected reply')
    return sock
  }
  catch (err) {
    sock.destroy()
    throw err
  }
}

function queueForHost(host: string): string {
  const bound = HOSTS.get(String(host || '').trim()) || ''
  return bound
}

export function bindHost(queue: string, host: string): void {
  queue = queueName(queue)
  host = String(host || '').trim()
  for (const [known, name] of [...HOSTS.entries()]) {
    if (name === queue && known !== host) HOSTS.delete(known)
  }
  if (host) HOSTS.set(host, queue)
}

export function proxyFor(host: string): number {
  const queue = queueForHost(host)
  if (!queue) return 0
  return socksPort(queue)
}

export async function openTcp(host: string, port: number, timeout: number): Promise<Socket> {
  const proxy = proxyFor(host)
  if (proxy) return socksConnect(proxy, host, port, timeout)
  return await new Promise((resolve, reject) => {
    const sock = createConnection({ host, port, timeout: timeout * 1000 })
    sock.once('connect', () => resolve(sock))
    sock.once('error', reject)
    sock.once('timeout', () => {
      sock.destroy()
      reject(new Error('timeout'))
    })
  })
}

function udpPacket(host: string, port: number, payload: Buffer): Buffer {
  try {
    const parts = host.split('.').map(Number)
    if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) throw new Error('not ipv4')
    return Buffer.concat([
      Buffer.from([0, 0, 0, 1]),
      Buffer.from(parts),
      Buffer.from([(port >> 8) & 0xff, port & 0xff]),
      payload,
    ])
  }
  catch {
    const name = Buffer.from(host, 'utf8')
    if (!name.length || name.length > 255) throw new TailscaleError('That address is too long')
    return Buffer.concat([
      Buffer.from([0, 0, 0, 3, name.length]),
      name,
      Buffer.from([(port >> 8) & 0xff, port & 0xff]),
      payload,
    ])
  }
}

function udpBody(packet: Buffer): Buffer {
  if (packet.length < 4 || packet[2] !== 0) return Buffer.alloc(0)
  const kind = packet[3]
  if (kind === 1 && packet.length >= 10) return packet.subarray(10)
  if (kind === 4 && packet.length >= 22) return packet.subarray(22)
  if (kind === 3 && packet.length >= 7) {
    const length = packet[4]!
    const start = 7 + length
    if (packet.length >= start) return packet.subarray(start)
  }
  return Buffer.alloc(0)
}

export async function udpExchange(host: string, port: number, payload: Buffer, timeout = 3): Promise<Buffer | null> {
  const proxy = proxyFor(host)
  if (!proxy) return null
  const tcp = await new Promise<Socket>((resolve, reject) => {
    const sock = createConnection({ host: '127.0.0.1', port: proxy, timeout: timeout * 1000 })
    sock.once('connect', () => resolve(sock))
    sock.once('error', reject)
  })
  try {
    tcp.write(Buffer.from([0x05, 0x01, 0x00]))
    const greet = await exact(tcp, 2)
    if (!greet.equals(Buffer.from([0x05, 0x00]))) throw new TailscaleError('The tailnet proxy refused the connection')
    tcp.write(Buffer.from([0x05, 0x03, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
    const head = await exact(tcp, 4)
    if (head[0] !== 5 || head[1] !== 0) throw new TailscaleError('The tailnet proxy does not forward UDP')
    let bindHostName = '127.0.0.1'
    let bindPort = 0
    if (head[3] === 1) {
      const raw = await exact(tcp, 6)
      bindHostName = `${raw[0]}.${raw[1]}.${raw[2]}.${raw[3]}`
      bindPort = raw.readUInt16BE(4)
    }
    else if (head[3] === 3) {
      const length = (await exact(tcp, 1))[0]!
      const raw = await exact(tcp, length + 2)
      bindHostName = raw.subarray(0, length).toString()
      bindPort = raw.readUInt16BE(length)
    }
    else {
      const raw = await exact(tcp, 18)
      bindPort = raw.readUInt16BE(16)
    }
    if (['0.0.0.0', '::', '::0'].includes(bindHostName)) bindHostName = '127.0.0.1'
    return await new Promise((resolve, reject) => {
      const udp = createDgram('udp4')
      const timer = setTimeout(() => {
        udp.close()
        resolve(Buffer.alloc(0))
      }, timeout * 1000)
      udp.once('message', (msg) => {
        clearTimeout(timer)
        udp.close()
        resolve(udpBody(msg))
      })
      udp.once('error', (err) => {
        clearTimeout(timer)
        udp.close()
        reject(err)
      })
      udp.send(udpPacket(host, port, payload), bindPort, bindHostName)
    })
  }
  finally {
    tcp.destroy()
  }
}

function stopForward(queue: string): void {
  const forward = FORWARDS.get(queue)
  FORWARDS.delete(queue)
  forward?.server.close()
}

export async function localForward(queue: string, host: string, port: number): Promise<number> {
  const proxy = socksPort(queue)
  if (!proxy) return 0
  const existing = FORWARDS.get(queue)
  if (existing && existing.host === host && existing.port === port && existing.proxy === proxy) {
    const addr = existing.server.address()
    return typeof addr === 'object' && addr ? addr.port : 0
  }
  stopForward(queue)
  const preferred = preferredPort(queue, 'fwd', 43000)
  const server = createServer((client) => {
    void (async () => {
      try {
        const remote = await socksConnect(proxy, host, port, 8)
        client.pipe(remote)
        remote.pipe(client)
        client.on('error', () => remote.destroy())
        remote.on('error', () => client.destroy())
      }
      catch {
        client.destroy()
      }
    })()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(preferred, '127.0.0.1', () => resolve())
  })
  FORWARDS.set(queue, { server, host, port, proxy })
  const addr = server.address()
  return typeof addr === 'object' && addr ? addr.port : 0
}

export function hasNode(queue: string): boolean {
  try {
    return existsSync(stateFor(queue))
  }
  catch {
    return false
  }
}

type Backend = { backend: string, health: string[], authUrl: string }

function backendState(queue: string): Backend {
  try {
    const result = runTailscale(['tailscale', '--socket', socketFor(queue), 'status', '--json'])
    const parsed = JSON.parse(result.stdout || '{}') as { BackendState?: string, Health?: string[], AuthURL?: string }
    return {
      backend: parsed.BackendState || '',
      health: (parsed.Health || []).map(item => String(item)).filter(Boolean),
      authUrl: parsed.AuthURL || '',
    }
  }
  catch {
    return { backend: '', health: [], authUrl: '' }
  }
}

export function joinFailureMessage(state: Backend, raw: string, log: string): string {
  if (state.backend === 'NeedsMachineAuth') {
    return 'Approve this device in the Tailscale admin console (Machines), or use a pre-approved auth key.'
  }
  if (state.backend === 'NeedsLogin' || state.authUrl) {
    return 'Tailscale rejected the auth key. Create a new reusable key and try again.'
  }
  const health = state.health[0] || ''
  const detail = health || log || raw
  return detail ? `Tailscale did not connect: ${detail}` : 'Tailscale did not connect'
}

function readNode(queue: string): TailDevice {
  const sock = socketFor(queue)
  const result = runTailscale(['tailscale', '--socket', sock, 'status', '--json'])
  if (result.status !== 0) {
    throw new TailscaleError(result.stderr || result.stdout || 'Tailscale status failed')
  }
  let parsed: { Self?: { Online?: boolean, HostName?: string, TailscaleIPs?: string[], DNSName?: string } }
  try { parsed = JSON.parse(result.stdout) }
  catch { parsed = {} }
  const self = parsed.Self || {}
  const ip = (self.TailscaleIPs || [])[0] || ''
  const hostname = self.HostName || String(self.DNSName || '').replace(/\.$/, '')
  return {
    queue,
    online: Boolean(self.Online),
    hostname,
    ip,
    state: self.Online ? 'Online' : 'Offline',
    detail: ip,
  }
}

export async function connectTailnet(queue: string, key: string, hostname = '', label = ''): Promise<TailDevice> {
  queue = queueName(queue)
  const auth = authKey(key)
  const host = hostnameValue(hostname, label, queue)
  if (!installed()) throw new TailscaleError('Tailscale is not installed on this host.')
  const fresh = !existsSync(stateFor(queue))
  let awaitingApproval = false
  try {
    startDaemon(queue)
    const result = runTailscale([
      'tailscale', '--socket', socketFor(queue), 'up',
      `--auth-key=${auth}`,
      `--hostname=${host}`,
      '--accept-routes',
      '--reset',
      '--timeout=45s',
    ])
    if (result.status !== 0) {
      const state = backendState(queue)
      if (state.backend === 'NeedsMachineAuth') awaitingApproval = true
      else if (state.backend !== 'Running' && state.backend !== 'Starting') {
        const raw = scrub(result.stderr || result.stdout || '', auth)
        throw new TailscaleError(joinFailureMessage(state, raw, scrub(logTail(queue), auth)))
      }
    }
  }
  catch (err) {
    if (fresh) wipe(queue)
    throw err
  }
  let info: TailDevice
  try { info = readNode(queue) }
  catch {
    info = { queue, online: false, hostname: host, ip: '', state: 'Joined', detail: '' }
  }
  if (awaitingApproval) {
    info.state = 'Needs approval'
    info.detail = 'Approve this device in the Tailscale admin console.'
  }
  if (!info.hostname) info.hostname = host
  PENDING.set(queue, info)
  forgetStatus()
  return info
}

function wipe(queue: string): void {
  stopForward(queue)
  stopDaemon(queue)
  rmSync(dirFor(queue), { recursive: true, force: true })
}

export function disconnectTailnet(queue: string): void {
  queue = queueName(queue)
  try {
    if (socketReady(socketFor(queue)) && which('tailscale')) {
      runTailscale(['tailscale', '--socket', socketFor(queue), 'logout'])
    }
  }
  catch { /* ignore */ }
  wipe(queue)
  for (const [host, name] of [...HOSTS.entries()]) {
    if (name === queue) HOSTS.delete(host)
  }
  PENDING.delete(queue)
  forgetStatus()
}

export function resumeTailnet(rows: Array<{ queue: string, host: string, tailHostname: string }>): void {
  if (!installed()) return
  for (const row of rows) {
    if (!row.tailHostname || !existsSync(stateFor(row.queue))) continue
    try {
      startDaemon(row.queue)
      bindHost(row.queue, row.host)
    }
    catch { continue }
  }
}

export function stopAllTailnet(): void {
  for (const queue of [...FORWARDS.keys()]) stopForward(queue)
  for (const queue of [...PROCS.keys()]) stopDaemon(queue)
}

export function deviceStatus(queue: string, stored: { hostname: string, ip: string }): TailDevice {
  const blank: TailDevice = {
    queue,
    online: false,
    hostname: stored.hostname,
    ip: stored.ip,
    state: stored.hostname ? 'Offline' : 'Not joined',
    detail: '',
  }
  try { queue = queueName(queue) }
  catch { return { ...blank, queue: '' } }
  if (!installed() || !socketReady(socketFor(queue))) return blank
  try {
    const info = readNode(queue)
    if (!info.hostname) info.hostname = stored.hostname
    return info
  }
  catch {
    return blank
  }
}

function forgetStatus(): void {
  statusCache = { at: 0, value: null }
}

export function tailnetNotice(
  printersList: Array<{ label: string, tail?: TailDevice }>,
  status: TailStatus,
): { kind: string, title: string, detail: string } | null {
  if (status.online) {
    return {
      kind: 'online',
      title: status.hostname || 'Tailscale',
      detail: status.ip || status.state || 'Connected',
    }
  }
  const missing = printersList
    .filter(printer => !(printer.tail?.online || printer.tail?.hostname))
    .map(printer => printer.label || 'A printer')
  if (!missing.length) return null
  return {
    kind: 'unset',
    title: `${missing[0]} is not set up`,
    detail: missing.length === 1 ? 'This printer has no Tailscale device' : `${missing.length} printers have no Tailscale device`,
  }
}

export function collectStatus(devices: TailDevice[]): TailStatus {
  const online = devices.filter(item => item.online)
  const haveBin = installed()
  let state = 'No devices'
  let detail = 'Add a printer, then join it as its own device.'
  if (!haveBin) {
    state = 'Not installed'
    detail = 'Tailscale is not installed on this host.'
  }
  else if (online.length) {
    state = 'Connected'
    detail = `${online.length} printer device${online.length === 1 ? '' : 's'} online.`
  }
  else if (devices.some(item => item.hostname)) {
    state = 'Offline'
    detail = 'Printer devices are signed out or unreachable.'
  }
  const first = online[0]
  return {
    installed: haveBin,
    online: online.length > 0,
    state,
    detail,
    hostname: first?.hostname,
    ip: first?.ip,
    devices,
  }
}

export function cachedStatus(devices: TailDevice[]): TailStatus {
  const now = Date.now()
  if (statusCache.value && now - statusCache.at < 8000) return { ...statusCache.value }
  const value = collectStatus(devices)
  statusCache = { at: now, value }
  return { ...value }
}

export { TailscaleError }
