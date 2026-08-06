/**
 * Shared Letter service log sheet CSS.
 * Even 0.5in margins (invoice-like). DomPDF uses @page margins; browser/editor
 * uses .page padding so the paper preview matches print.
 */
export const SERVICE_LOG_SHEET_PAGE_MARGIN_IN = 0.5

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
  border-bottom: 1.5pt solid #111827;
  table-layout: fixed;
}
.header td {
  vertical-align: top;
  padding: 0 0 6px 0;
}
.header td:first-child { width: 58%; padding-right: 10px; }
.header td:last-child { width: 42%; }
.company-name {
  margin: 0;
  font-size: 16px;
  line-height: 18px;
  font-weight: 800;
  letter-spacing: -0.2px;
}
.company-details {
  margin-top: 2px;
  color: #4b5563;
  font-size: 7.5px;
  line-height: 10px;
}
.document-title { text-align: right; }
.document-title h1 {
  margin: 0;
  font-size: 12px;
  line-height: 14px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}
.document-title p {
  margin: 2px 0 0;
  color: #4b5563;
  font-size: 7.5px;
  line-height: 9px;
}
.top-fields {
  width: 100%;
  border-collapse: collapse;
  margin-top: 6px;
  table-layout: fixed;
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
  height: 18px;
  border: 1px solid #6b7280;
  background: #ffffff;
}
.complaint-field { margin-top: 5px; }
.complaint-box {
  height: 32px;
  border: 1px solid #6b7280;
  background: repeating-linear-gradient(to bottom, #ffffff 0, #ffffff 10px, #d1d5db 11px);
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
  padding-right: 4px;
}
.catalog-grid > tbody > tr > td:last-child {
  padding-left: 4px;
}
.category {
  border: 1px solid #9ca3af;
  margin: 0 0 3px 0;
}
.category-title {
  padding: 2px 4px;
  border-bottom: 1px solid #9ca3af;
  background: #f3f4f6;
  font-size: 6.5px;
  line-height: 8px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.service-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.service-table col.check-column { width: 12px; }
.service-table col.price-column { width: 68px; }
.service-table th {
  padding: 1px 2px;
  border-bottom: 1px solid #c7ccd3;
  color: #4b5563;
  font-size: 5.5px;
  line-height: 7px;
  font-weight: 800;
  text-transform: uppercase;
}
.service-table th:nth-child(2) { text-align: left; }
.service-table th:last-child { text-align: center; }
.service-table td {
  padding: 1px 2px;
  border-bottom: 1px solid #d7dbe0;
  vertical-align: middle;
  font-size: 6.4px;
  line-height: 8px;
  overflow: hidden;
}
.service-table tr:last-child td { border-bottom: 0; }
.check-cell { text-align: center; width: 12px; }
.checkbox {
  display: inline-block;
  width: 7px;
  height: 7px;
  border: 1px solid #374151;
  vertical-align: middle;
}
.service-name {
  color: #111827;
  font-weight: 600;
  overflow: hidden;
}
.service-subtext {
  display: block;
  margin-top: 0;
  color: #6b7280;
  font-size: 5.5px;
  line-height: 7px;
  font-weight: 400;
}
.price-cell { padding: 1px 1px !important; width: 68px; }
.price-entry {
  width: 64px;
  border-collapse: collapse;
  border: 1px solid #9ca3af;
  table-layout: fixed;
}
.price-entry td {
  border: 0 !important;
  padding: 1px 1px !important;
  font-size: 5.8px !important;
  line-height: 7px !important;
  vertical-align: middle !important;
  height: 11px;
  overflow: hidden;
}
.price-entry .printed-price {
  width: 30px;
  text-align: center;
  border-right: 1px solid #9ca3af !important;
  font-weight: 700;
  white-space: nowrap;
}
.price-entry .new-price {
  width: 30px;
}
.empty-sheet {
  margin-top: 16px;
  padding: 12px;
  border: 1px dashed #9ca3af;
  color: #4b5563;
  font-size: 11px;
  text-align: center;
}
.back-title {
  margin: 10px 0 8px;
  font-size: 11px;
  line-height: 13px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.back-help {
  margin: 0 0 8px;
  color: #4b5563;
  font-size: 8px;
  line-height: 11px;
}
.blank-work-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.blank-work-table th,
.blank-work-table td {
  border: 1px solid #9ca3af;
  padding: 0;
  vertical-align: middle;
}
.blank-work-table th {
  background: #f3f4f6;
  color: #374151;
  font-size: 7.5px;
  line-height: 10px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 4px 6px;
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
  height: 28px;
  background: repeating-linear-gradient(to bottom, #ffffff 0, #ffffff 13px, #e5e7eb 14px);
}
@page {
  size: Letter portrait;
  margin: ${SERVICE_LOG_SHEET_PAGE_MARGIN_IN}in;
}
@media screen {
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
}
@media print {
  html, body { width: auto; height: auto; background: #fff; }
  .page {
    width: auto;
    min-height: auto;
    margin: 0;
    padding: 0;
    box-shadow: none;
  }
}
`
