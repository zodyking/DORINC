export const INVOICE_TEMPLATE_HELP_SECTIONS = [
  {
    title: 'Required @php preamble',
    content: `Every template must start with a @php block that reads the system-provided variables:

\`\`\`php
@php
  $paperCss = ($paper ?? 'letter') === 'a4' ? 'A4' : 'Letter';
  $m = $margins ?? ['top' => 0.75, 'right' => 0.75, 'bottom' => 0.75, 'left' => 0.75];
  // ... your template variables
@endphp
\`\`\`

The \`$paper\` and \`$margins\` variables are injected by the PDF service. Use \`$m\` as shorthand for margin values.`,
  },
  {
    title: '@page CSS for paper size & margins',
    content: `Inside your <style> tag, define @page to set the paper size and margins. Use only the size keyword (Letter or A4) — do NOT include "portrait" or "landscape":

\`\`\`css
@page {
  size: {{ $paperCss }};
  margin: {{ $m['top'] }}in {{ $m['right'] }}in {{ $m['bottom'] }}in {{ $m['left'] }}in;
}
\`\`\`

The PDF service also enforces margins as a safety net, but your @page rule gives you full control over exact values.`,
  },
  {
    title: 'Available $doc data keys',
    content: `The template receives a \`$doc\` array with invoice data:

- \`$doc['company']\` — Business name, address, phone, email, fax
- \`$doc['customer']\` — Customer name, addressLines, phone, email
- \`$doc['vehicle']\` — year, make, model, makeModel, vin, plate, color, mileageIn, mileageOut, unitNumber
- \`$doc['lineItems']\` — Array of items with description, quantity, unitPrice, lineAmount, typeBadge
- \`$doc['totals']\` — parts, labor, fees, discount, tax, total, balanceDue
- \`$doc['number']\`, \`$doc['date']\`, \`$doc['dueLabel']\`, \`$doc['statusLabel']\`
- \`$doc['note']\` — Complaint/symptoms text
- \`$doc['design']['sections']\` — Section visibility configuration`,
  },
  {
    title: 'Section visibility helpers',
    content: `Control which sections display using the sections configuration:

\`\`\`php
$sections = $doc['design']['sections'] ?? [];

$sectionVisible = function (string $key) use ($sections): bool {
  if (!isset($sections[$key])) return true;
  return (bool) ($sections[$key]['visible'] ?? true);
};

$sectionLabel = function (string $key, string $fallback) use ($sections): string {
  $label = $sections[$key]['label'] ?? null;
  return is_string($label) && trim($label) !== '' ? trim($label) : $fallback;
};
\`\`\`

Section keys: company_info, invoice_meta, customer, vehicle, symptoms, job_summary, line_items, totals, footer, payment, terms`,
  },
  {
    title: 'Avoiding content cropping',
    content: `To ensure content is never cut off:

1. Keep all content within the page margins — avoid negative margins or absolute positioning near edges
2. Use \`page-break-inside: avoid\` on elements that should not split across pages
3. Don't use \`size: Letter portrait\` — just use \`size: Letter\` (DomPDF has issues with two-value size)
4. Test with the PDF preview after any layout changes
5. Use relative units (%, em) rather than fixed pt/px for responsive layouts`,
  },
  {
    title: 'Print color handling',
    content: `For reliable background colors in print:

\`\`\`css
body {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
\`\`\`

This ensures background colors render in the PDF output.`,
  },
]

export const INVOICE_TEMPLATE_HELP_SUMMARY = 'Templates use Laravel Blade with injected $doc, $paper, and $margins variables. Define @page CSS for size/margins, and use section helpers for visibility control.'
