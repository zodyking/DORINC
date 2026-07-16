-- Remove intermediate approved / approved_for_invoice statuses.
-- Invoices: approved → sent (customer-visible once mailed).
-- Service logs: approved_for_invoice → in_review (convert directly from review).

UPDATE invoices
SET
  status = 'sent',
  sent_at = COALESCE(sent_at, approved_at, updated_at, now())
WHERE status = 'approved';

UPDATE service_logs
SET status = 'in_review'
WHERE status = 'approved_for_invoice';
