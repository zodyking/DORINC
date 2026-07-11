const SW_VERSION = 'v2'

export default defineNuxtPlugin(() => {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`/sw.js?${SW_VERSION}`)
      .then((registration) => {
        void registration.update()
      })
      .catch(() => {
        // Registration failure must not block the app shell.
      })
  })
})
