/** Open the blank printable service log sheet (autoprint optional). */
export function serviceLogSheetPrintHref(options: { autoprint?: boolean } = {}): string {
  return options.autoprint
    ? '/api/service-logs/sheet/print?autoprint=1'
    : '/api/service-logs/sheet/print'
}

export async function openServiceLogSheetPrint(options: { autoprint?: boolean } = {}): Promise<void> {
  const opened = window.open(
    serviceLogSheetPrintHref(options),
    '_blank',
    'noopener,noreferrer',
  )
  if (!opened) {
    throw new Error('Pop-up blocked — allow pop-ups for this site to print the service log sheet')
  }
}
