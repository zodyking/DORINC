import { and, asc, count, desc, eq, ilike, isNull, ne, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { vehicles } from '../db/schema/vehicles'
import { customers } from '../db/schema/customers'
import { CustomersServiceError, getCustomer } from './customers.service'

/** School-bus fleet default paint code. */
export const BUS_DEFAULT_COLOR = 'YW'

export type VehiclesServiceErrorCode = 'NOT_FOUND' | 'ALREADY_ARCHIVED' | 'NOT_ARCHIVED' | 'DUPLICATE_BUS_NUMBER' | 'CUSTOMER_NOT_FOUND'

export class VehiclesServiceError extends Error {
  constructor(public readonly code: VehiclesServiceErrorCode) {
    super(code)
  }
}

export type UnitType = 'truck' | 'bus' | 'equipment' | 'tractor' | 'other'

export interface VehicleInput {
  customerId: string
  unitType?: UnitType
  busNumber?: string | null
  unitTag?: string | null
  vin?: string | null
  plate?: string | null
  year?: number | null
  make?: string | null
  model?: string | null
  trim?: string | null
  bodyClass?: string | null
  engine?: string | null
  fuelType?: string | null
  color?: string | null
  odometer?: number | null
  odometerUnit?: 'mi' | 'hrs'
  status?: 'active' | 'inactive' | 'retired'
  notes?: string | null
  vinDecodeRaw?: unknown
}

async function assertBusNumberAvailable(db: Db, customerId: string | null, busNumber: string, excludeId?: string) {
  if (!customerId) return
  const conditions = [
    eq(vehicles.customerId, customerId),
    eq(vehicles.busNumber, busNumber),
    isNull(vehicles.archivedAt),
  ]
  if (excludeId) conditions.push(ne(vehicles.id, excludeId))
  const [dupe] = await db.select({ id: vehicles.id }).from(vehicles).where(and(...conditions))
  if (dupe) throw new VehiclesServiceError('DUPLICATE_BUS_NUMBER')
}

export async function createVehicle(db: Db, input: VehicleInput, createdBy: string) {
  try {
    await getCustomer(db, input.customerId)
  }
  catch (err) {
    if (err instanceof CustomersServiceError && err.code === 'NOT_FOUND') {
      throw new VehiclesServiceError('CUSTOMER_NOT_FOUND')
    }
    throw err
  }

  const busNumber = input.busNumber?.trim() || null
  if (busNumber) await assertBusNumberAvailable(db, input.customerId, busNumber)

  const unitType = input.unitType ?? 'truck'
  const color = input.color?.trim()
    || (unitType === 'bus' ? BUS_DEFAULT_COLOR : null)

  const [row] = await db.insert(vehicles).values({
    customerId: input.customerId,
    unitType,
    busNumber,
    unitTag: input.unitTag ?? null,
    vin: input.vin?.trim().toUpperCase() || null,
    plate: input.plate ?? null,
    year: input.year ?? null,
    make: input.make ?? null,
    model: input.model ?? null,
    trim: input.trim ?? null,
    bodyClass: input.bodyClass ?? null,
    engine: input.engine ?? null,
    fuelType: input.fuelType ?? null,
    color,
    odometer: input.odometer != null ? String(input.odometer) : null,
    odometerUnit: input.odometerUnit ?? 'mi',
    status: input.status ?? 'active',
    notes: input.notes ?? null,
    vinDecodeRaw: input.vinDecodeRaw ?? null,
    createdBy,
  }).returning()
  return row!
}

export async function getVehicle(db: Db, id: string) {
  const [row] = await db.select().from(vehicles).where(eq(vehicles.id, id))
  if (!row) throw new VehiclesServiceError('NOT_FOUND')
  return row
}

export async function updateVehicle(db: Db, id: string, patch: Partial<Omit<VehicleInput, 'customerId'>>) {
  const before = await getVehicle(db, id)

  if (patch.busNumber !== undefined) {
    const next = patch.busNumber?.trim() || null
    if (next && next !== before.busNumber) {
      await assertBusNumberAvailable(db, before.customerId, next, id)
    }
    patch = { ...patch, busNumber: next }
  }
  if (patch.vin !== undefined) {
    patch = { ...patch, vin: patch.vin?.trim().toUpperCase() || null }
  }

  const changes: Record<string, unknown> = { updatedAt: new Date() }
  const changedFields: string[] = []
  for (const [key, value] of Object.entries(patch)) {
    const normalized = key === 'odometer' && value != null ? String(value) : value
    if (normalized !== undefined && JSON.stringify(normalized) !== JSON.stringify(before[key as keyof typeof before])) {
      changes[key] = normalized
      changedFields.push(key)
    }
  }

  if (!changedFields.length) return { vehicle: before, before, changedFields }

  const [updated] = await db.update(vehicles)
    .set(changes)
    .where(eq(vehicles.id, id))
    .returning()

  return { vehicle: updated!, before, changedFields }
}

export async function archiveVehicle(db: Db, id: string) {
  const before = await getVehicle(db, id)
  if (before.archivedAt) throw new VehiclesServiceError('ALREADY_ARCHIVED')
  const [row] = await db.update(vehicles)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(vehicles.id, id))
    .returning()
  return row!
}

