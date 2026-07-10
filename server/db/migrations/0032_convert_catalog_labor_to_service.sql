-- Catalog item types are part, service, or fee only. Legacy labor rows become service.
UPDATE catalog_items
SET item_type = 'service',
    uom = CASE WHEN uom = 'each' THEN 'hr' ELSE uom END,
    updated_at = NOW()
WHERE item_type = 'labor';
