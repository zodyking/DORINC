-- Realign human-facing number sequences after imports or manual inserts.
-- setval(0) fails when sequence minval is 1+; use schema floor with is_called=false when empty.
SELECT setval(
  'invoice_number_seq',
  CASE
    WHEN COALESCE((SELECT MAX(invoice_number) FROM invoices), 0) < 93
    THEN 93
    ELSE (SELECT MAX(invoice_number) FROM invoices)
  END,
  COALESCE((SELECT MAX(invoice_number) FROM invoices), 0) < 93
);
--> statement-breakpoint
SELECT setval(
  'service_log_number_seq',
  CASE
    WHEN COALESCE((SELECT MAX(log_number) FROM service_logs), 0) < 1001
    THEN 1001
    ELSE (SELECT MAX(log_number) FROM service_logs)
  END,
  COALESCE((SELECT MAX(log_number) FROM service_logs), 0) < 1001
);
--> statement-breakpoint
SELECT setval(
  'estimate_number_seq',
  CASE
    WHEN COALESCE((SELECT MAX(estimate_number) FROM estimates), 0) < 1
    THEN 1
    ELSE (SELECT MAX(estimate_number) FROM estimates)
  END,
  COALESCE((SELECT MAX(estimate_number) FROM estimates), 0) < 1
);
