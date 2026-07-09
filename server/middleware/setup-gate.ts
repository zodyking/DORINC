import { sendRedirect } from 'h3'
import { hasDatabaseConfig } from '../services/runtime-config.service'
import { isBootstrapped } from '../services/setup.service'
import { useDb } from '../db/client'
import { apiError } from '../utils/api-error'

function isSetupApi(path: string): boolean {
  return path === '/api/health' || path.startsWith('/api/setup')
}

function isPublicAsset(path: string): boolean {
  return path.startsWith('/_nuxt')
    || path.startsWith('/__nuxt')
    || path.startsWith('/icons/')
    || path.startsWith('/manifest')
    || path === '/favicon.ico'
    || path === '/robots.txt'
    || path === '/sw.js'
}

/**
 * Before database/runtime config exists, only the setup wizard and its APIs are reachable.
 */
export default defineEventHandler(async (event) => {
  const path = event.path

  if (isPublicAsset(path) || isSetupApi(path)) return

  if (!hasDatabaseConfig()) {
    if (path.startsWith('/api/')) {
      throw apiError(event, 'SERVICE_UNAVAILABLE', 'Complete server setup first', { code: 'SETUP_REQUIRED' })
    }
    if (path !== '/setup' && !path.startsWith('/setup/')) {
      return sendRedirect(event, '/setup', 302)
    }
    return
  }

  try {
    if (!path.startsWith('/api/') && path !== '/setup' && !path.startsWith('/setup/')) {
      const bootstrapped = await isBootstrapped(useDb())
      if (!bootstrapped && path !== '/setup') {
        return sendRedirect(event, '/setup', 302)
      }
    }
  }
  catch {
    if (path.startsWith('/api/') && !isSetupApi(path)) {
      throw apiError(event, 'SERVICE_UNAVAILABLE', 'Database unavailable', { code: 'DATABASE_ERROR' })
    }
  }
})
