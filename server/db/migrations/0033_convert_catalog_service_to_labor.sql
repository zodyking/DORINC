-- Catalog item types are part, labor, or fee. Reverse mistaken 0032 service rows back to labor.
UPDATE catalog_items
SET item_type = 'labor',
    updated_at = NOW()
WHERE item_type = 'service';
