import { PrintEngineUnavailable } from './errors'
import { engineJson } from './engine'

type EnginePrinter = {
  queue: string
  label: string
  image: Record<string, unknown> & { version?: string, candidates?: Array<{ kind: string, id: string }> }
  [key: string]: unknown
}

type EngineState = {
  printers: EnginePrinter[]
  settings: Record<string, unknown>
  events: unknown[]
  [key: string]: unknown
}

const VIEWER_SETTINGS = ['max_mb', 'max_pages', 'default_queue', 'default_sides']

function emptyState(page: string, message: string) {
  return {
    engine: { ok: false, message },
    page,
    ready: false,
    boot: '',
    printers: [],
    setups: [],
    jobs: [],
    counts: { total: 0, errors: 0, submitted: 0, pending: 0, printers: 0 },
    mail: { state: 'Unavailable', detail: '', checked: null },
    events: [],
    tail: { installed: true, online: false, state: 'Unavailable', detail: '' },
    active_jobs: { ok: true, lines: [], error: '' },
    cups: { ok: true, lines: [], error: '' },
    settings: {},
    allowed: [],
  }
}

/**
 * Everything the Print page or Control Panel shows, read from the print engine.
 * A stopped engine is a calm empty page with a notice, not a failed request.
 */
export async function printersPage(page: string, canManage: boolean) {
  let state: EngineState
  try {
    state = await engineJson<EngineState>('/api/state', { query: { page }, timeoutMs: 20_000 })
  }
  catch (err) {
    if (err instanceof PrintEngineUnavailable) return emptyState(page, err.message)
    throw err
  }
  for (const printer of state.printers) {
    const queue = encodeURIComponent(printer.queue)
    printer.image = {
      ...printer.image,
      url: `/api/printers/${queue}/image?v=${encodeURIComponent(String(printer.image?.version || ''))}`,
      candidates: (printer.image?.candidates || []).map(item => ({
        ...item,
        url: `/api/printers/candidates/${encodeURIComponent(item.kind)}/${encodeURIComponent(item.id)}`,
      })),
    }
  }
  if (!canManage) {
    // Mailbox, PIN, and sender rules are for people who manage printers.
    state.settings = Object.fromEntries(
      Object.entries(state.settings || {}).filter(([key]) => VIEWER_SETTINGS.includes(key)),
    )
    state.events = []
  }
  return { engine: { ok: true, message: '' }, ...state }
}

export async function printTargets(): Promise<Array<{ queue: string, label: string }>> {
  try {
    const res = await engineJson<{ printers: Array<{ queue: string, label: string, ready: boolean }> }>('/api/targets', { timeoutMs: 8_000 })
    // A printer that has not answered yet has no driver to print with.
    return res.printers.filter(item => item.ready).map(item => ({ queue: item.queue, label: item.label }))
  }
  catch {
    return []
  }
}
