import { asc, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { catalogCategories, catalogItems } from '../db/schema/catalog'
import { parseMoney } from '../../shared/money'
import {
  defaultServiceLogSheetDocument,
  type ServiceLogSheetDocument,
} from '../../shared/service-log-sheet-default'
import {
  sectionsByColumn,
  sheetGridRows,
  sheetRightTrailingVoid,
  type SheetColumnRow,
} from '../../shared/service-log-sheet-layout'
import {
  SERVICE_LOG_SHEET_PAGE_MARGIN_IN,
  SERVICE_LOG_SHEET_PDF_CSS,
  SERVICE_LOG_SHEET_SCOPE_CLASS,
} from '../../shared/service-log-sheet-styles'
import {
  SERVICE_LOG_SHEET_UPLOAD_HELP,
  SERVICE_LOG_SHEET_UPLOAD_TITLE,
} from '../../shared/service-log-sheet-upload'
import type { BusinessProfile } from '../../shared/workspace-settings-defaults'
import {
  getBusinessProfile,
  getServiceLogSheetSettings,
  saveServiceLogSheetSettings,
} from './workspace-settings.service'
import { renderHtmlPdfBuffer } from './laravel-pdf.service'
import { buildServiceLogSheetUploadQrDataUrl } from './service-log-sheet-upload.service'

export interface CatalogPickItem {
  id: string
  name: string
  description: string | null
  defaultPrice: string | null
  itemType: string
  categoryName: string | null
}

export interface ServiceLogSheetPayload {
  document: ServiceLogSheetDocument
  business: {
    businessName: string
    phone: string
    email: string
    addressLine: string
  }
  catalogItems: CatalogPickItem[]
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Format money for sheet display ($35 / $1,600 / $35.50). */
export function formatSheetPrice(value: string | null | undefined): string {
  if (value == null || value.trim() === '') return ''
  const trimmed = value.trim()
  if (trimmed.startsWith('$')) {
    // Normalize existing $ labels
    try {
      return formatSheetPrice(trimmed.slice(1).replace(/,/g, ''))
    }
    catch {
      return trimmed
    }
  }
  try {
    const cents = parseMoney(trimmed.replace(/,/g, ''))
    const negative = cents < 0n
    const abs = negative ? -cents : cents
    const whole = abs / 100n
    const frac = abs % 100n
    const withCommas = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    const sign = negative ? '-' : ''
    if (frac === 0n) return `$${sign}${withCommas}`
    return `$${sign}${withCommas}.${frac.toString().padStart(2, '0')}`
  }
  catch {
    return trimmed.startsWith('$') ? trimmed : `$${trimmed}`
  }
}

function formatBusinessAddress(profile: BusinessProfile): string {
  const cityStateZip = [profile.city, profile.state].filter(Boolean).join(', ')
    + (profile.postalCode ? ` ${profile.postalCode}` : '')
  return [profile.addressLine1, profile.addressLine2, cityStateZip.trim()]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(', ')
}

async function loadCatalogPicks(db: Db): Promise<CatalogPickItem[]> {
  const rows = await db.select({
    id: catalogItems.id,
    name: catalogItems.name,
    description: catalogItems.description,
    defaultPrice: catalogItems.defaultPrice,
    itemType: catalogItems.itemType,
    categoryName: catalogCategories.name,
  })
    .from(catalogItems)
    .leftJoin(catalogCategories, eq(catalogItems.categoryId, catalogCategories.id))
    .where(isNull(catalogItems.archivedAt))
    .orderBy(asc(catalogItems.name))

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    defaultPrice: row.defaultPrice,
    itemType: row.itemType,
    categoryName: row.categoryName,
  }))
}

export async function getServiceLogSheetPayload(db: Db): Promise<ServiceLogSheetPayload> {
  const [document, business, catalog] = await Promise.all([
    getServiceLogSheetSettings(db),
    getBusinessProfile(db),
    loadCatalogPicks(db),
  ])

  return {
    document,
    business: {
      businessName: business.businessName.trim() || 'Devon Onsite Repairs INC',
      phone: business.phone.trim() || '(646) 731-7021',
      email: business.email.trim() || 'accounting@devononsiterepairs.com',
      addressLine: formatBusinessAddress(business) || '387 Van Siclen Ave, Brooklyn, NY 11207',
    },
    catalogItems: catalog,
  }
}

