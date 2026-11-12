export class PrintError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrintError'
  }
}

export class TailscaleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TailscaleError'
  }
}
