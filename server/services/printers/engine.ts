import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { H3Event } from 'h3'
import { apiError } from '../../utils/api-error'
import { PrintEngineUnavailable, PrintError } from './errors'

/**
 * Client for the print engine container (PrintHarbor: CUPS, drivers, one
 * Tailscale device per printer, email-to-print). DORINC owns sign-in and
 * permissions; the engine trusts one bearer token shared through the data volume.
 */

const TOKEN_TTL_MS = 60_000
let cachedToken = { value: '', at: 0 }

export function engineUrl(): string {
  return (process.env.PRINT_ENGINE_URL || 'http://dorinc-print-engine:47831').trim().replace(/\/+$/, '')
}

function tokenFile(): string {
  const explicit = (process.env.PRINT_ENGINE_TOKEN_FILE || '').trim()
  if (explicit) return explicit
  return join(process.env.DORINC_DATA_DIR || join(process.cwd(), '.data'), 'printharbor', 'api-token')
}

async function engineToken(fresh = false): Promise<string> {
  const fromEnv = (process.env.PRINT_ENGINE_TOKEN || '').trim()
  if (fromEnv) return fromEnv
  if (!fresh && cachedToken.value && Date.now() - cachedToken.at < TOKEN_TTL_MS) return cachedToken.value
  const value = await readFile(tokenFile(), 'utf8').then(text => text.trim(), () => '')
  cachedToken = { value, at: Date.now() }
  return value
}

export type EngineRequest = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, string | number | undefined>
  json?: unknown
  form?: FormData
  timeoutMs?: number
}

async function send(path: string, opts: EngineRequest, retry: boolean): Promise<Response> {
  const token = await engineToken(retry)
  if (!token) throw new PrintEngineUnavailable()
  const url = new URL(engineUrl() + path)
  for (const [key, value] of Object.entries(opts.query || {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  const headers: Record<string, string> = { authorization: `Bearer ${token}` }
  let body: BodyInit | undefined
  if (opts.form) body = opts.form
  else if (opts.json !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(opts.json)
  }
  let res: Response
  try {
    res = await fetch(url, {
      method: opts.method || 'GET',
      headers,
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    })
  }
  catch (err) {
    const name = err instanceof Error ? err.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new PrintEngineUnavailable('The print service took too long to answer. Try again in a moment.')
    }
    throw new PrintEngineUnavailable()
  }
  // The engine writes its token on first boot; a stale cached value gets one fresh read.
  if (res.status === 401 && !retry) return send(path, opts, true)
  return res
}

async function failure(res: Response): Promise<PrintError> {
  if (res.status === 401) return new PrintEngineUnavailable('The print service did not accept this app. Redeploy both containers together.')
  const data = await res.json().catch(() => ({})) as { message?: string, detail?: unknown }
  const message = String(data.message || (typeof data.detail === 'string' ? data.detail : '') || '')
  if (res.status >= 500) return new PrintEngineUnavailable(message || 'The print service had a problem. Try again in a moment.')
  return new PrintError(message || 'The print service could not do that', res.status === 404 ? 404 : res.status === 409 ? 409 : 422)
}

export async function engineJson<T>(path: string, opts: EngineRequest = {}): Promise<T> {
  const res = await send(path, opts, false)
  if (!res.ok) throw await failure(res)
  return await res.json() as T
}

export type EngineFile = { data: Buffer, contentType: string, cacheControl: string, pending: boolean }

export async function engineFile(path: string): Promise<EngineFile> {
  const res = await send(path, {}, false)
  if (!res.ok) throw await failure(res)
  return {
    data: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') || 'application/octet-stream',
    cacheControl: res.headers.get('cache-control') || 'private, no-cache',
    pending: res.headers.get('x-image-pending') === '1',
  }
}

/** Turn an engine failure into the standard API error body. */
export function printApiError(event: H3Event, err: unknown, fallback: string) {
  if (err instanceof PrintEngineUnavailable) return apiError(event, 'SERVICE_UNAVAILABLE', err.message)
  if (err instanceof PrintError) {
    if (err.status === 404) return apiError(event, 'NOT_FOUND', err.message)
    if (err.status === 409) return apiError(event, 'CONFLICT', err.message)
    return apiError(event, 'VALIDATION_ERROR', err.message)
  }
  return apiError(event, 'INTERNAL_ERROR', err instanceof Error && err.message ? err.message : fallback)
}

export type SubmitPrint = {
  filename: string
  data: Buffer
  queue: string
  copies?: number
  sides?: string
  source?: string
  sender?: string
  contentType?: string
}

/** Queue a document on a shop printer. The engine converts, holds, and sends it. */
export async function submitPrint(opts: SubmitPrint): Promise<number> {
  const form = new FormData()
  form.append('printer', opts.queue)
  form.append('sides', opts.sides || 'one-sided')
  form.append('copies', String(opts.copies ?? 1))
  form.append('source', opts.source || 'upload')
  form.append('sender', opts.sender || '')
  form.append('file', new Blob([new Uint8Array(opts.data)], { type: opts.contentType || 'application/octet-stream' }), opts.filename)
  const res = await engineJson<{ id: number }>('/api/jobs', { method: 'POST', form, timeoutMs: 90_000 })
  return res.id
}
