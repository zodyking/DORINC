/** Manage a blob URL for in-browser PDF preview (revoked on unmount). */
export function usePdfBlobUrl() {
  const url = ref('')

  function setFromBlob(blob: Blob) {
    revoke()
    url.value = URL.createObjectURL(blob)
  }

  function revoke() {
    if (url.value) {
      URL.revokeObjectURL(url.value)
      url.value = ''
    }
  }

  onUnmounted(revoke)

  return { url, setFromBlob, revoke }
}
