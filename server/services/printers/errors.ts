export class PrintError extends Error {
  status: number
  constructor(message: string, status = 422) {
    super(message)
    this.name = 'PrintError'
    this.status = status
  }
}

/** The print engine container is not answering (starting, stopped, or not deployed). */
export class PrintEngineUnavailable extends PrintError {
  constructor(message = 'The print service is starting. Try again in a moment.') {
    super(message, 503)
    this.name = 'PrintEngineUnavailable'
  }
}
