import { ensureDeviceId } from '../utils/device-id'

/**
 * Assign / refresh the first-party device_id cookie on every request so SSR
 * visits and subsequent navigations share a stable identity before client JS.
 */
export default defineEventHandler((event) => {
  ensureDeviceId(event)
})
