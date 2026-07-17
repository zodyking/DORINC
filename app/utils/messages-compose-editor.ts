import { ENTITY_REF_TOKEN_RE } from './messages-ui'

export interface ComposeSegment {
  kind: 'text' | 'token'
  value: string
  label?: string
}

/** Split stored message text into plain text and entity-token segments. */
export function parseComposeSegments(body: string): ComposeSegment[] {
  if (!body) return []
  const result: ComposeSegment[] = []
  const re = new RegExp(ENTITY_REF_TOKEN_RE.source, 'gi')
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(body)) !== null) {
    if (match.index > lastIndex) {
      result.push({ kind: 'text', value: body.slice(lastIndex, match.index) })
    }
    result.push({ kind: 'token', value: match[0], label: match[3]! })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < body.length) {
    result.push({ kind: 'text', value: body.slice(lastIndex) })
  }

  return result
}

/** Serialize parsed segments back to stored message text. */
export function serializeComposeSegments(segments: ComposeSegment[]): string {
  return segments.map(segment => segment.kind === 'token' ? segment.value : segment.value).join('')
}

/** Human-readable compose preview with entity labels instead of tokens. */
export function composeDisplayText(body: string): string {
  return parseComposeSegments(body)
    .map(segment => segment.kind === 'token' ? segment.label ?? segment.value : segment.value)
    .join('')
}

/** Serialize a compose editor DOM tree back to stored message text with entity tokens. */
export function serializeTokenizedRoot(root: HTMLElement): string {
  let out = ''
  for (const node of root.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? ''
      continue
    }
    if (!(node instanceof HTMLElement)) continue
    if (node.dataset.token) {
      out += node.dataset.token
      continue
    }
    if (node.tagName === 'BR') {
      out += '\n'
      continue
    }
    out += serializeTokenizedRoot(node)
  }
  return out
}

function appendTextWithBreaks(root: HTMLElement, chunk: string) {
  const lines = chunk.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line) root.appendChild(document.createTextNode(line))
    if (i < lines.length - 1) root.appendChild(document.createElement('br'))
  }
}

/** Render stored message text into chip labels inside the compose editor. */
export function renderTokenizedEditor(root: HTMLElement, body: string) {
  root.replaceChildren()
  for (const segment of parseComposeSegments(body)) {
    if (segment.kind === 'token') {
      const chip = document.createElement('span')
      chip.className = 'dm-compose-entity-chip'
      chip.contentEditable = 'false'
      chip.dataset.token = segment.value
      chip.textContent = segment.label ?? segment.value
      root.appendChild(chip)
      continue
    }
    appendTextWithBreaks(root, segment.value)
  }
}

/** Cursor offset in serialized token text (tokens count as full length). */
export function getTokenizedTextOffset(root: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel?.rangeCount) return serializeTokenizedRoot(root).length

  const range = sel.getRangeAt(0)
  if (!root.contains(range.startContainer)) {
    return serializeTokenizedRoot(root).length
  }

  let offset = 0

  const walk = (node: Node): boolean => {
    if (node === range.startContainer) {
      if (node.nodeType === Node.TEXT_NODE) offset += range.startOffset
      return true
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += (node.textContent ?? '').length
      return false
    }
    if (!(node instanceof HTMLElement)) return false
    if (node.dataset.token) {
      offset += node.dataset.token.length
      return false
    }
    if (node.tagName === 'BR') {
      offset += 1
      return false
    }
    for (const child of node.childNodes) {
      if (walk(child)) return true
    }
    return false
  }

  for (const child of root.childNodes) {
    if (walk(child)) break
  }
  return offset
}

/** Place the caret at a serialized token offset. */
export function setTokenizedTextOffset(root: HTMLElement, target: number) {
  const sel = window.getSelection()
  if (!sel) return

  let offset = 0

  const place = (node: Node, nodeOffset: number) => {
    const range = document.createRange()
    range.setStart(node, nodeOffset)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent ?? '').length
      if (offset + len >= target) {
        place(node, target - offset)
        return true
      }
      offset += len
      return false
    }
    if (!(node instanceof HTMLElement)) return false
    if (node.dataset.token) {
      const len = node.dataset.token.length
      if (offset + len >= target) {
        const range = document.createRange()
        range.setStartAfter(node)
        range.collapse(true)
        sel.removeAllRanges()
        sel.addRange(range)
        return true
      }
      offset += len
      return false
    }
    if (node.tagName === 'BR') {
      if (offset + 1 >= target) {
        const parent = node.parentNode ?? root
        place(parent, Array.from(parent.childNodes).indexOf(node) + 1)
        return true
      }
      offset += 1
      return false
    }
    for (const child of node.childNodes) {
      if (walk(child)) return true
    }
    return false
  }

  for (const child of root.childNodes) {
    if (walk(child)) return
  }

  const range = document.createRange()
  range.selectNodeContents(root)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

export function resizeComposeField(el: HTMLElement, maxHeight: number) {
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
}
