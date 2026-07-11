import { authErrorMessage } from '~/utils/auth-errors'

export function useResendVerification() {
  const busy = ref(false)
  const message = ref('')
  const error = ref('')

  async function resend(email: string, password: string) {
    busy.value = true
    message.value = ''
    error.value = ''
    try {
      const res = await $fetch<{ message: string }>('/api/auth/resend-verification', {
        method: 'POST',
        body: { email, password },
      })
      message.value = res.message
      return true
    }
    catch (err) {
      error.value = authErrorMessage(err, 'Could not send verification email')
      return false
    }
    finally {
      busy.value = false
    }
  }

  function reset() {
    busy.value = false
    message.value = ''
    error.value = ''
  }

  return { busy, message, error, resend, reset }
}
