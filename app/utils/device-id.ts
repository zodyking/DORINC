import {
  DEVICE_ID_COOKIE,
  DEVICE_ID_IDB_KEY,
  DEVICE_ID_IDB_NAME,
  DEVICE_ID_IDB_STORE,
  DEVICE_ID_MAX_AGE_SEC,
  DEVICE_ID_STORAGE_KEY,
  createDeviceId,
  normalizeDeviceId,
} from '#shared/device-id'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const parts = document.cookie.split(';')
  for (const part of parts) {
    const [rawKey, ...rest] = part.trim().split('=')
    if (rawKey !== name) continue
    return decodeURIComponent(rest.join('='))
  }
  return null
}

function writeCookie(id: string): void {
  if (typeof document === 'undefined') return
  const secure = typeof location !== 'undefined' && location.protocol === 'https:'
  const attrs = [
    `${DEVICE_ID_COOKIE}=${encodeURIComponent(id)}`,
    'Path=/',
    `Max-Age=${DEVICE_ID_MAX_AGE_SEC}`,
    'SameSite=Lax',
  ]
  if (secure) attrs.push('Secure')
  document.cookie = attrs.join('; ')
}

function readLocalStorage(): string | null {
  try {
    return normalizeDeviceId(localStorage.getItem(DEVICE_ID_STORAGE_KEY))
  }
  catch {
    return null
  }
}

function writeLocalStorage(id: string): void {
  try {
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id)
  }
  catch {
    // Private mode / quota — ignore.
  }
}

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DEVICE_ID_IDB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(DEVICE_ID_IDB_STORE)) {
          db.createObjectStore(DEVICE_ID_IDB_STORE)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    }
    catch {
      resolve(null)
    }
  })
}

async function readIndexedDb(): Promise<string | null> {
  const db = await openIdb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DEVICE_ID_IDB_STORE, 'readonly')
      const store = tx.objectStore(DEVICE_ID_IDB_STORE)
      const req = store.get(DEVICE_ID_IDB_KEY)
      req.onsuccess = () => {
        resolve(normalizeDeviceId(req.result))
        db.close()
      }
      req.onerror = () => {
        resolve(null)
        db.close()
      }
    }
    catch {
      resolve(null)
      try { db.close() }
      catch { /* ignore */ }
    }
  })
}

async function writeIndexedDb(id: string): Promise<void> {
  const db = await openIdb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(DEVICE_ID_IDB_STORE, 'readwrite')
      tx.objectStore(DEVICE_ID_IDB_STORE).put(id, DEVICE_ID_IDB_KEY)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        resolve()
      }
    }
    catch {
      try { db.close() }
      catch { /* ignore */ }
      resolve()
    }
  })
}

function persistAll(id: string): void {
  writeCookie(id)
  writeLocalStorage(id)
  void writeIndexedDb(id)
}

/**
 * Return the stable first-party device id, creating and persisting one when missing.
 * Preference order when values disagree: localStorage → IndexedDB → cookie → new UUID
 * (storage backups survive cookie clears better than the reverse).
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const fromStorage = readLocalStorage()
  const fromCookie = normalizeDeviceId(readCookie(DEVICE_ID_COOKIE))
  const fromIdb = await readIndexedDb()

  const id = fromStorage ?? fromIdb ?? fromCookie ?? createDeviceId()
  persistAll(id)
  return id
}

/** Synchronous best-effort read (cookie / localStorage only). */
export function peekDeviceId(): string | null {
  return readLocalStorage() ?? normalizeDeviceId(readCookie(DEVICE_ID_COOKIE))
}
