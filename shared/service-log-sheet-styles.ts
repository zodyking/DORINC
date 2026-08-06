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
 * - `@page` margins are applied to the root `html` frame, so a `html { margin: 0 }`
 *   reset silently deletes every page margin and the sheet bleeds off the paper.
 *   Reset the sheet root only — exactly what the invoice Blade templates do.
 * - default_media_type is "screen": never ship screen paper chrome in PDF HTML.
 *
 * Every rule is scoped under `.sheet-doc` (the PDF sets it on <body>, the editor
 * on the paper wrapper) so the exact same CSS can be injected into the app
 * without leaking 7pt type and collapsed tables into the rest of the UI.
 */
export const SERVICE_LOG_SHEET_PAGE_MARGIN_IN = 0.4

/** Class that marks the sheet root in both the PDF body and the editor paper. */
export const SERVICE_LOG_SHEET_SCOPE_CLASS = 'sheet-doc'

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

/**
 * Shared document CSS for the PDF and the editor paper.
 * No @media screen, no @page, no rules outside `.sheet-doc`.
 */
export const SERVICE_LOG_SHEET_DOCUMENT_CSS = `
.sheet-doc, .sheet-doc * { box-sizing: border-box; }
.sheet-doc {
  margin: 0;
  padding: 0;
  background: #ffffff;
  color: #111111;
  font-family: DejaVu Sans, Helvetica, Arial, sans-serif;
  font-size: 7.4pt;
  line-height: 1.2;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.sheet-doc table { border-collapse: collapse; width: 100%; }
.sheet-doc .page {
  width: 100%;
  margin: 0;
  padding: 0;
  background: #ffffff;
}
.sheet-doc .page-back { page-break-before: always; }

/* ---------- header ---------- */
.sheet-doc .header {
  border-bottom: 1.2pt solid #111111;
  margin: 0 0 4pt 0;
}
.sheet-doc .header td { vertical-align: top; padding: 0 0 4pt 0; }
.sheet-doc .header td.head-company { width: 58%; }
.sheet-doc .header td.head-doc { width: 42%; }
.sheet-doc .company-name {
  margin: 0;
  font-size: 11.5pt;
  line-height: 1.1;
  font-weight: 700;
}
.sheet-doc .company-details {
  margin: 1.5pt 0 0;
  color: #4b5563;
  font-size: 7pt;
  line-height: 1.3;
}
.sheet-doc .document-title { text-align: right; }
.sheet-doc .document-title .doc-title {
  margin: 0;
  font-size: 12.5pt;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
}
.sheet-doc .document-title .doc-sub {
  margin: 1.5pt 0 0;
  color: #4b5563;
  font-size: 6.5pt;
  line-height: 1.25;
}

/* ---------- customer fields ---------- */
.sheet-doc .top-fields { margin-top: 4pt; }
.sheet-doc .top-fields td { vertical-align: top; padding: 0 5pt 0 0; }
.sheet-doc .top-fields td.f-customer { width: 40%; }
.sheet-doc .top-fields td.f-invoice-date { width: 17%; }
.sheet-doc .top-fields td.f-due-date { width: 17%; }
.sheet-doc .top-fields td.f-unit { width: 26%; padding-right: 0; }
.sheet-doc .field-label {
  display: block;
  margin: 0 0 1.5pt;
  color: #4b5563;
  font-size: 5.8pt;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.sheet-doc .field-box {
  height: 14pt;
  border: 0.6pt solid #6b7280;
  background: #ffffff;
}
.sheet-doc .complaint-field { margin-top: 4pt; }
.sheet-doc .complaint-box {
  height: 18pt;
  border: 0.6pt solid #6b7280;
  background: #ffffff;
}

/* ---------- catalog grid (one flat table, two column groups) ---------- */
.sheet-doc .catalog-grid { margin-top: 6pt; }
.sheet-doc .catalog-grid thead { display: table-header-group; }
.sheet-doc .catalog-grid td,
.sheet-doc .catalog-grid th {
  padding: 0.8pt 3pt;
  vertical-align: middle;
  font-size: 7.4pt;
  line-height: 1.1;
}

/* Column widths live on the cells: DomPDF ignores <col> and only records a
   width when colspan is 1. */
.sheet-doc .check-cell { width: ${SERVICE_LOG_SHEET_COLUMN_WIDTHS.check}; }
.sheet-doc .service-name { width: ${SERVICE_LOG_SHEET_COLUMN_WIDTHS.name}; }
.sheet-doc .price-cell { width: ${SERVICE_LOG_SHEET_COLUMN_WIDTHS.price}; }
.sheet-doc .new-price-cell { width: ${SERVICE_LOG_SHEET_COLUMN_WIDTHS.newPrice}; }
.sheet-doc .grid-gap { width: ${SERVICE_LOG_SHEET_COLUMN_WIDTHS.gap}; }

.sheet-doc .catalog-grid th {
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
.sheet-doc .catalog-grid th.price-cell,
.sheet-doc .catalog-grid th.new-price-cell { text-align: center; }
.sheet-doc .catalog-grid th.grid-gap { border-bottom: 0; }

/* Group box: side rails on the outer cells, hairlines between lines. */
.sheet-doc .catalog-grid td.check-cell { border-left: 0.6pt solid #9ca3af; }
.sheet-doc .catalog-grid td.price-cell,
.sheet-doc .catalog-grid td.new-price-cell { border-left: 0.6pt solid #9ca3af; }
.sheet-doc .catalog-grid td.new-price-cell { border-right: 0.6pt solid #9ca3af; }
.sheet-doc .catalog-grid tbody td { border-bottom: 0.4pt solid #d7dbe0; }
.sheet-doc .catalog-grid td.group-end { border-bottom: 0.6pt solid #9ca3af; }
.sheet-doc .catalog-grid td.grid-gap,
.sheet-doc .catalog-grid td.void-cell {
  border: 0;
  background: #ffffff;
}
.sheet-doc .category-title {
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
.sheet-doc .check-cell {
  text-align: center;
  padding-left: 1.5pt;
  padding-right: 1.5pt;
}
.sheet-doc .checkbox {
  display: inline-block;
  width: 6.5pt;
  height: 6.5pt;
  border: 0.7pt solid #374151;
  vertical-align: middle;
}
.sheet-doc .service-name { color: #111111; }
.sheet-doc .service-subtext {
  display: block;
  margin: 0;
  color: #6b7280;
  font-size: 5.8pt;
  line-height: 1.05;
}
.sheet-doc .price-cell {
  text-align: right;
  font-weight: 700;
  white-space: nowrap;
}
.sheet-doc .empty-sheet {
  margin-top: 10pt;
  padding: 8pt;
  border: 0.6pt dashed #9ca3af;
  color: #4b5563;
  font-size: 8pt;
  text-align: center;
}

/* ---------- back page ---------- */
.sheet-doc .back-title {
  margin: 6pt 0 2pt;
  font-size: 9pt;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.sheet-doc .back-help {
  margin: 0 0 5pt;
  color: #4b5563;
  font-size: 7pt;
  line-height: 1.3;
}
.sheet-doc .blank-work-table th,
.sheet-doc .blank-work-table td {
  border: 0.6pt solid #9ca3af;
  padding: 0;
  vertical-align: middle;
}
.sheet-doc .blank-work-table th {
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
.sheet-doc .blank-work-table th.w-desc,
.sheet-doc .blank-work-table td.w-desc { width: 60%; }
.sheet-doc .blank-work-table th.w-qty,
.sheet-doc .blank-work-table td.w-qty { width: 18%; text-align: center; }
.sheet-doc .blank-work-table th.w-total,
.sheet-doc .blank-work-table td.w-total { width: 22%; text-align: center; }
.sheet-doc .blank-work-table td { height: 20pt; }
.sheet-doc .sign-row { margin-top: 8pt; }
.sheet-doc .sign-row td {
  vertical-align: bottom;
  padding: 14pt 0 0;
}
.sheet-doc .sign-row td.sign-left { width: 55%; padding-right: 24pt; }
.sheet-doc .sign-row td.sign-right { width: 45%; }
.sheet-doc .sign-line {
  border-top: 0.8pt solid #111111;
  padding-top: 3pt;
  color: #4b5563;
  font-size: 6pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
`