export async function updateServiceLogSheetDocument(
  db: Db,
  input: ServiceLogSheetDocument,
  updatedBy: string,
): Promise<ServiceLogSheetDocument> {
  return saveServiceLogSheetSettings(db, input, updatedBy)
}

export async function resetServiceLogSheetDocument(
  db: Db,
  updatedBy: string,
): Promise<ServiceLogSheetDocument> {
  return saveServiceLogSheetSettings(db, defaultServiceLogSheetDocument(), updatedBy)
}

/** One column group of a catalog row: check | service | price | new. */
function renderGroupCells(row: SheetColumnRow | null, groupEnd: boolean): string {
  if (!row) {
    return `<td class="void-cell"></td>
              <td class="void-cell"></td>
              <td class="void-cell"></td>
              <td class="void-cell"></td>`
  }

  if (row.kind === 'title') {
    return `<td colspan="4" class="category-title">${escapeHtml(row.title)}</td>`
  }

  const item = row.item
  const subtext = item.subtext?.trim()
    ? `<span class="service-subtext">${escapeHtml(item.subtext.trim())}</span>`
    : ''
  const price = escapeHtml(item.price?.trim() || '—')
  const end = groupEnd ? ' group-end' : ''

  return `<td class="check-cell${end}"><span class="checkbox"></span></td>
              <td class="service-name${end}">${escapeHtml(item.name)}${subtext}</td>
              <td class="price-cell${end}">${price}</td>
              <td class="new-price-cell${end}">&nbsp;</td>`
}

function renderUploadQrCellHtml(dataUrl: string, rowspan: number): string {
  return `<td colspan="4" rowspan="${rowspan}" class="sheet-upload-qr-cell">
                <div class="sheet-upload-qr-inner">
                  <p class="sheet-upload-qr-title">${escapeHtml(SERVICE_LOG_SHEET_UPLOAD_TITLE)}</p>
                  <img
                    class="sheet-upload-qr-img"
                    src="${dataUrl}"
                    alt="${escapeHtml(SERVICE_LOG_SHEET_UPLOAD_TITLE)}"
                  />
                  <p class="sheet-upload-qr-help">${escapeHtml(SERVICE_LOG_SHEET_UPLOAD_HELP)}</p>
                </div>
              </td>`
}

/**
 * Catalog rows with the scan QR seated in the trailing right-column void
 * (under Inspection), so DomPDF keeps it on page 1 instead of spilling after
 * the full-height left column.
 */
function renderCatalogRowsHtml(
  document: ServiceLogSheetDocument,
  uploadQrDataUrl?: string | null,
): string {
  const rows = sheetGridRows(document)
  const voidInfo = uploadQrDataUrl ? sheetRightTrailingVoid(document) : null
  // Seat QR in the empty right-column pocket (needs a few void rows).
  const qrRowspan = voidInfo && voidInfo.rowCount >= 3 ? voidInfo.rowCount : 0
  const qrStart = qrRowspan > 0 ? voidInfo!.startIndex : -1

  return rows.map((row, index) => {
    let rightHtml: string
    if (qrRowspan > 0 && index === qrStart) {
      rightHtml = renderUploadQrCellHtml(uploadQrDataUrl!, qrRowspan)
    }
    else if (qrRowspan > 0 && index > qrStart && index < qrStart + qrRowspan) {
      rightHtml = ''
    }
    else {
      rightHtml = renderGroupCells(row.right, row.rightEnd)
    }

    return `<tr>
              ${renderGroupCells(row.left, row.leftEnd)}
              <td class="grid-gap"></td>
              ${rightHtml}
            </tr>`
  }).join('\n')
}

const BLANK_WORK_ROWS = 24

function renderBlankWorkRows(count: number): string {
  return Array.from({ length: count }, () => `<tr>
      <td class="w-desc">&nbsp;</td>
      <td class="w-qty">&nbsp;</td>
      <td class="w-total">&nbsp;</td>
    </tr>`).join('\n')
}

function renderSheetHeaderHtml(businessName: string, companyDetails: string): string {
  // Invoice-style: plain table + divs (avoid h1/h2 default DomPDF spacing quirks).
  return `<table class="header">
      <tr>
        <td class="head-company">
          <div class="company-name">${businessName}</div>
          <div class="company-details">${companyDetails}</div>
        </td>
        <td class="head-doc document-title">
          <div class="doc-title">Service Log Sheet</div>
          <div class="doc-sub">Blank field log and work authorization</div>
        </td>
      </tr>
    </table>`
}

