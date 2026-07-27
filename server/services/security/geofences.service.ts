import { asc, eq, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { geofences } from '../../db/schema/security-access'
import type { GeoPoint } from '../../../shared/geo/point-in-polygon'
import { polygonBounds, simplifyPolygon } from '../../../shared/geo/point-in-polygon'
import type { SecurityZoneKind } from '../../../shared/validators/security'
import { refreshSecuritySnapshot } from './policy.service'

export interface GeofenceView {
  id: string
  name: string
  description: string
  kind: SecurityZoneKind
  enabled: boolean
  color: string
  polygon: GeoPoint[]
  pointCount: number
  hitCount: number
  lastHitAt: string | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
}

type GeofenceRow = typeof geofences.$inferSelect

function toView(row: GeofenceRow): GeofenceView {
  const polygon = Array.isArray(row.polygon) ? row.polygon : []
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    enabled: row.enabled,
    color: row.color,
    polygon,
    pointCount: polygon.length,
    hitCount: row.hitCount,
    lastHitAt: row.lastHitAt?.toISOString() ?? null,
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export class GeofenceError extends Error {
  constructor(public code: 'INVALID_POLYGON' | 'NOT_FOUND', message: string) {
    super(message)
    this.name = 'GeofenceError'
  }
}

/**
 * Freehand tracing yields hundreds of near-identical vertices. Simplifying on
 * write keeps the stored zone small and every later containment test cheap.
 */
function prepare(polygon: GeoPoint[]): { polygon: GeoPoint[], bounds: ReturnType<typeof polygonBounds> } {
  const simplified = simplifyPolygon(polygon)
  if (simplified.length < 3) {
    throw new GeofenceError('INVALID_POLYGON', 'A zone needs at least three points')
  }
  return { polygon: simplified, bounds: polygonBounds(simplified) }
}

export interface CreateGeofenceInput {
  name: string
  description?: string
  kind?: SecurityZoneKind
  enabled?: boolean
  color?: string
  polygon: GeoPoint[]
  actor?: { id: string | null, name: string | null } | null
}

export async function createGeofence(db: Db, input: CreateGeofenceInput): Promise<GeofenceView> {
  const { polygon, bounds } = prepare(input.polygon)

  const [row] = await db.insert(geofences).values({
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    kind: input.kind ?? 'allow',
    enabled: input.enabled ?? true,
    color: input.color ?? '#4f46e5',
    polygon,
    minLat: bounds?.minLat ?? null,
    maxLat: bounds?.maxLat ?? null,
    minLng: bounds?.minLng ?? null,
    maxLng: bounds?.maxLng ?? null,
    createdBy: input.actor?.id ?? null,
    createdByName: input.actor?.name ?? null,
  }).returning()

  await refreshSecuritySnapshot(db)
  return toView(row!)
}

export type UpdateGeofenceInput = Partial<Omit<CreateGeofenceInput, 'actor'>>

export async function updateGeofence(db: Db, id: string, input: UpdateGeofenceInput): Promise<GeofenceView> {
  const patch: Partial<typeof geofences.$inferInsert> = { updatedAt: new Date() }

  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.description !== undefined) patch.description = input.description.trim()
  if (input.kind !== undefined) patch.kind = input.kind
  if (input.enabled !== undefined) patch.enabled = input.enabled
  if (input.color !== undefined) patch.color = input.color
  if (input.polygon !== undefined) {
    const { polygon, bounds } = prepare(input.polygon)
    patch.polygon = polygon
    patch.minLat = bounds?.minLat ?? null
    patch.maxLat = bounds?.maxLat ?? null
    patch.minLng = bounds?.minLng ?? null
    patch.maxLng = bounds?.maxLng ?? null
  }

  const [row] = await db.update(geofences).set(patch).where(eq(geofences.id, id)).returning()
  if (!row) throw new GeofenceError('NOT_FOUND', 'Zone not found')

  await refreshSecuritySnapshot(db)
  return toView(row)
}

export async function deleteGeofence(db: Db, id: string): Promise<GeofenceView> {
  const [row] = await db.delete(geofences).where(eq(geofences.id, id)).returning()
  if (!row) throw new GeofenceError('NOT_FOUND', 'Zone not found')
  await refreshSecuritySnapshot(db)
  return toView(row)
}

export async function listGeofences(db: Db): Promise<GeofenceView[]> {
  const rows = await db.select().from(geofences).orderBy(asc(geofences.name))
  return rows.map(toView)
}

export async function recordGeofenceHit(db: Db, id: string): Promise<void> {
  await db.update(geofences)
    .set({ hitCount: sql`${geofences.hitCount} + 1`, lastHitAt: new Date() })
    .where(eq(geofences.id, id))
}
