import type { Pool } from 'pg'
// @ts-expect-error plain-JS worker handler has no type declarations
import { processPdfRenderJobById } from '../../server/workers/handlers/pdf-render.mjs'

/** Poll pdf-worker until a specific queued job reaches `done` (or `failed`). */
export async function waitForPdfJobDone(pool: Pool, jobId: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const { rows } = await pool.query<{ status: string, last_error: string | null }>(
      'SELECT status, last_error FROM pdf_render_jobs WHERE id = $1',
      [jobId],
    )
    const row = rows[0]
    if (row?.status === 'done') return
    if (row?.status === 'failed') {
      throw new Error(`PDF job ${jobId} failed: ${row.last_error ?? 'unknown'}`)
    }

    await processPdfRenderJobById(pool, jobId)
  }

  throw new Error(`PDF job ${jobId} did not complete within ${timeoutMs}ms`)
}
