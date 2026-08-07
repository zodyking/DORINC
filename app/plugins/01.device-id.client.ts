import { getOrCreateDeviceId } from '~/utils/device-id'

/**
 * On every visit: ensure a stable first-party device_id exists in cookie,
 * localStorage, and IndexedDB. API requests pick it up via 00.auth-fetch.
 */
export default defineNuxtPlugin(async () => {
  await getOrCreateDeviceId()
})
