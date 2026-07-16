import type { ServiceLogWorkType } from '../server/db/schema/service-logs'

/** Maps portal service category labels to service log work types. */
export function mapPortalCategoryToWorkType(category: string): ServiceLogWorkType {
  const c = category.toLowerCase()
  if (c.includes('preventive')) return 'preventive_maintenance'
  if (c.includes('diagnostic') || c.includes('check engine')) return 'diagnostic'
  if (c.includes('inspection')) return 'inspection'
  if (c.includes('repair') || c.includes('breakdown') || c.includes('tires') || c.includes('brakes')
    || c.includes('body') || c.includes('electrical')) {
    return 'repair'
  }
  return 'other'
}

export const CUSTOMER_REQUESTED_SERVICE_NOTE = 'Service requested by customer'
