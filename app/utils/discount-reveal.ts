/** Mouse uses double-click; touch/pen uses press-and-hold. */

export const DISCOUNT_HOLD_MS = 420

type PointerLike = {
  pointerType?: string
  button?: number
  clientX: number
  clientY: number
}

export class DiscountRevealSession {
  private timer: ReturnType<typeof setTimeout> | null = null
  private startX = 0
  private startY = 0
  private pending: (() => void) | null = null
  private lastFiredAt = 0
  private onWindowUp: (() => void) | null = null

  start(event: PointerLike, action: () => void, holdMs = DISCOUNT_HOLD_MS) {
    this.cancel()
    if ((event.button ?? 0) !== 0) return
    if ((event.pointerType || 'mouse') === 'mouse') return
    this.startX = event.clientX
    this.startY = event.clientY
    this.pending = action
    this.bindWindowUp()
    this.timer = setTimeout(() => {
      this.timer = null
      this.unbindWindowUp()
      const next = this.pending
      this.pending = null
      this.fire(next)
    }, holdMs)
  }

  move(event: PointerLike) {
    if (!this.timer) return
    const dx = event.clientX - this.startX
    const dy = event.clientY - this.startY
    if ((dx * dx) + (dy * dy) > 144) this.cancel()
  }

  cancel() {
    if (this.timer != null) clearTimeout(this.timer)
    this.timer = null
    this.pending = null
    this.unbindWindowUp()
  }

  /** iOS long-press; swallow the callout and open the field once. */
  fromContextMenu(event: Event, action: () => void) {
    event.preventDefault()
    this.cancel()
    this.fire(action)
  }

  fire(action: (() => void) | null) {
    if (!action) return
    const now = Date.now()
    if (now - this.lastFiredAt < 350) return
    this.lastFiredAt = now
    action()
  }

  private bindWindowUp() {
    if (typeof window === 'undefined' || this.onWindowUp) return
    this.onWindowUp = () => this.cancel()
    window.addEventListener('pointerup', this.onWindowUp, true)
    window.addEventListener('pointercancel', this.onWindowUp, true)
  }

  private unbindWindowUp() {
    if (typeof window === 'undefined' || !this.onWindowUp) return
    window.removeEventListener('pointerup', this.onWindowUp, true)
    window.removeEventListener('pointercancel', this.onWindowUp, true)
    this.onWindowUp = null
  }
}
