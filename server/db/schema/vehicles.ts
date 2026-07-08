import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { customers } from './customers'
import { users } from './auth'

/** Vehicles / fleet units — belong to customers (SPEC §6.2). Archived, never deleted. */
export const vehicles = pgTable('vehicles', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),

  unitType: text('unit_type', { enum: ['truck', 'bus', 'equipment', 'tractor', 'other'] }).notNull().default('truck'),
  // Fleet-assigned number, unique per customer (e.g. "HL-114")
  busNumber: text('bus_number'),
  // Optional secondary unit/tag label
  unitTag: text('unit_tag'),

  vin: text('vin'),
  plate: text('plate'),

  year: integer('year'),
  make: text('make'),
  model: text('model'),
  trim: text('trim'),
  bodyClass: text('body_class'),
  engine: text('engine'),
  fuelType: text('fuel_type'),
  color: text('color'),

  // Odometer supports tenth-precision hour meters (e.g. 2,148.6 hrs)
  odometer: numeric('odometer', { precision: 12, scale: 1 }),
  odometerUnit: text('odometer_unit', { enum: ['mi', 'hrs'] }).notNull().default('mi'),

  status: text('status', { enum: ['active', 'inactive', 'retired'] }).notNull().default('active'),
  notes: text('notes'),

  // Full NHTSA vPIC response for the stored VIN (SPEC §6.2)
  vinDecodeRaw: jsonb('vin_decode_raw'),

  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, table => [
  index('vehicles_customer_idx').on(table.customerId),
  index('vehicles_vin_idx').on(table.vin),
  index('vehicles_archived_idx').on(table.archivedAt),
  // Bus number unique per customer among live rows (SPEC §6.2)
  uniqueIndex('vehicles_customer_bus_number_uq')
    .on(table.customerId, table.busNumber)
    .where(sql`bus_number IS NOT NULL AND archived_at IS NULL`),
])
