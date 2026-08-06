/**
 * Shared Letter service-catalog sheet CSS.
 * Tuned to fit the default template on a single 8.5×11 page (browser + DomPDF).
 */
export const SERVICE_LOG_SHEET_CSS = `
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: #ffffff;
  color: #111827;
  font-family: Arial, Helvetica, sans-serif;
}
body { padding: 0; }
.page {
  width: 8.5in;
  height: 11in;
  max-height: 11in;
  margin: 0 auto;
  padding: 0.22in 0.28in 0.18in;
  background: #ffffff;
  overflow: hidden;
}
.header {
  width: 100%;
  border-collapse: collapse;
  border-bottom: 1.5pt solid #111827;
}
.header td {
  vertical-align: top;
  padding: 0 0 6px 0;
}
.company-name {
  margin: 0;
  font-size: 18px;
  line-height: 20px;
  font-weight: 800;
  letter-spacing: -0.3px;
}
.company-details {
  margin-top: 2px;
  color: #4b5563;
  font-size: 8px;
  line-height: 11px;
}
.document-title { text-align: right; }
.document-title h1 {
  margin: 0;
  font-size: 14px;
  line-height: 16px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.document-title p {
  margin: 2px 0 0;
  color: #4b5563;
  font-size: 8px;
  line-height: 10px;
}
.top-fields {
  width: 100%;
  border-collapse: collapse;
  margin-top: 6px;
}
.top-fields td {
  vertical-align: top;
  padding: 0 4px 0 0;
}
.top-fields td:last-child { padding-right: 0; }
.field-label {
  display: block;
  margin-bottom: 2px;
  color: #374151;
  font-size: 7px;
  line-height: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.field-box {
  height: 20px;
  border: 1px solid #6b7280;
  background: #ffffff;
}
.complaint-field { margin-top: 5px; }
.complaint-box {
  height: 36px;
  border: 1px solid #6b7280;
  background: repeating-linear-gradient(to bottom, #ffffff 0, #ffffff 11px, #d1d5db 12px);
}
.catalog-grid {
  width: 100%;
  border-collapse: collapse;
  margin-top: 6px;
  table-layout: fixed;
}
.catalog-grid > tbody > tr > td {
  width: 50%;
  vertical-align: top;
  padding: 0;
}
.catalog-grid > tbody > tr > td:first-child {
  padding-right: 5px;
}
.catalog-grid > tbody > tr > td:last-child {
  padding-left: 5px;
}
.category {
  border: 1px solid #9ca3af;
  margin: 0 0 4px 0;
}
.category-title {
  padding: 2px 4px;
  border-bottom: 1px solid #9ca3af;
  background: #f3f4f6;
  font-size: 7px;
  line-height: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.service-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.service-table col.check-column { width: 14px; }
.service-table col.price-column { width: 78px; }
.service-table th {
  padding: 1px 3px;
  border-bottom: 1px solid #c7ccd3;
  color: #4b5563;
  font-size: 6px;
  line-height: 8px;
  font-weight: 800;
  text-transform: uppercase;
}
.service-table th:nth-child(2) { text-align: left; }
.service-table th:last-child { text-align: center; }
.service-table td {
  padding: 1px 3px;
  border-bottom: 1px solid #d7dbe0;
  vertical-align: middle;
  font-size: 6.8px;
  line-height: 8.5px;
}
.service-table tr:last-child td { border-bottom: 0; }
.check-cell { text-align: center; width: 14px; }
.checkbox {
  display: inline-block;
  width: 8px;
  height: 8px;
  border: 1px solid #374151;
  vertical-align: middle;
}
.service-name { color: #111827; font-weight: 600; }
.service-subtext {
  display: block;
  margin-top: 0;
  color: #6b7280;
  font-size: 6px;
  line-height: 7.5px;
  font-weight: 400;
}
.price-cell { padding: 1px 2px !important; width: 78px; }
.price-entry {
  width: 74px;
  border-collapse: collapse;
  border: 1px solid #9ca3af;
  table-layout: fixed;
}
.price-entry td {
  border: 0 !important;
  padding: 1px 2px !important;
  font-size: 6.2px !important;
  line-height: 8px !important;
  vertical-align: middle !important;
  height: 12px;
}
.price-entry .printed-price {
  width: 34px;
  text-align: center;
  border-right: 1px solid #9ca3af !important;
  font-weight: 700;
  white-space: nowrap;
}
.price-entry .new-price {
  width: 36px;
}
.empty-sheet {
  margin-top: 16px;
  padding: 12px;
  border: 1px dashed #9ca3af;
  color: #4b5563;
  font-size: 11px;
  text-align: center;
}
@page { size: Letter portrait; margin: 0; }
@media print {
  html, body { width: 8.5in; height: 11in; }
  .page { margin: 0; }
}
`
