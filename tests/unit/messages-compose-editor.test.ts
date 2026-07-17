import { describe, expect, it } from 'vitest'
import { entityRefToken } from '../../app/utils/messages-ui'
import {
  composeDisplayText,
  parseComposeSegments,
  serializeComposeSegments,
  stripCaretAnchors,
} from '../../app/utils/messages-compose-editor'

describe('messages-compose-editor', () => {
  it('parses entity tokens into labeled segments', () => {
    const token = entityRefToken({
      entityType: 'vehicle',
      entityId: '00000000-0000-0000-0000-000000000003',
      entityLabel: 'Bus #618',
    })
    const body = `Use ${token} please`
    const segments = parseComposeSegments(body)

    expect(segments).toEqual([
      { kind: 'text', value: 'Use ' },
      { kind: 'token', value: token, label: 'Bus #618' },
      { kind: 'text', value: ' please' },
    ])
    expect(serializeComposeSegments(segments)).toBe(body)
    expect(composeDisplayText(body)).toBe('Use Bus #618 please')
  })

  it('strips invisible caret anchors from serialized text', () => {
    expect(stripCaretAnchors('hello\u200Bworld\u200B')).toBe('helloworld')
  })
})
