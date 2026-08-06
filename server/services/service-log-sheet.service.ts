import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { catalogCategories, catalogItems } from '../db/schema/catalog'
import { parseMoney } from '../../shared/money'
import type { BusinessProfile, ServiceLogSheetSettings } from '../../shared/workspace-settings-defaults'
import {
  getBusinessProfile,
  getServiceLogSheetSettings,
  saveServiceLogSheetSettings,
} from './workspace-settings.service'

export interface ServiceLogSheetItem {
  id: string
  name: string
  description: string | null
  defaultPrice: string | null
  itemType: string
  categoryId: string | null
  categoryName: string | null
  categorySortOrder: number
  included: boolean
}

export interface ServiceLogSheetCategory {
  id: string | null
  name: string
  sortOrder: number
  items: Array<{
    id: string
    name: string
    description: string | null
    priceLabel: string
    itemType: string
  }>
}

export interface ServiceLogSheetPayload {
  settings: ServiceLogSheetSettings
  business: {
    businessName: string
    phone: string
    email: string
    addressLine: string
  }
  /** All active catalog items with inclusion flags (for the editor). */
  catalogItems: ServiceLogSheetItem[]
  /** Categories/items that will appear on the printed sheet. */
  categories: ServiceLogSheetCategory[]
  includedCount: number
  totalCatalogCount: number
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Format catalog prices for the paper sheet ($35 / $1,600 / $35.50). */
export function formatSheetPrice(value: string | null | undefined): string {
  if (value == null || value.trim() === '') return '—'
  const trimmed = value.trim()
  try {
    const cents = parseMoney(trimmed.startsWith('$') ? trimmed.slice(1) : trimmed)
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

async function loadActiveCatalogRows(db: Db) {
  return db.select({
    id: catalogItems.id,
    name: catalogItems.name,
    description: catalogItems.description,
    defaultPrice: catalogItems.defaultPrice,
    itemType: catalogItems.itemType,
    categoryId: catalogItems.categoryId,
    categoryName: catalogCategories.name,
    categorySortOrder: catalogCategories.sortOrder,
  })
    .from(catalogItems)
    .leftJoin(catalogCategories, eq(catalogItems.categoryId, catalogCategories.id))
    .where(isNull(catalogItems.archivedAt))
    .orderBy(
      asc(catalogCategories.sortOrder),
      asc(catalogCategories.name),
      asc(catalogItems.name),
    )
}

function includedSet(settings: ServiceLogSheetSettings, allIds: string[]): Set<string> {
  if (settings.mode === 'all') return new Set(allIds)
  return new Set(settings.itemIds)
}

function buildCategories(
  rows: Awaited<ReturnType<typeof loadActiveCatalogRows>>,
  included: Set<string>,
  options: { onlyIncluded: boolean },
): ServiceLogSheetCategory[] {
  const byCategory = new Map<string, ServiceLogSheetCategory>()

  for (const row of rows) {
    if (options.onlyIncluded && !included.has(row.id)) continue

    const key = row.categoryId ?? '__uncategorized__'
    let category = byCategory.get(key)
    if (!category) {
      category = {
        id: row.categoryId,
        name: row.categoryName?.trim() || 'Uncategorized',
        sortOrder: row.categorySortOrder ?? 9999,
        items: [],
      }
      byCategory.set(key, category)
    }

    category.items.push({
      id: row.id,
      name: row.name,
      description: row.description,
      priceLabel: formatSheetPrice(row.defaultPrice),
      itemType: row.itemType,
    })
  }

  return [...byCategory.values()].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.name.localeCompare(b.name)
  })
}

/** Balance categories into two print columns by approximate item count. */
export function splitCategoriesIntoColumns(
  categories: ServiceLogSheetCategory[],
): [ServiceLogSheetCategory[], ServiceLogSheetCategory[]] {
  const left: ServiceLogSheetCategory[] = []
  const right: ServiceLogSheetCategory[] = []
  let leftWeight = 0
  let rightWeight = 0

  for (const category of categories) {
    const weight = Math.max(1, category.items.length)
    if (leftWeight <= rightWeight) {
      left.push(category)
      leftWeight += weight
    }
    else {
      right.push(category)
      rightWeight += weight
    }
  }

  return [left, right]
}

export async function getServiceLogSheetPayload(db: Db): Promise<ServiceLogSheetPayload> {
  const [settings, business, rows] = await Promise.all([
    getServiceLogSheetSettings(db),
    getBusinessProfile(db),
    loadActiveCatalogRows(db),
  ])

  const allIds = rows.map(r => r.id)
  const included = includedSet(settings, allIds)

  // When mode is selected, order included items by itemIds sequence within categories
  let orderedRows = rows
  if (settings.mode === 'selected' && settings.itemIds.length) {
    const order = new Map(settings.itemIds.map((id, index) => [id, index]))
    orderedRows = [...rows].sort((a, b) => {
      const ai = order.get(a.id)
      const bi = order.get(b.id)
      if (ai != null && bi != null) return ai - bi
      if (ai != null) return -1
      if (bi != null) return 1
      return a.name.localeCompare(b.name)
    })
  }

  const catalogItemsList: ServiceLogSheetItem[] = rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    defaultPrice: row.defaultPrice,
    itemType: row.itemType,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    categorySortOrder: row.categorySortOrder ?? 9999,
    included: included.has(row.id),
  }))

  const categories = buildCategories(orderedRows, included, { onlyIncluded: true })

  return {
    settings,
    business: {
      businessName: business.businessName.trim() || 'Service Catalog',
      phone: business.phone.trim(),
      email: business.email.trim(),
      addressLine: formatBusinessAddress(business),
    },
    catalogItems: catalogItemsList,
    categories,
    includedCount: categories.reduce((sum, c) => sum + c.items.length, 0),
    totalCatalogCount: rows.length,
  }
}

