-- Convert legacy service line items to labor (line types are now part, labor, fee only).
UPDATE "invoice_line_items" SET "line_type" = 'labor' WHERE "line_type" = 'service';--> statement-breakpoint
UPDATE "estimate_line_items" SET "line_type" = 'labor' WHERE "line_type" = 'service';--> statement-breakpoint
UPDATE "service_logs"
SET "draft_line_items" = (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN elem->>'lineType' = 'service'
      THEN jsonb_set(elem, '{lineType}', '"labor"'::jsonb)
      ELSE elem
    END
    ORDER BY ord
  ), '[]'::jsonb)
  FROM jsonb_array_elements("draft_line_items") WITH ORDINALITY AS t(elem, ord)
)
WHERE "draft_line_items" IS NOT NULL
  AND jsonb_typeof("draft_line_items") = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements("draft_line_items") AS elem
    WHERE elem->>'lineType' = 'service'
  );
