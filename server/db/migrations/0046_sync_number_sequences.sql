-- Realign human-facing number sequences after imports or manual inserts.
SELECT setval(
  'invoice_number_seq',
  COALESCE((SELECT MAX(invoice_number) FROM invoices), 0)
);
--> statement-breakpoint
SELECT setval(
  'service_log_number_seq',
  COALESCE((SELECT MAX(log_number) FROM service_logs), 0)
);
--> statement-breakpoint
SELECT setval(
  'estimate_number_seq',
  COALESCE((SELECT MAX(estimate_number) FROM estimates), 0)
);
