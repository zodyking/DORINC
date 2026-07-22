import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { getRequestURL } from 'h3'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { hasDatabaseConfigured, useDb } from '../db/client'
import { getPublicBusinessProfile } from '../services/workspace-settings.service'

const APP_NAME = 'DORINC'
const LOGO_PATH = '/images/dorinc-icon-trans-2.png'
const CACHE_TTL_MS = 60_000

interface BrandMeta {
  siteName: string
  title: string
  description: string
}

let cache: { meta: BrandMeta, expiresAt: number } | null = null

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function resolveBrandMeta(): Promise<BrandMeta> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.meta

  let siteName = APP_NAME
  let description = 'Secure customer portal and service billing.'

  try {
    if (hasDatabaseConfig() && hasDatabaseConfigured()) {
      const profile = await getPublicBusinessProfile(useDb())
      const name = profile.businessName?.trim()
      if (name) {
        siteName = name
        const place = [profile.city?.trim(), profile.state?.trim()].filter(Boolean).join(', ')
        description = place
          ? `Secure customer portal and service billing — ${name}, ${place}.`
          : `Secure customer portal and service billing — ${name}.`
      }
    }
  }
  catch {
    // Fall back to defaults if settings are unavailable.
  }

  const meta: BrandMeta = { siteName, title: siteName, description }
  cache = { meta, expiresAt: now + CACHE_TTL_MS }
  return meta
}

/**
 * Inject business-aware Open Graph / Twitter link-preview tags into every
 * server-rendered page so shared links show the business name, description,
 * and a clean transparent logo instead of generic placeholder branding.
 */
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('render:html', async (html, { event }) => {
    try {
      const { siteName, title, description } = await resolveBrandMeta()

      let pagePath = '/'
      let requestOrigin = ''
      try {
        const reqUrl = getRequestURL(event)
        requestOrigin = reqUrl.origin
        pagePath = reqUrl.pathname + reqUrl.search
      }
      catch {
        // Non-HTTP render context; absolute URLs are best-effort.
      }

      // Prefer the configured public URL (canonical, correct behind a proxy),
      // falling back to the request origin.
      const configuredUrl = (useRuntimeConfig().public?.appUrl as string | undefined)?.trim()
      const canonicalOrigin = (configuredUrl && !/localhost|127\.0\.0\.1/.test(configuredUrl)
        ? configuredUrl
        : requestOrigin).replace(/\/+$/, '')

      const imageUrl = canonicalOrigin ? `${canonicalOrigin}${LOGO_PATH}` : LOGO_PATH
      const pageUrl = canonicalOrigin ? `${canonicalOrigin}${pagePath}` : ''
      const tags = [
        `<meta property="og:site_name" content="${escapeAttr(siteName)}">`,
        `<meta property="og:title" content="${escapeAttr(title)}">`,
        `<meta property="og:description" content="${escapeAttr(description)}">`,
        `<meta property="og:image" content="${escapeAttr(imageUrl)}">`,
        `<meta property="og:image:alt" content="${escapeAttr(`${siteName} logo`)}">`,
        `<meta name="description" content="${escapeAttr(description)}">`,
        `<meta name="twitter:title" content="${escapeAttr(title)}">`,
        `<meta name="twitter:description" content="${escapeAttr(description)}">`,
        `<meta name="twitter:image" content="${escapeAttr(imageUrl)}">`,
      ]
      if (pageUrl) tags.push(`<meta property="og:url" content="${escapeAttr(pageUrl)}">`)

      html.head.push(tags.join(''))
    }
    catch {
      // Never block page render on meta injection.
    }
  })
})
