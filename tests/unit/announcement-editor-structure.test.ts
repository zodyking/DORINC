import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('announcement editor structure', () => {
  it('does not wrap the rich body editor in a label (avoids Undo stealing subtitle keystrokes)', () => {
    const source = readFileSync(
      resolve(__dirname, '../../app/components/admin/AnnouncementEditorWorkbench.vue'),
      'utf8',
    )

    // The Body field must be a div, not a label — label click activates the first
    // toolbar button (Undo) and deletes characters from Title/Subtitle.
    expect(source).toMatch(/<div class="fld ann-fld">\s*<span>Body<\/span>\s*<AnnouncementRichEditor/)
    expect(source).not.toMatch(/<label class="fld">\s*<span>Body<\/span>\s*<AnnouncementRichEditor/)
  })

  it('uses icon toolbar controls instead of text-only formatting buttons', () => {
    const source = readFileSync(
      resolve(__dirname, '../../app/components/admin/AnnouncementRichEditor.vue'),
      'utf8',
    )
    expect(source).toContain('class="rte-toolbar"')
    expect(source).toContain('class="rte-btn"')
    expect(source).toContain('aria-label="Bold"')
    expect(source).not.toContain('>Undo</button>')
    expect(source).not.toContain('>• List</button>')
  })
})
