/**
 * Service log sheet styles — invoice DomPDF pattern.
 *
 * DomPDF notes (same engine as invoices):
 * - default_media_type is "screen" — never ship @media screen paper chrome in PDF HTML
 * - Use @page margins only; body fills the content box (no fixed 8.5in width)
 * - Prefer flat tables; nested tables + huge single-row grids get page-broken as a unit
 * - Keep front-page catalog dense enough to fit remaining Letter height or DomPDF
 *   leaves page 1 blank and dumps the whole grid on page 2
 */
export const SERVICE_LOG_SHEET_PAGE_MARGIN_IN = 0.4

/** Shared document CSS for PDF + editor content (no @media screen). */
export const SERVICE_LOG_SHEET_DOCUMENT_CSS = `
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: #ffffff;
  color: #111111;
  font-family: DejaVu Sans, Helvetica, Arial, sans-serif;
}
body {
  margin: 0;
  font-size: 7pt;
  line-height: 1.15;
  color: #111111;
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
.page-back {
  page-break-before: always;
}
.header {
  width: 100%;
  border-collapse: collapse;
  border-bottom: 1.25pt solid #111111;
  table-layout: fixed;
  margin: 0 0 3pt 0;
}
.header td {
  vertical-align: top;
  padding: 0 0 3pt 0;
}
.header td:first-child { width: 58%; padding-right: 6pt; }
.header td:last-child { width: 42%; }
.company-name {
  margin: 0;
  font-size: 11pt;
  line-height: 1.15;
  font-weight: 700;
}
.company-details {
  margin: 1pt 0 0;
  color: #4b5563;
  font-size: 7pt;
  line-height: 1.25;
}
.document-title { text-align: right; }
.document-title .doc-title {
  margin: 0;
  font-size: 12pt;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}
.document-title .doc-sub {
  margin: 1pt 0 0;
  color: #4b5563;
  font-size: 6.5pt;
  line-height: 1.2;
}
.top-fields {
  width: 100%;
  border-collapse: collapse;
  margin-top: 3pt;
  table-layout: fixed;
}
.top-fields td {
  vertical-align: top;
  padding: 0 3pt 0 0;
}
.top-fields td:last-child { padding-right: 0; }
.field-label {
  display: block;
  margin: 0 0 1pt;
  color: #4b5563;
  font-size: 5.5pt;
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.field-box {
  height: 13pt;
  border: 0.6pt solid #6b7280;
  background: #ffffff;
}
.complaint-field { margin-top: 3pt; }
.complaint-box {
  height: 18pt;
  border: 0.6pt solid #6b7280;
  background: #ffffff;
}
.catalog-grid {
  width: 100%;
  border-collapse: collapse;
  margin-top: 3pt;
  table-layout: fixed;
}
.catalog-grid > tbody > tr > td,
.catalog-grid > tr > td {
  width: 50%;
  vertical-align: top;
  padding: 0;
}
.catalog-grid > tbody > tr > td:first-child,
.catalog-grid > tr > td:first-child { padding-right: 3pt; }
.catalog-grid > tbody > tr > td:last-child,
.catalog-grid > tr > td:last-child { padding-left: 3pt; }
.col-label-row td {
  color: #4b5563;
  font-size: 5.5pt;
  line-height: 1.1;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0 0 1.5pt 0;
  border: 0;
}
.col-label-row .h-price { float: right; }
.category {
  width: 100%;
  border-collapse: collapse;
  border: 0.6pt solid #9ca3af;
  margin: 0 0 2pt 0;
  table-layout: fixed;
}
.category col.check-column { width: 10pt; }
.category col.price-column { width: 32pt; }
.category col.new-column { width: 28pt; }
.category-title {
  padding: 1.25pt 2pt;
  border-bottom: 0.6pt solid #9ca3af;
  background: #f3f4f6;
  font-size: 6.5pt;
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.category td {
  padding: 1pt 1.5pt;
  border-bottom: 0.4pt solid #d7dbe0;
  vertical-align: middle;
  font-size: 7pt;
  line-height: 1.12;
}
.category tr:last-child td { border-bottom: 0; }
.check-cell {
  text-align: center;
  width: 10pt;
  padding-left: 1pt !important;
  padding-right: 1pt !important;
}
.checkbox {
  display: inline-block;
  width: 6.5pt;
  height: 6.5pt;
  border: 0.6pt solid #374151;
  vertical-align: middle;
}
.service-name {
  color: #111111;
  font-weight: 600;
}
.service-subtext {
  display: block;
  margin: 0;
  color: #6b7280;
  font-size: 5.5pt;
  line-height: 1.05;
  font-weight: 400;
}
.price-cell,
.new-price-cell {
  width: 30pt;
  text-align: center;
  font-size: 6.5pt !important;
  font-weight: 700;
  white-space: nowrap;
  padding: 0.5pt 1pt !important;
  border-left: 0.6pt solid #9ca3af;
}
.price-cell {
  border-left: 0.6pt solid #9ca3af;
  background: #ffffff;
}
.new-price-cell {
  background: #ffffff;
}
.empty-sheet {
  margin-top: 10pt;
  padding: 8pt;
  border: 0.6pt dashed #9ca3af;
  color: #4b5563;
  font-size: 8pt;
  text-align: center;
}
.back-title {
  margin: 6pt 0 4pt;
  font-size: 9pt;
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.back-help {
  margin: 0 0 5pt;
  color: #4b5563;
  font-size: 7pt;
  line-height: 1.25;
}
.blank-work-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
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
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 3pt 4pt;
  text-align: left;
}
.blank-work-table th.qty,
.blank-work-table th.total,
.blank-work-table td.qty,
.blank-work-table td.total {
  text-align: center;
}
.blank-work-table col.desc { width: auto; }
.blank-work-table col.qty { width: 18%; }
.blank-work-table col.total { width: 22%; }
.blank-work-table td {
  height: 20pt;
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
body {
  background: #e2e8f0;
  padding: 24px 16px;
}
.page {
  width: 8.5in;
  min-height: 11in;
  margin: 0 auto 24px;
  padding: ${SERVICE_LOG_SHEET_PAGE_MARGIN_IN}in;
  box-sizing: border-box;
  box-shadow: 0 18px 50px -20px rgba(15, 23, 42, 0.45);
}
`

/** @deprecated Use SERVICE_LOG_SHEET_DOCUMENT_CSS (+ editor chrome separately). */
export const SERVICE_LOG_SHEET_CSS = SERVICE_LOG_SHEET_DOCUMENT_CSS
