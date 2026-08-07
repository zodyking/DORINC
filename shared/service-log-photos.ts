/** Service log paper forms are front + back only. */
export const SERVICE_LOG_MAX_PHOTOS = 2

export function serviceLogPhotoSlotLabel(index: number): string {
  return index === 0 ? 'Front' : 'Back'
}

export function serviceLogNextPhotoPrompt(count: number): string {
  if (count <= 0) return 'Take a clear photo of the front'
  if (count === 1) return 'Now take the back'
  return 'Front and back ready'
}

export function serviceLogPhotoCountLabel(count: number): string {
  if (count <= 0) return 'No photos yet'
  if (count === 1) return '1 of 2 photos (front)'
  return '2 of 2 photos (front & back)'
}
