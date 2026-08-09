import { afterEach, describe, expect, it, vi } from 'vitest'
import { printPdfBlob } from '../../app/utils/print-pdf'

describe('printPdfBlob', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('rejects when not in a browser', async () => {
    await expect(printPdfBlob(new Blob(['%PDF']))).rejects.toThrow(/browser/i)
  })

  it('rejects empty blobs in the browser', async () => {
    vi.stubGlobal('document', { createElement: vi.fn(), body: { appendChild: vi.fn() } })
    vi.stubGlobal('window', { setTimeout, clearTimeout })
    await expect(printPdfBlob(new Blob([]))).rejects.toThrow(/nothing to print/i)
  })

  it('loads the PDF into a hidden iframe and calls print()', async () => {
    const print = vi.fn()
    const focus = vi.fn()
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const remove = vi.fn()
    const appendChild = vi.fn((node: { onload?: ((ev: Event) => void) | null }) => {
      queueMicrotask(() => node.onload?.(new Event('load')))
      return node
    })

    const iframe = {
      setAttribute: vi.fn(),
      style: { cssText: '' },
      remove,
      onload: null as null | ((ev: Event) => void),
      onerror: null as null | (() => void),
      src: '',
      contentWindow: {
        print,
        focus,
        addEventListener,
        removeEventListener,
      },
    }

    vi.stubGlobal('document', {
      createElement: vi.fn(() => iframe),
      body: { appendChild },
    })
    vi.stubGlobal('window', {
      setTimeout,
      clearTimeout,
    })

    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:print-test')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    vi.useFakeTimers()
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    const pending = printPdfBlob(blob)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(300)
    await pending

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(appendChild).toHaveBeenCalled()
    expect(focus).toHaveBeenCalled()
    expect(print).toHaveBeenCalled()
    expect(addEventListener).toHaveBeenCalledWith('afterprint', expect.any(Function))

    const afterPrint = addEventListener.mock.calls.find(c => c[0] === 'afterprint')?.[1] as (() => void) | undefined
    afterPrint?.()
    expect(remove).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:print-test')
  })
})
