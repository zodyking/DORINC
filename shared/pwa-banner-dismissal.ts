export const PWA_BANNER_DISMISSED_KEY = 'dorinc-pwa-banner-dismissed'

type SessionStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function readBannerDismissed(session: SessionStore | null | undefined): boolean {
  return session?.getItem(PWA_BANNER_DISMISSED_KEY) === '1'
}

export function writeBannerDismissed(session: SessionStore | null | undefined): void {
  session?.setItem(PWA_BANNER_DISMISSED_KEY, '1')
}

export function clearBannerDismissed(session: SessionStore | null | undefined): void {
  session?.removeItem(PWA_BANNER_DISMISSED_KEY)
}
