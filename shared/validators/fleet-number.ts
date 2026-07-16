import { z } from 'zod'

export const FLEET_NUMBER_PLACEHOLDER = 'Fleet number (number only)'

export const FLEET_NUMBER_REJECT_MESSAGE = 'Don\'t add vehicle type or hash tag to fleet number'

/** Rejects vehicle-type words and hash symbols in fleet numbers (case-insensitive). */
const FLEET_NUMBER_REJECTED_RE = /(?:\b(?:car|truck|bus|tractor)\b|#)/i

export function fleetNumberHasRejectedPhrase(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  return FLEET_NUMBER_REJECTED_RE.test(trimmed)
}

export function fleetNumberOptionalSchema(maxLen: number) {
  return z.string().max(maxLen).nullish().refine(
    val => !val?.trim() || !fleetNumberHasRejectedPhrase(val),
    { message: FLEET_NUMBER_REJECT_MESSAGE },
  )
}

export function fleetNumberRequiredSchema(maxLen: number) {
  return z.string().trim().min(1).max(maxLen).refine(
    val => !fleetNumberHasRejectedPhrase(val),
    { message: FLEET_NUMBER_REJECT_MESSAGE },
  )
}

export function fleetNumberTrimmedOptionalSchema(maxLen: number) {
  return z.string().trim().max(maxLen).optional().nullable().refine(
    val => !val || !fleetNumberHasRejectedPhrase(val),
    { message: FLEET_NUMBER_REJECT_MESSAGE },
  )
}
