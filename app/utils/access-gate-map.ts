/** Shape of an access-gate event as rendered on the security map. */
export interface AccessMapEvent {
  id: string
  eventType: 'visit' | 'login'
  outcome: string
  ipAddress: string | null
  userName: string | null
  userEmail: string | null
  path: string | null
  latitude: number | null
  longitude: number | null
  locationLabel: string | null
  createdAt: string
}
