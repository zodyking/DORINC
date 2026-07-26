export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed', platform: string }>
}

const PWA_INSTALLED_KEY = 'dorinc-pwa-installed'

export interface PwaInstallSharedState {
  deferredPrompt: BeforeInstallPromptEvent | null
  installed: boolean
  listeners: Set<() => void>
}

export const pwaInstallState: PwaInstallSharedState = {
  deferredPrompt: null,
  installed: false,
  listeners: new Set(),
}

export function readPwaInstalledFlag(): boolean {
  if (!import.meta.client) return false
  return localStorage.getItem(PWA_INSTALLED_KEY) === '1'
}

export function markPwaInstalledFlag(): void {
  if (!import.meta.client) return
  localStorage.setItem(PWA_INSTALLED_KEY, '1')
  pwaInstallState.installed = true
}

export function subscribePwaInstall(listener: () => void): () => void {
  pwaInstallState.listeners.add(listener)
  return () => pwaInstallState.listeners.delete(listener)
}

export function notifyPwaInstallListeners(): void {
  for (const listener of pwaInstallState.listeners) listener()
}

export function isPwaStandaloneMode(): boolean {
  if (!import.meta.client) return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

export function detectPwaDeviceKind(): 'desktop' | 'mobile' {
  if (!import.meta.client) return 'desktop'
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = window.matchMedia('(max-width: 768px)').matches
  const mobileUa = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent)
  return coarse || narrow || mobileUa ? 'mobile' : 'desktop'
}

export function isIosDevice(): boolean {
  if (!import.meta.client) return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}
