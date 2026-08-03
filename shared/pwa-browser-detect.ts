export type PwaBrowser =
  | 'ios-safari'
  | 'ios-chrome'
  | 'ios-edge'
  | 'ios-firefox'
  | 'ios-other'
  | 'android-chrome'
  | 'android-edge'
  | 'android-samsung'
  | 'android-firefox'
  | 'android-other'
  | 'desktop-chrome'
  | 'desktop-edge'
  | 'desktop-safari'
  | 'desktop-firefox'
  | 'desktop-other'

export function detectPwaBrowser(userAgent = ''): PwaBrowser {
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '')

  const isIos = /iphone|ipad|ipod/i.test(ua)
  const isAndroid = /android/i.test(ua)

  if (isIos) {
    if (/CriOS/i.test(ua)) return 'ios-chrome'
    if (/EdgiOS/i.test(ua)) return 'ios-edge'
    if (/FxiOS/i.test(ua)) return 'ios-firefox'
    if (/Safari/i.test(ua)) return 'ios-safari'
    return 'ios-other'
  }

  if (isAndroid) {
    if (/SamsungBrowser/i.test(ua)) return 'android-samsung'
    if (/EdgA/i.test(ua)) return 'android-edge'
    if (/Firefox/i.test(ua)) return 'android-firefox'
    if (/Chrome/i.test(ua)) return 'android-chrome'
    return 'android-other'
  }

  if (/Edg\//i.test(ua)) return 'desktop-edge'
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return 'desktop-chrome'
  if (/Firefox/i.test(ua)) return 'desktop-firefox'
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'desktop-safari'
  return 'desktop-other'
}

export function isIosBrowser(browser: PwaBrowser): boolean {
  return browser.startsWith('ios-')
}
