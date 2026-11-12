import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PrintError } from './errors'

const execFileAsync = promisify(execFile)

export interface CupsResult {
  returncode: number
  stdout: string
  stderr: string
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

export function interpretLpstat(result: CupsResult): { ok: boolean, lines: string[], error: string } {
  const lines = (result.stdout || '').split(/\n/).map(ln => ln.trim()).filter(Boolean).slice(0, 40)
  const err = (result.stderr || '').trim()
  if (result.returncode === 0) return { ok: true, lines, error: '' }
  const low = err.toLowerCase()
  if (low.includes('no destinations added') || low.includes('no active jobs') || low.includes('no entries')) {
    return { ok: true, lines: [], error: '' }
  }
  return { ok: false, lines: [], error: (err || (result.stdout || '').trim() || 'lpstat failed').slice(0, 200) }
}

export async function activeCupsJobs() {
  try {
    return interpretLpstat(await cupsCmd(['lpstat', '-o'], 10000))
  }
  catch (err) {
    return { ok: false, lines: [] as string[], error: String(err instanceof Error ? err.message : err).slice(0, 200) }
  }
}

export async function cupsPrintersReport() {
  try {
    return interpretLpstat(await cupsCmd(['lpstat', '-p'], 10000))
  }
  catch (err) {
    return { ok: false, lines: [] as string[], error: String(err instanceof Error ? err.message : err).slice(0, 200) }
  }
}