/** Letter page box for DomPDF. Never include @page in browser-injected CSS. */
export const SERVICE_LOG_SHEET_PAGE_CSS = `
@page {
  size: Letter portrait;
  margin: ${SERVICE_LOG_SHEET_PAGE_MARGIN_IN}in;
}
`

/** Full stylesheet shipped inside the PDF HTML. */
export const SERVICE_LOG_SHEET_PDF_CSS =
  `${SERVICE_LOG_SHEET_PAGE_CSS}${SERVICE_LOG_SHEET_DOCUMENT_CSS}`

/**
 * Browser-only paper chrome for the WYSIWYG editor: turns the two page divs into
 * real 8.5x11in sheets. Never include this in DomPDF HTML.
 */
export const SERVICE_LOG_SHEET_EDITOR_CHROME_CSS = `
.sheet-doc .page {
  width: 8.5in;
  height: 11in;
  padding: ${SERVICE_LOG_SHEET_PAGE_MARGIN_IN}in;
  background: #ffffff;
  box-shadow: 0 18px 50px -20px rgba(15, 23, 42, 0.45);
}
/* Form controls must not add intrinsic width, or the browser's auto table
   layout stops honouring the percentage column widths DomPDF uses. */
.sheet-doc .page input {
  min-width: 0;
  max-width: 100%;
}
`
