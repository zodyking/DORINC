import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PrintError } from './errors'

const execFileAsync = promisify(execFile)

export interface CupsResult {
  returncode: number
  stdout: string
  stderr: string
}

export interface CupsReport {
  ok: boolean
  available: boolean
  lines: string[]
  error: string
}

const EMPTY_CUPS: CupsReport = { ok: true, available: false, lines: [], error: '' }

let cupsPresent: boolean | null = null

function which(bin: string): string | null {
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    const full = join(dir, bin)
    if (existsSync(full)) return full
  }
  return null
}

/** CUPS CLI tools are optional. Cloud hosts print over IPP / port 9100 instead. */
export function cupsAvailable(): boolean {
  if (cupsPresent == null) cupsPresent = Boolean(which('lp') && which('lpstat'))
  return cupsPresent
}

export function resetCupsAvailableForTests(value: boolean | null = null) {
  cupsPresent = value
}

export async function cupsCmd(args: string[], timeout = 25000): Promise<CupsResult> {
  const bin = args[0]
  if (!bin) throw new PrintError('Missing command')
  try {
    const { stdout, stderr } = await execFileAsync(bin, args.slice(1), {
      timeout,
      encoding: 'utf8',
      maxBuffer: 4_000_000,
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
    })
    return { returncode: 0, stdout: stdout || '', stderr: stderr || '' }
  }
  catch (err) {
    const error = err as NodeJS.ErrnoException & { killed?: boolean, stdout?: string, stderr?: string, code?: string | number }
    if (error.code === 'ENOENT') throw new PrintError(`${bin} is not installed or not on PATH`)
    if (error.killed) throw new PrintError(`${bin} timed out`)
    const code = typeof error.code === 'number' ? error.code : 1
    return {
      returncode: code,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || '',
    }
  }
}

export function interpretLpstat(result: CupsResult): CupsReport {
  const lines = (result.stdout || '').split(/\n/).map(ln => ln.trim()).filter(Boolean).slice(0, 40)
  const err = (result.stderr || '').trim()
  if (result.returncode === 0) return { ok: true, available: true, lines, error: '' }
  const low = err.toLowerCase()
  if (low.includes('no destinations added') || low.includes('no active jobs') || low.includes('no entries')) {
    return { ok: true, available: true, lines: [], error: '' }
  }
  return { ok: false, available: true, lines: [], error: (err || (result.stdout || '').trim() || 'lpstat failed').slice(0, 200) }
}

export async function activeCupsJobs(): Promise<CupsReport> {
  if (!cupsAvailable()) return { ...EMPTY_CUPS }
  try {
    return interpretLpstat(await cupsCmd(['lpstat', '-o'], 10000))
  }
  catch (err) {
    const message = String(err instanceof Error ? err.message : err)
    if (/not installed|not on PATH/i.test(message)) {
      cupsPresent = false
      return { ...EMPTY_CUPS }
    }
    return { ok: false, available: true, lines: [], error: message.slice(0, 200) }
  }
}

export async function cupsPrintersReport(): Promise<CupsReport> {
  if (!cupsAvailable()) return { ...EMPTY_CUPS }
  try {
    return interpretLpstat(await cupsCmd(['lpstat', '-p'], 10000))
  }
  catch (err) {
    const message = String(err instanceof Error ? err.message : err)
    if (/not installed|not on PATH/i.test(message)) {
      cupsPresent = false
      return { ...EMPTY_CUPS }
    }
    return { ok: false, available: true, lines: [], error: message.slice(0, 200) }
  }
}
