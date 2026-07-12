/** Safari and legacy browsers request /favicon.ico directly. */
export default defineEventHandler((event) => {
  return sendRedirect(event, '/images/dorinc-icon-trans.png', 308)
})
