export type PrintTarget = { queue: string, label: string }

export type SendToPrinterBody = {
  kind: 'invoice' | 'service-log-sheet'
  queue: string
  invoiceIds?: string[]
  copies?: number
  sides?: string
}

/** Shop printers the signed-in user can send app documents to. */
export function usePrintTargets() {
  const auth = useAuthStore()
  const targets = useState<PrintTarget[]>('print-targets', () => [])
  const loadedAt = useState<number>('print-targets-loaded-at', () => 0)
  const canSend = computed(() => auth.loaded && auth.can('printers.print.all'))

  async function load(force = false) {
    if (!canSend.value) {
      targets.value = []
      return
    }
    if (!force && loadedAt.value && Date.now() - loadedAt.value < 60_000) return
    try {
      const res = await $fetch<{ printers: PrintTarget[] }>('/api/printers/targets')
      targets.value = res.printers
      loadedAt.value = Date.now()
    }
    catch {
      targets.value = []
    }
  }

  async function send(body: SendToPrinterBody) {
    return $fetch<{ ok: true, jobId: string, filename: string }>('/api/printers/send', {
      method: 'POST',
      body,
    })
  }

  onMounted(() => { void load() })
  watch(canSend, (ok) => { if (ok) void load(true) })

  return { targets, canSend, load, send }
}