export async function restoreVehicle(db: Db, id: string) {
  const before = await getVehicle(db, id)
  if (!before.archivedAt) throw new VehiclesServiceError('NOT_ARCHIVED')
  // Restoring must not resurrect a duplicate bus number
  if (before.busNumber && before.customerId) {
    await assertBusNumberAvailable(db, before.customerId, before.busNumber, id)
  }
  const [row] = await db.update(vehicles)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(vehicles.id, id))
    .returning()
  return row!
}

export interface ListVehiclesFilter {
  q?: string
  customerId?: string
  unitType?: UnitType
  includeArchived?: boolean
  sort?: 'tag-asc' | 'tag-desc' | 'customer-asc' | 'odo-desc' | 'newest'
  page: number
  pageSize: number
}

export async function listVehicles(db: Db, filter: ListVehiclesFilter) {
  const conditions = []

  if (!filter.includeArchived) conditions.push(isNull(vehicles.archivedAt))
  if (filter.customerId) conditions.push(eq(vehicles.customerId, filter.customerId))
  if (filter.unitType) conditions.push(eq(vehicles.unitType, filter.unitType))

  if (filter.q) {
    const term = `%${filter.q}%`
    conditions.push(or(
      ilike(vehicles.busNumber, term),
      ilike(vehicles.unitTag, term),
      ilike(vehicles.vin, term),
      ilike(vehicles.plate, term),
      ilike(vehicles.make, term),
      ilike(vehicles.model, term),
      ilike(customers.displayName, term),
    ))
  }

  const where = conditions.length ? and(...conditions) : undefined
  const orderBy = filter.sort === 'tag-desc'
    ? desc(vehicles.busNumber)
    : filter.sort === 'customer-asc'
      ? asc(customers.displayName)
      : filter.sort === 'odo-desc'
        ? desc(sql`${vehicles.odometer}::numeric`)
        : filter.sort === 'newest'
          ? desc(vehicles.createdAt)
          : asc(vehicles.busNumber)

  const base = db.select({
    vehicle: vehicles,
    customerName: customers.displayName,
  }).from(vehicles).leftJoin(customers, eq(vehicles.customerId, customers.id))

  const rows = await base
    .where(where)
    .orderBy(orderBy)
    .limit(filter.pageSize)
    .offset((filter.page - 1) * filter.pageSize)

  const [total] = await db.select({ value: count() })
    .from(vehicles)
    .innerJoin(customers, eq(vehicles.customerId, customers.id))
    .where(where)

  return {
    items: rows.map(r => ({ ...r.vehicle, customerName: r.customerName })),
    total: total!.value,
    page: filter.page,
    pageSize: filter.pageSize,
  }
}

/** Normalized subset of a vPIC decode we surface in the UI (SPEC §6.2). */
export interface VinDecodeNormalized {
  vin: string
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  bodyClass: string | null
  engine: string | null
  fuelType: string | null
  vehicleType: string | null
  gvwr: string | null
  plantCountry: string | null
  errorText: string | null
}

const VPIC_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles'
const VPIC_TIMEOUT_MS = 12_000

async function fetchVpic(url: string): Promise<Response> {
  // vPIC is occasionally slow — bound each attempt and retry once
  try {
    return await fetch(url, { signal: AbortSignal.timeout(VPIC_TIMEOUT_MS) })
  }
  catch {
    return await fetch(url, { signal: AbortSignal.timeout(VPIC_TIMEOUT_MS) })
  }
}

