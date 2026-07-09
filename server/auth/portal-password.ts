import { randomInt } from 'node:crypto'

/**
 * Temporary portal passwords: exactly 10 characters, memorable phrase shape,
 * always includes a digit and a special character.
 * Pattern: 4-letter word + 4-letter word + digit + special → e.g. BlueTree7!
 */

const WORD_A = [
  'Blue', 'Calm', 'Cool', 'Dark', 'Fast', 'Gold', 'Gray', 'Kind', 'Lake', 'Mint',
  'Moon', 'Nest', 'Palm', 'Pine', 'Rose', 'Safe', 'Soft', 'Star', 'Warm', 'Bold',
] as const

const WORD_B = [
  'Bird', 'Boat', 'Dock', 'Door', 'Farm', 'Gate', 'Hill', 'Leaf', 'Path', 'Pond',
  'Port', 'Road', 'Rock', 'Ship', 'Shop', 'Tree', 'Wave', 'Wind', 'Wood', 'Yard',
] as const

const DIGITS = '23456789'
const SPECIALS = '!@#$%&*'

function pick<T extends readonly string[]>(list: T): T[number] {
  return list[randomInt(list.length)]!
}

export function generatePortalTempPassword(): string {
  const password = `${pick(WORD_A)}${pick(WORD_B)}${DIGITS[randomInt(DIGITS.length)]!}${SPECIALS[randomInt(SPECIALS.length)]!}`
  if (password.length !== 10) {
    throw new Error('portal temp password must be exactly 10 characters')
  }
  return password
}

/** Lightweight shape check for tests. */
export function isPortalTempPasswordShape(value: string): boolean {
  if (value.length !== 10) return false
  if (!/^[A-Za-z]{8}[0-9][!@#$%&*]$/.test(value)) return false
  return true
}
