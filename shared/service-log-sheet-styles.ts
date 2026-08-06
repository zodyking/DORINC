/**
 * Service log sheet styles — same DomPDF discipline as the invoice Blade templates.
 *
 * DomPDF facts this layout depends on (verified against dompdf 3.1):
 * - `<colgroup>` / `<col>` widths are never read; column widths come only from
 *   the cells themselves (Cellmap::add_frame).
 * - A cell width is only registered when `colspan === 1`, so a `colspan` title
 *   row cannot size columns.
 * - `table-layout: fixed` makes DomPDF size columns from the *first row only*.
 *   With a colspan title row first, every column collapses to an equal share —
 *   that is what shredded the previous sheet, so this layout stays on auto
 *   layout and puts percentage widths on the real cells (the invoice pattern).
 * - Absolute cell widths (pt/px) are downgraded to the cell's min content
 *   width, so percentages are the only reliable column sizing lever.
 * - A nested table set to `width: 100%` ignores the padding of the cell that
 *   contains it, so the two catalog columns are separated by a spacer column
 *   instead of padding (padding overflowed the right margin).
 * - `@page` margins are applied to the root `html` frame, so a `html { margin: 0 }`
 *   reset silently deletes every page margin and the sheet bleeds off the paper.
 *   Reset `body` only — exactly what the invoice Blade templates do.
 * - default_media_type is "screen": never ship screen paper chrome in PDF HTML.
 */
export const SERVICE_LOG_SHEET_PAGE_MARGIN_IN = 0.4

/**
 * Catalog column widths as percentages of the whole 9-column catalog table
 * (check + service + price + new, twice, plus the middle spacer).
 *
 * Sized from DejaVu Sans metrics at 7.4pt on a 7.7in content width: the longest
 * default service name ("Replace Step-Well Double-Blade Heater Motor") measures
 * 2.37in against 2.42in of text space, and "$3,750" bold measures 0.40in against
 * 0.42in, so default lines never wrap. Longer custom lines wrap instead of
 * stealing width from the neighbouring column.
 */
export const SERVICE_LOG_SHEET_COLUMN_WIDTHS = {
  check: '1.9%',
  name: '32.6%',
  price: '6.7%',
  newPrice: '7.3%',
  gap: '3%',
} as const