export async function decodeVin(vin: string): Promise<{ normalized: VinDecodeNormalized, raw: Record<string, string> }> {
  const clean = vin.trim().toUpperCase()
  const res = await fetchVpic(`${VPIC_BASE}/DecodeVinValues/${encodeURIComponent(clean)}?format=json`)
  if (!res.ok) throw new Error(`vPIC responded ${res.status}`)
  const body = await res.json() as { Results?: Record<string, string>[] }
  const raw = body.Results?.[0] ?? {}

  const val = (key: string) => {
    const v = raw[key]
    return v && v !== 'Not Applicable' ? v : null
  }
  const engineParts = [
    val('EngineModel'),
    val('EngineManufacturer'),
    val('DisplacementL') ? `${val('DisplacementL')}L` : null,
    val('EngineCylinders') ? `${val('EngineCylinders')} cyl` : null,
  ].filter(Boolean)

  return {
    normalized: {
      vin: clean,
      year: val('ModelYear') ? Number(val('ModelYear')) : null,
      make: val('Make'),
      model: val('Model'),
      trim: val('Trim'),
      bodyClass: val('BodyClass'),
      engine: engineParts.length ? engineParts.join(' · ') : null,
      fuelType: val('FuelTypePrimary'),
      vehicleType: val('VehicleType'),
      gvwr: val('GVWR'),
      plantCountry: val('PlantCountry'),
      errorText: raw.ErrorCode && raw.ErrorCode !== '0' ? (raw.ErrorText ?? null) : null,
    },
    raw,
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export interface BulkVinDecodeResult {
  scanned: number
  updated: number
  skipped: number
  failed: number
  items: Array<{
    id: string
    vin: string
    status: 'updated' | 'skipped' | 'failed'
    year?: number | null
    make?: string | null
    model?: string | null
    error?: string
  }>
}

/**
 * Decode VIN for live vehicles missing year, make, or model and persist results.
 * Buses without a color also get the school-bus default (YW).
 */
export async function bulkDecodeMissingVehicleFields(
  db: Db,
  opts: { limit?: number } = {},
): Promise<BulkVinDecodeResult> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500)

  // School buses with no color → YW
  await db.update(vehicles)
    .set({ color: BUS_DEFAULT_COLOR, updatedAt: new Date() })
    .where(and(
      isNull(vehicles.archivedAt),
      eq(vehicles.unitType, 'bus'),
      sql`(${vehicles.color} IS NULL OR trim(${vehicles.color}) = '')`,
    ))

  const candidates = await db.select({
    id: vehicles.id,
    vin: vehicles.vin,
    unitType: vehicles.unitType,
    year: vehicles.year,
    make: vehicles.make,
    model: vehicles.model,
    trim: vehicles.trim,
    bodyClass: vehicles.bodyClass,
    engine: vehicles.engine,
    fuelType: vehicles.fuelType,
    color: vehicles.color,
  })
    .from(vehicles)
    .where(and(
      isNull(vehicles.archivedAt),
      sql`${vehicles.vin} IS NOT NULL AND length(trim(${vehicles.vin})) >= 5`,
      sql`(
        ${vehicles.year} IS NULL
        OR ${vehicles.make} IS NULL OR trim(${vehicles.make}) = ''
        OR ${vehicles.model} IS NULL OR trim(${vehicles.model}) = ''
      )`,
    ))
    .orderBy(asc(vehicles.createdAt))
    .limit(limit)

  const result: BulkVinDecodeResult = {
    scanned: candidates.length,
    updated: 0,
    skipped: 0,
    failed: 0,
    items: [],
  }

  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i]!
    const vin = row.vin!.trim().toUpperCase()

    try {
      const { normalized, raw } = await decodeVin(vin)
      const patch: Partial<Omit<VehicleInput, 'customerId'>> = {
        vinDecodeRaw: raw,
      }

      if (row.year == null && normalized.year != null) patch.year = normalized.year
      if ((!row.make || !row.make.trim()) && normalized.make) patch.make = normalized.make
      if ((!row.model || !row.model.trim()) && normalized.model) patch.model = normalized.model
      if ((!row.trim || !row.trim.trim()) && normalized.trim) patch.trim = normalized.trim
      if ((!row.bodyClass || !row.bodyClass.trim()) && normalized.bodyClass) patch.bodyClass = normalized.bodyClass
      if ((!row.engine || !row.engine.trim()) && normalized.engine) patch.engine = normalized.engine
      if ((!row.fuelType || !row.fuelType.trim()) && normalized.fuelType) patch.fuelType = normalized.fuelType
      if (row.unitType === 'bus' && (!row.color || !row.color.trim())) patch.color = BUS_DEFAULT_COLOR

      const filled = patch.year != null || patch.make || patch.model || patch.trim
        || patch.bodyClass || patch.engine || patch.fuelType || patch.color

      if (!filled) {
        result.skipped++
        result.items.push({ id: row.id, vin, status: 'skipped', error: normalized.errorText ?? 'No year/make/model returned' })
      }
      else {
        await updateVehicle(db, row.id, patch)
        result.updated++
        result.items.push({
          id: row.id,
          vin,
          status: 'updated',
          year: patch.year ?? row.year,
          make: (patch.make as string | undefined) ?? row.make,
          model: (patch.model as string | undefined) ?? row.model,
        })
      }
    }
    catch (err) {
      result.failed++
      result.items.push({
        id: row.id,
        vin,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Decode failed',
      })
    }

    // Be polite to NHTSA vPIC between requests
    if (i < candidates.length - 1) await sleep(250)
  }

  return result
}
