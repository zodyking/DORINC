import { bindProseField, bindProseFieldsIn, parseProseFieldMode } from '~/composables/useProseField'

export default defineNuxtPlugin((nuxtApp) => {
  let pageCleanup: (() => void) | null = null

  nuxtApp.vueApp.directive('prose-field', {
    mounted(el, binding) {
      const target = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
        ? el
        : el.querySelector('input:not([type=email]):not([type=password]):not([type=number]):not([type=date]):not([type=tel]):not([type=search]), textarea')
      if (!target || !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return

      const mode = parseProseFieldMode(binding.value)
      const cleanup = bindProseField(target, mode)
      ;(target as HTMLElement & { _proseCleanup?: () => void })._proseCleanup = cleanup
    },
    unmounted(el) {
      const target = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'
        ? el
        : el.querySelector('input, textarea')
      const cleanup = (target as HTMLElement & { _proseCleanup?: () => void })?._proseCleanup
      cleanup?.()
    },
  })

  if (import.meta.client) {
    const applyPageBindings = () => {
      pageCleanup?.()
      pageCleanup = bindProseFieldsIn(document)
    }

    nuxtApp.hook('page:finish', () => {
      nextTick(() => applyPageBindings())
    })

    nuxtApp.hook('page:start', () => {
      pageCleanup?.()
      pageCleanup = null
    })
  }
})