export function renderServiceLogSheetHtml(
  payload: ServiceLogSheetPayload,
  opts: {
    forPdf?: boolean
    uploadQrDataUrl?: string | null
  } = {},
): string {
  const { business, document } = payload
  const { left, right } = sectionsByColumn(document)

  const companyDetails = [
    escapeHtml(business.addressLine),
    escapeHtml([business.phone, business.email].filter(Boolean).join(' · ')),
  ].filter(Boolean).join('<br>')

  const title = escapeHtml(business.businessName)
  const hasSections = left.length + right.length > 0

  // One flat table: DomPDF cannot split a table containing nested tables, so a
  // nested grid that outgrows page 1 moves wholesale to page 2 and leaves the
  // first page blank. Flat rows split like invoice line items and repeat <thead>.
  // QR lives inside the trailing right-column void (under Inspection) via rowspan
  // so it stays on page 1 in the bottom-right pocket.
  const catalogBody = hasSections
    ? `<table class="catalog-grid">
      <thead>
        <tr>
          <th class="check-cell"></th>
          <th class="service-name">Service</th>
          <th class="price-cell">Price</th>
          <th class="new-price-cell">Price</th>
          <th class="grid-gap"></th>
          <th class="check-cell"></th>
          <th class="service-name">Service</th>
          <th class="price-cell">Price</th>
          <th class="new-price-cell">Price</th>
        </tr>
      </thead>
      <tbody>
        ${renderCatalogRowsHtml(document, opts.uploadQrDataUrl)}
      </tbody>
    </table>`
    : `<div class="empty-sheet">No sections on this service log sheet yet. Use Edit Template to add categories and services.</div>`

  const header = renderSheetHeaderHtml(title, companyDetails)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} Service Log Sheet</title>
  <style>${SERVICE_LOG_SHEET_PDF_CSS}</style>
</head>
<body class="${SERVICE_LOG_SHEET_SCOPE_CLASS}">
  <div class="page page-front">
    ${header}

    <table class="top-fields">
      <tr>
        <td class="f-customer">
          <span class="field-label">Customer Name</span>
          <div class="field-box"></div>
        </td>
        <td class="f-unit">
          <span class="field-label">Bus or Unit Number</span>
          <div class="field-box"></div>
        </td>
        <td class="f-invoice-date">
          <span class="field-label">Invoice Date</span>
          <div class="field-box"></div>
        </td>
        <td class="f-due-date">
          <span class="field-label">Due Date</span>
          <div class="field-box"></div>
        </td>
      </tr>
    </table>

    <div class="complaint-field">
      <span class="field-label">Customer Complaint or Vehicle Symptoms</span>
      <div class="complaint-box"></div>
    </div>

    ${catalogBody}
  </div>

  <div class="page page-back">
    ${header}
    <div class="back-title">Additional / Custom Work</div>
    <div class="back-help">Use these lines for work not listed on the front — write service description, quantity, and total.</div>
    <table class="blank-work-table">
      <thead>
        <tr>
          <th class="w-desc">Service Description</th>
          <th class="w-qty">Quantity</th>
          <th class="w-total">Total</th>
        </tr>
      </thead>
      <tbody>
        ${renderBlankWorkRows(BLANK_WORK_ROWS)}
      </tbody>
    </table>
  </div>
</body>
</html>`
}

export async function renderServiceLogSheetPdf(
  db: Db,
  documentOverride?: ServiceLogSheetDocument | null,
): Promise<Buffer> {
  const payload = await getServiceLogSheetPayload(db)
  if (documentOverride) payload.document = documentOverride
  const qr = await buildServiceLogSheetUploadQrDataUrl()
  const html = renderServiceLogSheetHtml(payload, {
    forPdf: true,
    uploadQrDataUrl: qr.dataUrl,
  })
  const m = SERVICE_LOG_SHEET_PAGE_MARGIN_IN
  return renderHtmlPdfBuffer(html, {
    paper: 'letter',
    margins: { top: m, right: m, bottom: m, left: m },
  })
}

export const __testOnly = { escapeHtml, sectionsByColumn }
