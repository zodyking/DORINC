import { guardStaffRoute } from '~/utils/staff-route-guard'

export default defineNuxtRouteMiddleware(async () => {
  await guardStaffRoute()
})
