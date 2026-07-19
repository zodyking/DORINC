import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)

function source(path: string): string {
  return readFileSync(new URL(path, root), 'utf8')
}

describe('messages UI contracts', () => {
  it('shows channel switcher when direct messaging is disabled', () => {
    const page = source('app/pages/messages/index.vue')
    expect(page).toContain('showChannelSwitcherBar')
    expect(page).toContain('v-if="showChannelSwitcherBar"')
    expect(page).toContain('dm-channel-switcher-bar')
  })

  it('uses a single compose placeholder overlay for team chat', () => {
    const composer = source('app/components/messaging/MessageComposer.vue')
    const css = source('app/assets/css/ledger.css')

    expect(composer).toContain('dm-compose-placeholder')
    expect(composer).not.toContain('data-placeholder')
    expect(css).not.toContain('dm-compose-editor:empty::before')
  })
})