export async function updateServiceLogSheetSettings(
  db: Db,
  input: ServiceLogSheetSettings,
  updatedBy: string,
): Promise<ServiceLogSheetSettings> {
  const parsed = await saveServiceLogSheetSettings(db, input, updatedBy)

  // Drop archived / unknown ids so the saved list stays clean
  if (parsed.mode === 'selected' && parsed.itemIds.length) {
    const existing = await db.select({ id: catalogItems.id })
      .from(catalogItems)
      .where(and(
        inArray(catalogItems.id, parsed.itemIds),
        isNull(catalogItems.archivedAt),
      ))
    const valid = new Set(existing.map(r => r.id))
    const cleanedIds = parsed.itemIds.filter(id => valid.has(id))
    if (cleanedIds.length !== parsed.itemIds.length) {
      return saveServiceLogSheetSettings(db, { mode: 'selected', itemIds: cleanedIds }, updatedBy)
    }
  }

  return parsed
}

function renderCategory(category: ServiceLogSheetCategory, showColumnHeader: boolean): string {
  const thead = showColumnHeader
    ? `<thead>
              <tr>
                <th></th>
                <th>Service</th>
                <th>Price / New Price</th>
              </tr>
            </thead>`
    : ''

  const bodyRows = category.items.map((item) => {
    const subtext = item.description?.trim()
      ? `<span class="service-subtext">${escapeHtml(item.description.trim())}</span>`
      : ''
    return `<tr>
                <td class="check-cell"><span class="checkbox"></span></td>
                <td class="service-name">${escapeHtml(item.name)}${subtext}</td>
                <td class="price-cell">
                  <div class="price-entry">
                    <span class="printed-price">${escapeHtml(item.priceLabel)}</span>
                    <span class="new-price"></span>
                  </div>
                </td>
              </tr>`
  }).join('\n')

  return `<section class="category">
          <div class="category-title">${escapeHtml(category.name)}</div>

          <table class="service-table">
            <colgroup>
              <col class="check-column">
              <col>
              <col class="price-column">
            </colgroup>
            ${thead}
            <tbody>
              ${bodyRows || `<tr><td colspan="3" class="service-name" style="color:#6b7280;">No services</td></tr>`}
            </tbody>
          </table>
        </section>`
}

function renderColumn(categories: ServiceLogSheetCategory[], includeHeaderOnFirst: boolean): string {
  return categories.map((category, index) =>
    renderCategory(category, includeHeaderOnFirst && index === 0),
  ).join('\n')
}

