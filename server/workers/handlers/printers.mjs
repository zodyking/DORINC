function appBaseUrl() {
  return (process.env.APP_URL || process.env.NUXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000')
    .trim()
    .replace(/\/$/, '')
}

function workerToken() {
  return (process.env.INTERNAL_WORKER_TOKEN || process.env.ENCRYPTION_MASTER_KEY || '').trim()
}

/**
 * Drain shop printer queues and poll email-to-print via the Nitro TS engine.
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string }>}
 */
export async function processPrintersTick() {
  const token = workerToken()
  if (!token) return { ok: false, skipped: true, error: 'worker token missing' }
  const url = `${appBaseUrl()}/api/internal/printers/tick`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-worker-token': token, 'content-type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `HTTP ${res.status} ${text.slice(0, 180)}` }
    }
    return { ok: true }
  }
  catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
