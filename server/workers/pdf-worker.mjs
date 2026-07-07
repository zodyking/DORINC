// DORINC pdf-worker — renders official PDFs with Playwright Chromium.
// Render pipeline (pdf_render_jobs polling) lands in P1-28.
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 3000)

console.log(`[pdf-worker] started (poll ${POLL_MS}ms)`)  

async function tick() {
  // pdf_render_jobs polling registered in P1-28.
}

async function main() {
  for (;;) {
    try {
      await tick()
    }
    catch (err) {
      console.error('[pdf-worker] tick failed', err)  
    }
    await new Promise(resolve => setTimeout(resolve, POLL_MS))
  }
}

main()
