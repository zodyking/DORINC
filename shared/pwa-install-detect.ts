export function isInstalledWebAppPlatform(platform?: string): boolean {
  const normalized = (platform ?? '').toLowerCase()
  return normalized === 'webapp' || normalized === 'web_app'
}

export function detectInstalledFromSignals(input: {
  standalone: boolean
  relatedApps: Array<{ platform?: string }> | null
  hasRelatedAppsApi: boolean
}): boolean {
  if (input.standalone) return true
  if (!input.hasRelatedAppsApi || input.relatedApps == null) return false
  return input.relatedApps.some(app => isInstalledWebAppPlatform(app.platform))
}
