import { nextTick } from 'vue'

type LineField = 'description' | 'quantity' | 'rate'

function focusVisibleInput(lineId: string, field: LineField) {
  const inputs = document.querySelectorAll<HTMLInputElement>(
    `input[data-line-id="${lineId}"][data-line-field="${field}"]`,
  )
  for (const input of inputs) {
    if (input.offsetParent !== null) {
      input.focus()
      return input
    }
  }
  const fallback = inputs[0]
  fallback?.focus()
  return fallback ?? null
}

/** Wait for Vue to mount a newly added line row before focusing. */
export function focusVisibleLineField(lineId: string, field: LineField) {
  void nextTick(() => {
    void nextTick(() => {
      focusVisibleInput(lineId, field)
    })
  })
}

export function focusVisibleLineDescription(lineId: string) {
  focusVisibleLineField(lineId, 'description')
}

export function focusVisibleLineInput(lineId: string, field: 'quantity' | 'rate') {
  focusVisibleLineField(lineId, field)
}
