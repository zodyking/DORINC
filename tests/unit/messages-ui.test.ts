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

  it('hides duplicate top channel switcher on desktop when sidebar is visible', () => {
    const css = source('app/assets/css/ledger.css')
    expect(css).toContain('.dm-page:has(.dm-sidebar) .dm-channel-switcher-bar')
    expect(css).toContain('display:none')
  })

  it('hides duplicate top channel switcher on mobile list when sidebar is visible', () => {
    const css = source('app/assets/css/ledger.css')
    expect(css).toContain('.dm-page:not(.dm-page--in-thread) .dm-channel-switcher-bar')
    expect(css).toMatch(/max-width:960px[\s\S]*\.dm-page:not\(\.dm-page--in-thread\) \.dm-channel-switcher-bar[\s\S]*display:none/)
  })

  it('lets the desktop message layout fill viewport height', () => {
    const css = source('app/assets/css/ledger.css')
    expect(css).toMatch(/min-width:961px[\s\S]*\.dm-layout\{[\s\S]*max-height:none/)
  })

  it('lets the thread message list scroll internally instead of growing', () => {
    const css = source('app/assets/css/ledger.css')
    // The scrollable message list must be able to shrink (min-height:0) so a
    // tall email scrolls inside the panel rather than expanding the container.
    expect(css).toMatch(/\.dm-thread-msgs\{[^}]*min-height:0/)
  })

  it('uses a single compose placeholder overlay for team chat', () => {
    const composer = source('app/components/messaging/MessageComposer.vue')
    const css = source('app/assets/css/ledger.css')

    expect(composer).toContain('dm-compose-placeholder')
    expect(composer).not.toContain('data-placeholder')
    expect(css).not.toContain('dm-compose-editor:empty::before')
  })
})
