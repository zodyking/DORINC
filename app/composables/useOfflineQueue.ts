export interface OfflineQueueItem {
  id: string
  method: string
  url: string
  body?: unknown
  queuedAt: string
}

const STORAGE_KEY = 'dorinc-offline-queue-stub'

function readQueue(): OfflineQueueItem[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as OfflineQueueItem[]
    return Array.isArray(parsed) ? parsed : []
  }
  catch {
    return []
  }
}

function writeQueue(items: OfflineQueueItem[]) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function offlineQueueCount(): number {
  return readQueue().length
}

export function enqueueOfflineAction(input: Omit<OfflineQueueItem, 'id' | 'queuedAt'>) {
  const items = readQueue()
  items.push({
    ...input,
    id: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
  })
  writeQueue(items)
  return items.length
}

export function clearOfflineQueue() {
  writeQueue([])
}

export function useOfflineQueue() {
  const online = ref(true)
  const queueCount = ref(0)

  function refreshCount() {
    queueCount.value = offlineQueueCount()
  }

  function queueAction(input: Omit<OfflineQueueItem, 'id' | 'queuedAt'>) {
    const count = enqueueOfflineAction(input)
    queueCount.value = count
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'QUEUE_OFFLINE_ACTION',
        payload: input,
      })
    }
    return count
  }

  onMounted(() => {
    online.value = navigator.onLine
    refreshCount()

    window.addEventListener('online', () => { online.value = true })
    window.addEventListener('offline', () => { online.value = false })
  })

  return { online, queueCount, queueAction, refreshCount, clearOfflineQueue }
}