/** Shared document CSS for PDF + editor content (no @media screen). */
export const SERVICE_LOG_SHEET_DOCUMENT_CSS = `
* { box-sizing: border-box; }
/* Never set a margin on html: DomPDF stores @page margins on the root frame. */
body {
  margin: 0;
  padding: 0;
  background: #ffffff;
  color: #111111;
  font-family: DejaVu Sans, Helvetica, Arial, sans-serif;
  font-size: 7.5pt;
  line-height: 1.2;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
table { border-collapse: collapse; width: 100%; }
.page {
  width: 100%;
  margin: 0;
  padding: 0;
  background: #ffffff;
}
.page-back { page-break-before: always; }

/* ---------- header ---------- */
.header {
  border-bottom: 1.2pt solid #111111;
  margin: 0 0 4pt 0;
}
.header td { vertical-align: top; padding: 0 0 4pt 0; }
.header td.head-company { width: 58%; }
.header td.head-doc { width: 42%; }
.company-name {
  margin: 0;
  font-size: 11.5pt;
  line-height: 1.1;
  font-weight: 700;
}
.company-details {
  margin: 1.5pt 0 0;
  color: #4b5563;
  font-size: 7pt;
  line-height: 1.3;
}
.document-title { text-align: right; }
.document-title .doc-title {
  margin: 0;
  font-size: 12.5pt;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
}
.document-title .doc-sub {
  margin: 1.5pt 0 0;
  color: #4b5563;
  font-size: 6.5pt;
  line-height: 1.25;
}

/* ---------- customer fields ---------- */
.top-fields { margin-top: 4pt; }
.top-fields td { vertical-align: top; padding: 0 5pt 0 0; }
.top-fields td.f-customer { width: 40%; }
.top-fields td.f-invoice-date { width: 17%; }
.top-fields td.f-due-date { width: 17%; }
.top-fields td.f-unit { width: 26%; padding-right: 0; }
.field-label {
  display: block;
  margin: 0 0 1.5pt;
  color: #4b5563;
  font-size: 5.8pt;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.field-box {
  height: 14pt;
  border: 0.6pt solid #6b7280;
  background: #ffffff;
}
.complaint-field { margin-top: 4pt; }
.complaint-box {
  height: 18pt;
  border: 0.6pt solid #6b7280;
  background: #ffffff;
}

/* ---------- catalog grid (one flat table, two column groups) ---------- */
.catalog-grid { margin-top: 6pt; }
.catalog-grid thead { display: table-header-group; }
.catalog-grid td,
.catalog-grid th {
  padding: 0.8pt 3pt;
  vertical-align: middle;
  font-size: 7.4pt;
  line-height: 1.1;
}

/* Column widths live on the cells: DomPDF ignores <col> and only records a
   width when colspan is 1. */
.check-cell { width: ${SERVICE_LOG_SHEET_COLUMN_WIDTHS.check}; }
.service-name { width: ${SERVICE_LOG_SHEET_COLUMN_WIDTHS.name}; }
.price-cell { width: ${SERVICE_LOG_SHEET_COLUMN_WIDTHS.price}; }
.new-price-cell { width: ${SERVICE_LOG_SHEET_COLUMN_WIDTHS.newPrice}; }
.grid-gap { width: ${SERVICE_LOG_SHEET_COLUMN_WIDTHS.gap}; }

.catalog-grid th {
  border-bottom: 0.8pt solid #111111;
  padding-top: 0;
  padding-bottom: 1.5pt;
  color: #4b5563;
  font-size: 5.8pt;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
}
.catalog-grid th.price-cell,
.catalog-grid th.new-price-cell { text-align: center; }
.catalog-grid th.grid-gap { border-bottom: 0; }

/* Group box: side rails on the outer cells, hairlines between lines. */
.catalog-grid td.check-cell { border-left: 0.6pt solid #9ca3af; }
.catalog-grid td.price-cell,
.catalog-grid td.new-price-cell { border-left: 0.6pt solid #9ca3af; }
.catalog-grid td.new-price-cell { border-right: 0.6pt solid #9ca3af; }
.catalog-grid tbody td { border-bottom: 0.4pt solid #d7dbe0; }
.catalog-grid td.group-end { border-bottom: 0.6pt solid #9ca3af; }
.catalog-grid td.grid-gap,
.catalog-grid td.void-cell {
  border: 0;
  background: #ffffff;
}
.category-title {
  border-top: 0.6pt solid #9ca3af;
  border-bottom: 0.6pt solid #9ca3af;
  border-left: 0.6pt solid #9ca3af;
  border-right: 0.6pt solid #9ca3af;
  background: #f3f4f6;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.check-cell {
  text-align: center;
  padding-left: 1.5pt;
  padding-right: 1.5pt;
}
.checkbox {
  display: inline-block;
  width: 6.5pt;
  height: 6.5pt;
  border: 0.7pt solid #374151;
  vertical-align: middle;
}
.service-name { color: #111111; }
.service-subtext {
  display: block;
  margin: 0;
  color: #6b7280;
  font-size: 5.8pt;
  line-height: 1.05;
}
.price-cell {
  text-align: right;
  font-weight: 700;
  white-space: nowrap;
}
.empty-sheet {
  margin-top: 10pt;
  padding: 8pt;
  border: 0.6pt dashed #9ca3af;
  color: #4b5563;
  font-size: 8pt;
  text-align: center;
}

/* ---------- back page ---------- */
.back-title {
  margin: 6pt 0 2pt;
  font-size: 9pt;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.back-help {
  margin: 0 0 5pt;
  color: #4b5563;
  font-size: 7pt;
  line-height: 1.3;
}
.blank-work-table th,
.blank-work-table td {
  border: 0.6pt solid #9ca3af;
  padding: 0;
  vertical-align: middle;
}
.blank-work-table th {
  background: #f3f4f6;
  color: #374151;
  font-size: 7pt;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 3pt 4pt;
  text-align: left;
}
.blank-work-table th.w-desc,
.blank-work-table td.w-desc { width: 60%; }
.blank-work-table th.w-qty,
.blank-work-table td.w-qty { width: 18%; text-align: center; }
.blank-work-table th.w-total,
.blank-work-table td.w-total { width: 22%; text-align: center; }
.blank-work-table td { height: 20pt; }
.sign-row { margin-top: 8pt; }
.sign-row td {
  vertical-align: bottom;
  padding: 14pt 0 0;
}
.sign-row td.sign-left { width: 55%; padding-right: 24pt; }
.sign-row td.sign-right { width: 45%; }
.sign-line {
  border-top: 0.8pt solid #111111;
  padding-top: 3pt;
  color: #4b5563;
  font-size: 6pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
@page {
  size: Letter portrait;
  margin: ${SERVICE_LOG_SHEET_PAGE_MARGIN_IN}in;
}
`

/**
 * Browser-only paper chrome for the WYSIWYG editor.
 * Never include this in DomPDF HTML.
 */
export const SERVICE_LOG_SHEET_EDITOR_CHROME_CSS = `
.page {
  width: 8.5in;
  height: 11in;
  margin: 0 auto;
  padding: ${SERVICE_LOG_SHEET_PAGE_MARGIN_IN}in;
  box-sizing: border-box;
  background: #ffffff;
  box-shadow: 0 18px 50px -20px rgba(15, 23, 42, 0.45);
}
/* Form controls must not add intrinsic width, or the browser's auto table
   layout stops honouring the percentage column widths DomPDF uses. */
.page input {
  min-width: 0;
  max-width: 100%;
}
`
