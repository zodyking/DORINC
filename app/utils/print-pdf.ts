/**
 * Open the browser print dialog for a PDF blob (no in-app preview popup).
 * Uses a temporary hidden iframe so popup blockers do not interfere.
 */
export async function printPdfBlob(blob: Blob): Promise<void> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new Error('Printing is only available in the browser')
  }
  if (!(blob instanceof Blob) || blob.size < 1) {
    throw new Error('Nothing to print')
  }

  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('title', 'Print')
  iframe.style.cssText = [
    'position:fixed',
    'right:0',
    'bottom:0',
    'width:0',
    'height:0',
    'border:0',
    'opacity:0',
    'pointer-events:none',
  ].join(';')

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    iframe.remove()
    URL.revokeObjectURL(url)
  }

  await new Promise<void>((resolve, reject) => {
    iframe.onload = () => {
      const win = iframe.contentWindow
      if (!win) {
        cleanup()
        reject(new Error('Could not open print dialog'))
        return
      }

      const onAfterPrint = () => {
        win.removeEventListener('afterprint', onAfterPrint)
        cleanup()
      }
      win.addEventListener('afterprint', onAfterPrint)
      window.setTimeout(() => {
        win.removeEventListener('afterprint', onAfterPrint)
        cleanup()
      }, 60_000)

      // Give the browser PDF viewer a tick before print().
      window.setTimeout(() => {
        try {
          win.focus()
          win.print()
          resolve()
        }
        catch (e) {
          win.removeEventListener('afterprint', onAfterPrint)
          cleanup()
          reject(e instanceof Error ? e : new Error('Could not open print dialog'))
        }
      }, 250)
    }

    iframe.onerror = () => {
      cleanup()
      reject(new Error('Could not load PDF for printing'))
    }

    document.body.appendChild(iframe)
    iframe.src = url
  })
}
