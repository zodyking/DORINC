import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import type { PortalInvoiceCorrectionPayload } from '../../../shared/portal-invoice-correction'
import { customers } from './customers'
import { users } from './auth'
import { vehicles } from './vehicles'
import { invoices } from './invoices'

export const PORTAL_REQUEST_STATUSES = ['pending', 'approved', 'rejected'] as const
export type PortalRequestStatus = (typeof PORTAL_REQUEST_STATUSES)[number]

export const NEW_VEHICLE_REQUEST_STATUSES = PORTAL_REQUEST_STATUSES
export type NewVehicleRequestStatus = PortalRequestStatus

/** Customer-submitted new vehicle requests — staff review creates official records (SPEC §7). */
export const newVehicleRequests = pgTable('new_vehicle_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),

  status: text('status', { enum: PORTAL_REQUEST_STATUSES }).notNull().default('pending'),

  fleetTag: text('fleet_tag').notNull(),
  unitType: text('unit_type', { enum: ['truck', 'bus', 'equipment', 'tractor', 'other'] }).notNull().default('truck'),
  vin: text('vin'),
  year: integer('year'),
  make: text('make'),
  model: text('model'),
  notes: text('notes'),

  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewReason: text('review_reason'),
  resultVehicleId: uuid('result_vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('new_vehicle_requests_customer_idx').on(table.customerId),
  index('new_vehicle_requests_status_idx').on(table.status),
])

export const SERVICE_REQUEST_URGENCIES = ['normal', 'soon', 'urgent'] as const
export type ServiceRequestUrgency = (typeof SERVICE_REQUEST_URGENCIES)[number]

/** Customer service requests — staff review creates work orders / invoices (SPEC §7). */
export const serviceRequests = pgTable('service_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),

  status: text('status', { enum: PORTAL_REQUEST_STATUSES }).notNull().default('pending'),

  serviceCategory: text('service_category').notNull(),
  urgency: text('urgency', { enum: SERVICE_REQUEST_URGENCIES }).notNull().default('normal'),
  preferredDate: text('preferred_date'),
  location: text('location'),
  description: text('description').notNull(),

  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewReason: text('review_reason'),
  resultInvoiceId: uuid('result_invoice_id').references(() => invoices.id),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('service_requests_customer_idx').on(table.customerId),
  index('service_requests_status_idx').on(table.status),
])

/** Customer invoice / billing correction requests (SPEC §7). */
export const invoiceChangeRequests = pgTable('invoice_change_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),
  invoiceId: uuid('invoice_id').references(() => invoices.id),

  status: text('status', { enum: PORTAL_REQUEST_STATUSES }).notNull().default('pending'),

  topic: text('topic').notNull(),
  description: text('description').notNull(),
  correctionPayload: jsonb('correction_payload').$type<PortalInvoiceCorrectionPayload>(),

  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewReason: text('review_reason'),
  resultInvoiceId: uuid('result_invoice_id').references(() => invoices.id),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('invoice_change_requests_customer_idx').on(table.customerId),
  index('invoice_change_requests_status_idx').on(table.status),
])

/** Customer vehicle data correction requests (SPEC §7). */
export const vehicleChangeRequests = pgTable('vehicle_change_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),

  status: text('status', { enum: PORTAL_REQUEST_STATUSES }).notNull().default('pending'),

  subject: text('subject').notNull(),
  description: text('description').notNull(),

  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewReason: text('review_reason'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('vehicle_change_requests_customer_idx').on(table.customerId),
  index('vehicle_change_requests_status_idx').on(table.status),
])

/** General portal messages — account updates, hours, misc (SPEC §7). */
export const portalGeneralRequests = pgTable('portal_general_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),

  status: text('status', { enum: PORTAL_REQUEST_STATUSES }).notNull().default('pending'),

  subject: text('subject').notNull(),
  message: text('message').notNull(),

  reviewedBy: uuid('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewReason: text('review_reason'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('portal_general_requests_customer_idx').on(table.customerId),
  index('portal_general_requests_status_idx').on(table.status),
])
