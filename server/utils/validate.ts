import type { H3Event } from 'h3'
import { getQuery, getRouterParams, readBody } from 'h3'
import type { z } from 'zod'
import { validationError } from './api-error'

export async function validateBody<T extends z.ZodType>(event: H3Event, schema: T): Promise<z.output<T>> {
  const body = await readBody(event).catch(() => undefined)
  const result = schema.safeParse(body)
  if (!result.success) throw validationError(event, result.error)
  return result.data
}

export function validateQuery<T extends z.ZodType>(event: H3Event, schema: T): z.output<T> {
  const result = schema.safeParse(getQuery(event))
  if (!result.success) throw validationError(event, result.error)
  return result.data
}

export function validateParams<T extends z.ZodType>(event: H3Event, schema: T): z.output<T> {
  const result = schema.safeParse(getRouterParams(event))
  if (!result.success) throw validationError(event, result.error)
  return result.data
}
