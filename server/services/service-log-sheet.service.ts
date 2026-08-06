import { asc, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { catalogCategories, catalogItems } from '../db/schema/catalog'
import { parseMoney } from '../../shared/money'
import {
  defaultServiceLogSheetDocument,
  type ServiceLogSheetDocument,
  type ServiceLogSheetSection,
} from '../../shared/service-log-sheet-default'
import { SERVICE_LOG_SHEET_CSS } from '../../shared/service-log-sheet-styles'
import type { BusinessProfile } from '../../shared/workspace-settings-defaults'
import {
  getBusinessProfile,
  getServiceLogSheetSettings,
  saveServiceLogSheetSettings,
} from './workspace-settings.service'
import { renderHtmlPdfBuffer } from './laravel-pdf.service'

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

function sectionsByColumn(document: ServiceLogSheetDocument): {
  left: ServiceLogSheetSection[]
  right: ServiceLogSheetSection[]
} {
  return {
    left: document.sections.filter(s => s.column === 'left'),
    right: document.sections.filter(s => s.column === 'right'),
  }
}

function renderSectionHtml(section: ServiceLogSheetSection, showHeader: boolean): string {
  const thead = showHeader
    ? `<thead>
              <tr>
                <th></th>
                <th>Service</th>
                <th>Price / New Price</th>
              </tr>
            </thead>`
    : ''

  const rows = section.items.map((item) => {
    const subtext = item.subtext?.trim()
      ? `<span class="service-subtext">${escapeHtml(item.subtext.trim())}</span>`
      : ''
    const price = escapeHtml(item.price?.trim() || '—')
    return `<tr>
                <td class="check-cell"><span class="checkbox"></span></td>
                <td class="service-name">${escapeHtml(item.name)}${subtext}</td>
                <td class="price-cell">
                  <table class="price-entry"><tr>
                    <td class="printed-price">${price}</td>
                    <td class="new-price">&nbsp;</td>
                  </tr></table>
                </td>
              </tr>`
  }).join('\n')

  return `<section class="category">
          <div class="category-title">${escapeHtml(section.title)}</div>
          <table class="service-table">
            <colgroup>
              <col class="check-column">
              <col>
              <col class="price-column">
            </colgroup>
            ${thead}
            <tbody>
              ${rows || `<tr><td colspan="3" class="service-name" style="color:#6b7280;">No services</td></tr>`}
            </tbody>
          </table>
        </section>`
}

function renderColumnHtml(sections: ServiceLogSheetSection[], showHeaderOnFirst: boolean): string {
  return sections.map((section, index) =>
    renderSectionHtml(section, showHeaderOnFirst && index === 0),
  ).join('\n')
}

export function renderServiceLogSheetHtml(
  payload: ServiceLogSheetPayload,
  _options: { forPdf?: boolean } = {},
): string {
  const { business, document } = payload
  const { left, right } = sectionsByColumn(document)

  const companyDetails = [
    escapeHtml(business.addressLine),
    escapeHtml([business.phone, business.email].filter(Boolean).join(' · ')),
  ].filter(Boolean).join('<br>')

  const title = escapeHtml(business.businessName)
  const hasSections = left.length + right.length > 0

  const catalogBody = hasSections
    ? `<table class="catalog-grid">
      <tr>
        <td>${renderColumnHtml(left, true)}</td>
        <td>${renderColumnHtml(right, false)}</td>
      </tr>
    </table>`
    : `<div class="empty-sheet">No sections on this service log sheet yet. Use Edit Service Log Sheet to add categories and services.</div>`

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} Service Catalog</title>
  <style>${SERVICE_LOG_SHEET_CSS}</style>
</head>
<body>
  <main class="page">
    <table class="header">
      <tr>
        <td>
          <h2 class="company-name">${title}</h2>
          <div class="company-details">${companyDetails}</div>
        </td>
        <td class="document-title">
          <h1>Service Catalog</h1>
          <p>Repair service pricing and work authorization</p>
        </td>
      </tr>
    </table>

    <table class="top-fields">
      <tr>
        <td style="width:38%">
          <span class="field-label">Customer Name</span>
          <div class="field-box"></div>
        </td>
        <td style="width:18%">
          <span class="field-label">Invoice Date</span>
          <div class="field-box"></div>
        </td>
        <td style="width:18%">
          <span class="field-label">Due Date</span>
          <div class="field-box"></div>
        </td>
        <td style="width:26%">
          <span class="field-label">Bus or Unit Number</span>
          <div class="field-box"></div>
        </td>
      </tr>
    </table>

    <section class="complaint-field">
      <span class="field-label">Customer Complaint or Vehicle Symptoms</span>
      <div class="complaint-box"></div>
    </section>

    ${catalogBody}
  </main>
</body>
</html>`
}

export async function renderServiceLogSheetPdf(db: Db): Promise<Buffer> {
  const payload = await getServiceLogSheetPayload(db)
  const html = renderServiceLogSheetHtml(payload, { forPdf: true })
  return renderHtmlPdfBuffer(html, {
    paper: 'letter',
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
  })
}

export const __testOnly = { escapeHtml, sectionsByColumn }
