-- Remove automatic shop-supply surcharges from all invoices and estimates.
UPDATE invoices
SET
  fees_amount = 0,
  shop_supplies_percent = NULL,
  total = subtotal + tax_amount - COALESCE(discount_amount, 0),
  balance_due = subtotal + tax_amount - COALESCE(discount_amount, 0) - COALESCE(amount_paid, 0)
WHERE fees_amount IS DISTINCT FROM 0
   OR shop_supplies_percent IS NOT NULL;

UPDATE estimates
SET
  fees_amount = 0,
  shop_supplies_percent = NULL,
  total = subtotal + tax_amount - COALESCE(discount_amount, 0)
WHERE fees_amount IS DISTINCT FROM 0
   OR shop_supplies_percent IS NOT NULL;
