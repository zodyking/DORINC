import { nextTick } from 'vue'

/** Focus a line qty/rate input in the visible desktop or mobile layout. */

export function focusVisibleLineInput(lineId: string, field: 'quantity' | 'rate') {
  nextTick(() => {
    const inputs = document.querySelectorAll<HTMLInputElement>(
      `input[data-line-id="${lineId}"][data-line-field="${field}"]`,
    )
    for (const input of inputs) {
      if (input.offsetParent !== null) {
        input.focus()
        return
      }
    }
    inputs[0]?.focus()
  })
}
