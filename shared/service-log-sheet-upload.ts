/** Stable public landing opened from the printed service log sheet QR. */
export const SERVICE_LOG_SHEET_UPLOAD_PATH = '/upload/service-log/sheet'

export const SERVICE_LOG_SHEET_UPLOAD_TITLE = 'Scan to Upload'

/** Short help printed under the sheet QR (bottom-right void under Inspection). */
export const SERVICE_LOG_SHEET_UPLOAD_HELP
  = 'Upload this paper log to DORINC SUITE — alerts the team an invoice needs to be made.'

/** @deprecated Use SERVICE_LOG_SHEET_UPLOAD_TITLE + HELP */
export const SERVICE_LOG_SHEET_UPLOAD_CAPTION = 'Scan to Upload'

/** Build absolute URL encoded in the printed sheet QR. */
export function serviceLogSheetUploadUrl(appUrl: string): string {
  const base = appUrl.replace(/\/$/, '')
  return `${base}${SERVICE_LOG_SHEET_UPLOAD_PATH}`
}

export function isServiceLogSheetUploadPath(path: string): boolean {
  const clean = path.split('?')[0]?.split('#')[0] ?? ''
  return clean === SERVICE_LOG_SHEET_UPLOAD_PATH
    || clean === `${SERVICE_LOG_SHEET_UPLOAD_PATH}/`
}
