import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiscountRevealSession } from '../../app/utils/discount-reveal'

function pointer(partial: Partial<{ pointerType: string, button: number, clientX: number, clientY: number }>) {
  return {
    pointerType: 'touch',
    button: 0,
    clientX: 10,
    clientY: 10,
    ...partial,
  }
}

describe('DiscountRevealSession', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not hold-to-edit for a mouse pointer', () => {
    vi.useFakeTimers()
    const session = new DiscountRevealSession()
    const action = vi.fn()
    session.start(pointer({ pointerType: 'mouse' }), action)
    vi.advanceTimersByTime(800)
    expect(action).not.toHaveBeenCalled()
  })

  it('opens after a touch press-and-hold', () => {
    vi.useFakeTimers()
    const session = new DiscountRevealSession()
    const action = vi.fn()
    session.start(pointer({ pointerType: 'touch' }), action)
    vi.advanceTimersByTime(419)
    expect(action).not.toHaveBeenCalled()
    vi.advanceTimersByTime(20)
    expect(action).toHaveBeenCalledOnce()
  })

  it('cancels the hold when the finger moves', () => {
    vi.useFakeTimers()
    const session = new DiscountRevealSession()
    const action = vi.fn()
    session.start(pointer({ pointerType: 'touch' }), action)
    session.move(pointer({ pointerType: 'touch', clientX: 40, clientY: 10 }))
    vi.advanceTimersByTime(800)
    expect(action).not.toHaveBeenCalled()
  })

  it('treats contextmenu as a long-press without double-firing', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const session = new DiscountRevealSession()
    const action = vi.fn()
    const event = { preventDefault: vi.fn() } as unknown as Event
    session.fromContextMenu(event, action)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(action).toHaveBeenCalledOnce()
    session.fromContextMenu(event, action)
    expect(action).toHaveBeenCalledOnce()
  })
})