const SHEET_STYLES = `
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
    }
    body { padding: 20px; }
    .page {
      width: 8.5in;
      min-height: 11in;
      margin: 0 auto;
      padding: 0.28in 0.32in;
      background: #ffffff;
    }
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      padding-bottom: 10px;
      border-bottom: 2px solid #111827;
    }
    .company-name {
      margin: 0;
      font-size: 21px;
      line-height: 25px;
      font-weight: 800;
      letter-spacing: -0.3px;
    }
    .company-details {
      margin-top: 4px;
      color: #4b5563;
      font-size: 9px;
      line-height: 13px;
    }
    .document-title { text-align: right; }
    .document-title h1 {
      margin: 0;
      font-size: 16px;
      line-height: 20px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .document-title p {
      margin: 4px 0 0;
      color: #4b5563;
      font-size: 9px;
      line-height: 13px;
    }
    .top-fields {
      display: grid;
      grid-template-columns: 1.5fr 0.72fr 0.72fr 0.9fr;
      gap: 8px;
      margin-top: 10px;
    }
    .field { min-width: 0; }
    .field-label {
      display: block;
      margin-bottom: 3px;
      color: #374151;
      font-size: 8px;
      line-height: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .field-box {
      height: 28px;
      border: 1px solid #6b7280;
      background: #ffffff;
    }
    .complaint-field { margin-top: 8px; }
    .complaint-box {
      height: 54px;
      border: 1px solid #6b7280;
      background: repeating-linear-gradient(to bottom, #ffffff 0, #ffffff 17px, #d1d5db 18px);
    }
    .catalog-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      align-items: start;
      gap: 10px;
      margin-top: 10px;
    }
    .catalog-column {
      display: flex;
      flex-direction: column;
      gap: 7px;
      min-width: 0;
    }
    .category {
      border: 1px solid #9ca3af;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .category-title {
      padding: 4px 6px;
      border-bottom: 1px solid #9ca3af;
      background: #f3f4f6;
      font-size: 8px;
      line-height: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .service-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .service-table col.check-column { width: 20px; }
    .service-table col.price-column { width: 102px; }
    .service-table th {
      padding: 3px 4px;
      border-bottom: 1px solid #c7ccd3;
      color: #4b5563;
      font-size: 7px;
      line-height: 9px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .service-table th:nth-child(2) { text-align: left; }
    .service-table th:last-child { text-align: center; }
    .service-table td {
      min-height: 21px;
      padding: 3px 4px;
      border-bottom: 1px solid #d7dbe0;
      vertical-align: middle;
      font-size: 7.6px;
      line-height: 10px;
    }
    .service-table tr:last-child td { border-bottom: 0; }
    .check-cell { text-align: center; }
    .checkbox {
      display: inline-block;
      width: 10px;
      height: 10px;
      border: 1px solid #374151;
      vertical-align: middle;
    }
    .service-name { color: #111827; font-weight: 600; }
    .service-subtext {
      display: block;
      margin-top: 1px;
      color: #6b7280;
      font-size: 6.8px;
      line-height: 9px;
      font-weight: 400;
    }
    .price-cell { padding: 2px 3px !important; }
    .price-entry {
      display: grid;
      grid-template-columns: 38px 1fr;
      min-height: 17px;
      border: 1px solid #9ca3af;
      background: #ffffff;
    }
    .printed-price {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2px;
      border-right: 1px solid #9ca3af;
      font-size: 7px;
      line-height: 9px;
      font-weight: 700;
      white-space: nowrap;
    }
    .new-price { min-width: 0; background: #ffffff; }
    .empty-sheet {
      margin-top: 24px;
      padding: 16px;
      border: 1px dashed #9ca3af;
      color: #4b5563;
      font-size: 12px;
      text-align: center;
    }
    .print-toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin: -8px 0 12px;
      padding: 8px 0;
      background: #ffffff;
    }
    .print-toolbar button {
      appearance: none;
      border: 1px solid #cbd5e1;
      background: #0f172a;
      color: #ffffff;
      border-radius: 8px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    @page { size: Letter portrait; margin: 0; }
    @media print {
      html, body { width: 8.5in; height: 11in; }
      body { padding: 0; }
      .page { margin: 0; }
      .print-toolbar { display: none !important; }
    }
`

export function renderServiceLogSheetHtml(payload: ServiceLogSheetPayload): string {
  const { business, categories } = payload
  const [left, right] = splitCategoriesIntoColumns(categories)

  const detailsParts = [
    business.addressLine,
    [business.phone, business.email].filter(Boolean).join(' · '),
  ].filter(Boolean)

  const companyDetails = detailsParts.length
    ? detailsParts.map(line => escapeHtml(line)).join('<br>')
    : 'Update business profile in Control Panel'

  const catalogBody = categories.length
    ? `<section class="catalog-grid">
      <div class="catalog-column">
        ${renderColumn(left, true)}
      </div>
      <div class="catalog-column">
        ${renderColumn(right, false)}
      </div>
    </section>`
    : `<div class="empty-sheet">No catalog items are included on this service log sheet yet. Use <strong>Edit Service Log Sheet</strong> to choose parts, labor, and fees.</div>`

  const title = escapeHtml(business.businessName)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} Service Catalog</title>
  <style>${SHEET_STYLES}</style>
</head>
<body>
  <div class="print-toolbar">
    <button type="button" onclick="window.print()">Print</button>
  </div>
  <main class="page">
    <header class="header">
      <div>
        <h2 class="company-name">${title}</h2>
        <div class="company-details">${companyDetails}</div>
      </div>
      <div class="document-title">
        <h1>Service Catalog</h1>
        <p>Repair service pricing and work authorization</p>
      </div>
    </header>

    <section class="top-fields">
      <div class="field">
        <span class="field-label">Customer Name</span>
        <div class="field-box"></div>
      </div>
      <div class="field">
        <span class="field-label">Invoice Date</span>
        <div class="field-box"></div>
      </div>
      <div class="field">
        <span class="field-label">Due Date</span>
        <div class="field-box"></div>
      </div>
      <div class="field">
        <span class="field-label">Bus or Unit Number</span>
        <div class="field-box"></div>
      </div>
    </section>

    <section class="complaint-field">
      <span class="field-label">Customer Complaint or Vehicle Symptoms</span>
      <div class="complaint-box"></div>
    </section>

    ${catalogBody}
  </main>
  <script>
    (function () {
      var params = new URLSearchParams(window.location.search);
      if (params.get('autoprint') === '1') {
        window.addEventListener('load', function () {
          setTimeout(function () { window.print(); }, 250);
        });
      }
    })();
  </script>
</body>
</html>`
}

export const __testOnly = { escapeHtml }
