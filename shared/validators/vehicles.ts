import { z } from 'zod'
import { nonEmptyString, uuidSchema } from './common'
import { fleetNumberOptionalSchema, fleetNumberRequiredSchema, fleetNumberTrimmedOptionalSchema } from './fleet-number'

export const vinSchema = z.string().trim().min(5).max(17)
  .regex(/^[A-HJ-NPR-Z0-9]+$/i, 'VIN contains invalid characters')

export const vehicleCreateSchema = z.object({
  customerId: uuidSchema,
  unitType: z.enum(['truck', 'bus', 'equipment', 'tractor', 'other']).optional(),
  busNumber: fleetNumberOptionalSchema(40),
  unitTag: fleetNumberOptionalSchema(80),
  vin: vinSchema.nullish(),
  plate: z.string().max(20).nullish(),
  year: z.number().int().min(1900).max(2100).nullish(),
  make: z.string().max(80).nullish(),
  model: z.string().max(120).nullish(),
  trim: z.string().max(120).nullish(),
  bodyClass: z.string().max(120).nullish(),
  engine: z.string().max(200).nullish(),
  fuelType: z.string().max(80).nullish(),
  color: z.string().max(40).nullish(),
  odometer: z.number().min(0).max(99999999999).nullish(),
  odometerUnit: z.enum(['mi', 'hrs']).optional(),
  status: z.enum(['active', 'inactive', 'retired']).optional(),
  notes: z.string().max(5000).nullish(),
  vinDecodeRaw: z.record(z.string(), z.unknown()).nullish(),
})

export const vehicleUpdateSchema = vehicleCreateSchema.omit({ customerId: true }).partial()

export const vinDecodeRequestSchema = z.object({
  vin: vinSchema,
})
