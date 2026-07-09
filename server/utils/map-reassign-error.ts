import type { H3Event } from 'h3'
import { ReassignServiceError } from '../services/reassign.service'
import { apiError } from './api-error'

export function mapReassignError(event: H3Event, err: unknown): never {
  if (!(err instanceof ReassignServiceError)) throw err

  switch (err.code) {
    case 'NOT_FOUND':
      throw apiError(event, 'NOT_FOUND', 'Record not found')
    case 'CUSTOMER_NOT_FOUND':
      throw apiError(event, 'NOT_FOUND', 'Customer not found')
    case 'CUSTOMER_ARCHIVED':
      throw apiError(event, 'CONFLICT', 'Cannot reassign to an archived customer')
    case 'VEHICLE_NOT_FOUND':
      throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
    case 'VEHICLE_CUSTOMER_MISMATCH':
      throw apiError(event, 'CONFLICT', 'Vehicle does not belong to the selected customer')
    case 'SAME_CUSTOMER':
      throw apiError(event, 'CONFLICT', 'Record is already assigned to that customer')
    case 'DUPLICATE_BUS_NUMBER':
      throw apiError(event, 'CONFLICT', 'Target customer already has a unit with that fleet number')
    case 'NOT_REASSIGNABLE':
      throw apiError(event, 'CONFLICT', 'This record cannot be reassigned in its current state')
    case 'ALREADY_CONVERTED':
      throw apiError(event, 'CONFLICT', 'Converted service logs cannot be reassigned')
    default:
      throw err
  }
}
