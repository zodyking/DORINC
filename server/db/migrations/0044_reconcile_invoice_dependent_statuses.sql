-- Repair dependent statuses when linked invoices were removed without cleanup.

UPDATE service_logs sl
SET
  status = 'in_review',
  invoice_id = NULL,
  status_reason = 'Linked invoice was deleted; returned to review',
  updated_at = now()
WHERE sl.status = 'converted_to_invoice'
  AND (
    sl.invoice_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = sl.invoice_id)
  );

UPDATE estimates e
SET
  status = CASE WHEN e.status = 'converted' THEN 'approved' ELSE e.status END,
  converted_invoice_id = NULL,
  converted_at = NULL,
  converted_by = NULL,
  updated_at = now()
WHERE e.converted_invoice_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = e.converted_invoice_id);

UPDATE service_requests sr
SET result_invoice_id = NULL, updated_at = now()
WHERE sr.result_invoice_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = sr.result_invoice_id);

UPDATE invoice_change_requests icr
SET result_invoice_id = NULL, updated_at = now()
WHERE icr.result_invoice_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = icr.result_invoice_id);

UPDATE invoice_change_requests icr
SET invoice_id = NULL, updated_at = now()
WHERE icr.invoice_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = icr.invoice_id);
