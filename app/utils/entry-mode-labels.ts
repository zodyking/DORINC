/** Shared copy for voice vs upload/manual entry pickers across create flows. */

export const VOICE_ENTRY_PICK = {
  title: 'Use your voice',
  serviceLogDescription: 'Say each line — what was done, hours, and rate',
  invoiceDescription: 'Say each charge — labor, parts, services, and fees',
} as const

export const PHOTO_UPLOAD_PICK = {
  title: 'Upload photo',
  serviceLogDescription: 'Take a picture of your paper service log sheet',
} as const

export const MANUAL_ENTRY_PICK = {
  title: 'Type it in',
  description: 'Fill in the line table yourself',
} as const
