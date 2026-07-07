// DORINC general worker — polls job tables (mail, thumbnails, AI, backups).
// Job handlers are wired in as each phase lands (P1-14 thumbnails, P2-02 mail, ...).
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 5000)

console.log(`[worker] general worker started (poll ${POLL_MS}ms)`)  

async function tick() {
  // Handlers registered by later phases run here.
}

async function main() {
  for (;;) {
    try {
      await tick()
    }
    catch (err) {
      console.error('[worker] tick failed', err)  
    }
    await new Promise(resolve => setTimeout(resolve, POLL_MS))
  }
}

main()
