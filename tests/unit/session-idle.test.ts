import { describe, expect, it } from 'vitest'
import {
  SESSION_IDLE_COUNTDOWN_SECONDS,
  SESSION_IDLE_WARNING_AFTER_MS,
  formatSessionCountdown,
} from '../../shared/session-idle'

describe('session idle constants', () => {
  it('warns after five minutes of inactivity', () => {
    expect(SESSION_IDLE_WARNING_AFTER_MS).toBe(5 * 60 * 1000)
  })

  it('counts down for one minute before sign-out', () => {
    expect(SESSION_IDLE_COUNTDOWN_SECONDS).toBe(60)
  })
})

describe('formatSessionCountdown', () => {
  it('formats seconds only', () => {
    expect(formatSessionCountdown(45)).toBe('45')
    expect(formatSessionCountdown(0)).toBe('0')
  })

  it('formats minutes and seconds', () => {
    expect(formatSessionCountdown(75)).toBe('1:15')
    expect(formatSessionCountdown(60)).toBe('1:00')
  })
})
