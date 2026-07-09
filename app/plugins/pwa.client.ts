export default defineNuxtPlugin(() => {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failure must not block the app shell.
    })
  })
})
