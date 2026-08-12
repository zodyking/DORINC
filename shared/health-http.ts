/** Pure helper — Traefik/Docker must stay up when only workers are degraded. */
export function healthHttpOk(input: {
  database: 'ok' | 'error' | 'not_configured'
  workers?: { pdf: string, queue: string }
}): { live: boolean, ok: boolean } {
  if (input.database === 'not_configured') {
    return { live: true, ok: true }
  }
  const live = input.database === 'ok'
  const workers = input.workers
  const pipelineOk = !workers
    || (workers.pdf !== 'error' && workers.pdf !== 'unknown' && workers.queue !== 'error')
  return { live, ok: live && pipelineOk }
}
