/**
 * Service log sheet styles — invoice DomPDF pattern.
 *
 * DomPDF is configured with default_media_type = "screen", so ANY @media screen
 * rules (fixed 8.5in page + padding) get applied during PDF render and cause
 * overflow/scaling/cropping. Keep document CSS media-query-free; put paper chrome
 * only in SERVICE_LOG_SHEET_EDITOR_CHROME_CSS for the WYSIWYG editor.
 */
export const SERVICE_LOG_SHEET_PAGE_MARGIN_IN = 0.5

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
  font-size: 8pt;
  line-height: 1.25;
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
  break-before: page;
}
.header {
  width: 100%;
  border-collapse: collapse;
  border-bottom: 1.5pt solid #111111;
  table-layout: fixed;
  margin: 0 0 6pt 0;
}
.header td {
  vertical-align: top;
  padding: 0 0 5pt 0;
}
.header td:first-child { width: 58%; padding-right: 8pt; }
.header td:last-child { width: 42%; }
.company-name {
  margin: 0 0 1pt;
  font-size: 11.5pt;
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.company-details {
  margin: 0;
  color: #4b5563;
  font-size: 7.5pt;
  line-height: 1.3;
}
.document-title { text-align: right; }
.document-title h1 {
  margin: 0;
  font-size: 12.5pt;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
}
.document-title p {
  margin: 2pt 0 0;
  color: #4b5563;
  font-size: 7pt;
  line-height: 1.25;
}
.top-fields {
  width: 100%;
  border-collapse: collapse;
  margin-top: 4pt;
  table-layout: fixed;
}
.top-fields td {
  vertical-align: top;
  padding: 0 4pt 0 0;
}
.top-fields td:last-child { padding-right: 0; }
.field-label {
  display: block;
  margin: 0 0 1pt;
  color: #374151;
  font-size: 6.5pt;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.field-box {
  height: 14pt;
  border: 0.75pt solid #6b7280;
  background: #ffffff;
}
.complaint-field { margin-top: 3pt; }
.complaint-box {
  height: 22pt;
  border: 0.75pt solid #6b7280;
  background: #ffffff;
}
.col-heads {
  width: 100%;
  border-collapse: collapse;
  margin-top: 5pt;
  table-layout: fixed;
}
.col-heads > tbody > tr > td,
.col-heads > tr > td {
  width: 50%;
  vertical-align: bottom;
  padding: 0 0 2pt 0;
}
.col-heads > tbody > tr > td:first-child,
.col-heads > tr > td:first-child { padding-right: 4pt; }
.col-heads > tbody > tr > td:last-child,
.col-heads > tr > td:last-child { padding-left: 4pt; }
.col-head-inner {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.col-head-inner td {
  color: #4b5563;
  font-size: 6.5pt;
  line-height: 1.2;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0;
}
.col-head-inner .h-service { text-align: left; }
.col-head-inner .h-price {
  width: 56pt;
  text-align: center;
}
.catalog-grid {
  width: 100%;
  border-collapse: collapse;
  margin-top: 0;
  table-layout: fixed;
}
.catalog-grid > tbody > tr > td,
.catalog-grid > tr > td {
  width: 50%;
  vertical-align: top;
  padding: 0;
}
.catalog-grid > tbody > tr > td:first-child,
.catalog-grid > tr > td:first-child {
  padding-right: 4pt;
}
.catalog-grid > tbody > tr > td:last-child,
.catalog-grid > tr > td:last-child {
  padding-left: 4pt;
}
.category {
  border: 0.75pt solid #9ca3af;
  margin: 0 0 2.5pt 0;
}
.category-title {
  padding: 1.5pt 3pt;
  border-bottom: 0.75pt solid #9ca3af;
  background: #f3f4f6;
  font-size: 7.5pt;
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.service-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.service-table col.check-column { width: 11pt; }
.service-table col.price-column { width: 56pt; }
.service-table td {
  padding: 1.25pt 2pt;
  border-bottom: 0.5pt solid #d7dbe0;
  vertical-align: middle;
  font-size: 8pt;
  line-height: 1.12;
  overflow: hidden;
}
.service-table tr:last-child td { border-bottom: 0; }
.check-cell { text-align: center; width: 11pt; }
.checkbox {
  display: inline-block;
  width: 7pt;
  height: 7pt;
  border: 0.75pt solid #374151;
  vertical-align: middle;
}
.service-name {
  color: #111111;
  font-weight: 600;
  overflow: hidden;
}
.service-subtext {
  display: block;
  margin-top: 0;
  color: #6b7280;
  font-size: 6.5pt;
  line-height: 1.1;
  font-weight: 400;
}
.price-cell { padding: 1pt !important; width: 56pt; }
.price-entry {
  width: 100%;
  border-collapse: collapse;
  border: 0.75pt solid #9ca3af;
  table-layout: fixed;
}
.price-entry td {
  border: 0 !important;
  padding: 1pt 1pt !important;
  font-size: 7pt !important;
  line-height: 1.1 !important;
  vertical-align: middle !important;
  height: 10.5pt;
  overflow: hidden;
}
.price-entry .printed-price {
  width: 50%;
  text-align: center;
  border-right: 0.75pt solid #9ca3af !important;
  font-weight: 700;
  white-space: nowrap;
}
.price-entry .new-price {
  width: 50%;
}
.empty-sheet {
  margin-top: 12pt;
  padding: 10pt;
  border: 0.75pt dashed #9ca3af;
  color: #4b5563;
  font-size: 9pt;
  text-align: center;
}
.back-title {
  margin: 8pt 0 6pt;
  font-size: 10pt;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.back-help {
  margin: 0 0 6pt;
  color: #4b5563;
  font-size: 7.5pt;
  line-height: 1.3;
}
.blank-work-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.blank-work-table th,
.blank-work-table td {
  border: 0.75pt solid #9ca3af;
  padding: 0;
  vertical-align: middle;
}
.blank-work-table th {
  background: #f3f4f6;
  color: #374151;
  font-size: 7.5pt;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 3pt 5pt;
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
  height: 22pt;
}
@page {
  size: Letter portrait;
  margin: ${SERVICE_LOG_SHEET_PAGE_MARGIN_IN}in;
}
`

/**
 * Browser-only paper chrome for the WYSIWYG editor / HTML preview.
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
