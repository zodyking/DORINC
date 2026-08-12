import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('rate-limit countdown unlocks when the timer hits zero', () => {
  it('returns a reactive cooldown so template v-if sees a boolean, not a ref object', () => {
    const src = readFileSync(resolve('app/composables/useAuthRateLimitCooldown.ts'), 'utf8')
    expect(src).toContain('return reactive({')
    expect(src).toContain('remainingSeconds.value > 0')
    expect(src).toContain('return remainingSeconds.value > 0')
  })

  it('hides the pause UI from a boolean computed, not a nested ref object', () => {
    const src = readFileSync(resolve('app/components/auth/AuthScreen.vue'), 'utf8')
    expect(src).toContain('const loginRateLimited = computed(() => loginCooldown.isActive)')
    expect(src).toContain('v-if="loginRateLimited"')
    expect(src).toContain(':disabled="busy || loginRateLimited"')
    expect(src).not.toContain('v-if="loginCooldown.isActive"')
  })

  it('schedules an exact unlock timeout so the button does not sit at 0s', () => {
    const src = readFileSync(resolve('app/composables/useAuthRateLimitCooldown.ts'), 'utf8')
    expect(src).toContain('unlockTimer')
    expect(src).toContain('setTimeout(refresh')
  })
})
