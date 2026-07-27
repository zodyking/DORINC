import { useDb } from '../../../db/client'
import { getSecurityOverview } from '../../../services/security/access-events.service'
import { countActiveBans } from '../../../services/security/ip-bans.service'
import { listGeofences } from '../../../services/security/geofences.service'
import { getSecuritySnapshot } from '../../../services/security/policy.service'
import { requirePermission } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')

  const [events, activeBans, zones] = await Promise.all([
    getSecurityOverview(useDb()),
    countActiveBans(useDb()),
    listGeofences(useDb()),
  ])

  const snapshot = getSecuritySnapshot()

  return {
    events,
    activeBans,
    zones: {
      total: zones.length,
      enabled: zones.filter(zone => zone.enabled).length,
      allow: zones.filter(zone => zone.enabled && zone.kind === 'allow').length,
      block: zones.filter(zone => zone.enabled && zone.kind === 'block').length,
    },
    // Exposes how stale this instance's in-memory rule set is, which is the
    // first thing to check when a rule "isn't taking effect".
    snapshotAgeMs: snapshot.loadedAt ? Date.now() - snapshot.loadedAt : null,
  }
})
