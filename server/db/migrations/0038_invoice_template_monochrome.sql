-- Upgrade legacy yellow/accent invoice templates to built-in monochrome baseline.
UPDATE invoice_template_versions
SET design_settings = jsonb_set(
  jsonb_set(
    jsonb_set(
      design_settings,
      '{accentColor}',
      '"#0a0a0a"'::jsonb
    ),
    '{accentColor2}',
    '"#0a0a0a"'::jsonb
  ),
  '{marginInches}',
  to_jsonb(GREATEST(COALESCE((design_settings->>'marginInches')::numeric, 0.75), 0.75))
);

UPDATE invoice_template_versions
SET html_content = 'laravel-blade:invoices/pdf'
WHERE html_content NOT LIKE 'laravel-blade:%'
  AND (
    html_content ILIKE '%#ffd400%'
    OR html_content ILIKE '%ffd400%'
    OR html_content ILIKE '%accent-bar%'
    OR html_content ILIKE '%$accent = $doc%'
    OR html_content ILIKE '%$doc[''design''][''accentColor'']%'
    OR html_content ILIKE '%$doc["design"]["accentColor"]%'
  );
