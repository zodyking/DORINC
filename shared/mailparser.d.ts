declare module 'mailparser' {
  export interface EmailAddress {
    address?: string
    name?: string
  }

  export interface AddressObject {
    value: EmailAddress[]
    text: string
  }

  export interface Attachment {
    filename?: string
    content?: Buffer | string
    contentType?: string
  }

  export interface ParsedMail {
    from?: AddressObject
    to?: AddressObject | AddressObject[]
    cc?: AddressObject | AddressObject[]
    subject?: string
    text?: string
    html?: string | false
    messageId?: string
    attachments?: Attachment[]
  }

  export function simpleParser(source: Buffer | string | NodeJS.ReadableStream): Promise<ParsedMail>
}
