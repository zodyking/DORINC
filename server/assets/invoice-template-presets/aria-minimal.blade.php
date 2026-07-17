@php
  // Aria Minimal — quiet, hairline invoice. One combined header row for
  // business, customer, vehicle, and invoice meta; complaint above a
  // hairline-ruled item grid that dominates the page; soft rounded accents.
  $paperCss = ($paper ?? 'letter') === 'a4' ? 'A4' : 'Letter';
  $m = $margins ?? ['top' => 0.75, 'right' => 0.75, 'bottom' => 0.75, 'left' => 0.75];
  $ink = '#1f2937';
  $muted = '#6b7280';
  $faint = '#9ca3af';
  $hairline = '#e5e7eb';
  $wash = '#f9fafb';
  $fontSans = $doc['design']['fontSans'] ?? 'DejaVu Sans, Helvetica, Arial, sans-serif';
  $fontMono = $doc['design']['fontMono'] ?? 'DejaVu Sans Mono, Courier, monospace';
  $company = $doc['company'] ?? [];
  $lineItems = $doc['lineItems'] ?? [];
  $customer = $doc['customer'] ?? [];
  $totals = $doc['totals'] ?? [];
  $vehicle = $doc['vehicle'] ?? null;
  $note = trim((string) ($doc['note'] ?? ''));
  if ($note === '' || $note === '—') { $note = 'No complaint / symptoms recorded.'; }
  $fillerRows = max(0, 9 - count($lineItems));
  $sections = $doc['design']['sections'] ?? [];
  $sectionVisible = function (string $key) use ($sections): bool {
    if (!isset($sections[$key])) return true;
    return (bool) ($sections[$key]['visible'] ?? true);
  };
  $sectionLabel = function (string $key, string $fallback) use ($sections): string {
    $label = $sections[$key]['label'] ?? null;
    return is_string($label) && trim($label) !== '' ? trim($label) : $fallback;
  };
@endphp
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{{ $doc['documentTitle'] ?? 'Invoice' }} {{ $doc['number'] ?? '' }}</title>
  <style>
    @page { size: {{ $paperCss }}; margin: {{ $m['top'] }}in {{ $m['right'] }}in {{ $m['bottom'] }}in {{ $m['left'] }}in; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: {!! $fontSans !!};
      font-size: 9pt;
      line-height: 1.45;
      color: {{ $ink }};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    table { border-collapse: collapse; width: 100%; }
    .mono { font-family: {!! $fontMono !!}; font-variant-numeric: tabular-nums; }
    .muted { color: {{ $muted }}; }
    .label {
      font-size: 6pt;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: {{ $faint }};
      margin: 0 0 3px;
    }

    .head td { vertical-align: top; }
    .kicker { margin: 0 0 1px; font-size: 7pt; font-weight: 700; letter-spacing: 0.28em; text-transform: uppercase; color: {{ $faint }}; }
    .company-name { margin: 0; font-size: 12.5pt; font-weight: 700; line-height: 1.25; }
    .company-meta { margin-top: 2px; font-size: 7.5pt; color: {{ $muted }}; line-height: 1.5; }
    .due-figure { margin: 0; text-align: right; font-size: 17pt; font-weight: 700; line-height: 1.05; font-family: {!! $fontMono !!}; }
    .due-caption { margin-top: 2px; text-align: right; font-size: 6.5pt; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: {{ $faint }}; }

    .head-rule { border-top: 1px solid {{ $ink }}; margin-top: 8px; }

    .info-row { margin-top: 8px; }
    .info-row td { padding: 0 18px 0 0; vertical-align: top; }
    .info-row td:last-child { padding-right: 0; }
    .info-row p { margin: 0 0 1px; font-size: 8.5pt; }
    .info-row .strong { font-weight: 700; }
    .kv { font-size: 8.5pt; }
    .kv td { padding: 0 0 1px; vertical-align: top; }
    .kv .k { color: {{ $faint }}; width: 32%; padding-right: 6px; font-size: 7pt; letter-spacing: 0.06em; text-transform: uppercase; }
    .kv .v { font-weight: 600; }

    .complaint {
      margin-top: 8px;
      background: {{ $wash }};
      border-radius: 8px;
      padding: 6px 11px;
    }
    .complaint .body { font-size: 8.5pt; color: {{ $muted }}; line-height: 1.5; }

    .lines-table { margin-top: 10px; font-size: 8.5pt; }
    .lines-table thead th {
      padding: 0 8px 4px;
      text-align: left;
      font-size: 6pt;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: {{ $faint }};
      border-bottom: 1px solid {{ $ink }};
    }
    .lines-table thead th:first-child { padding-left: 0; }
    .lines-table thead th:last-child { padding-right: 0; }
    .lines-table tbody td {
      padding: 5px 8px;
      vertical-align: top;
      border-bottom: 1px solid {{ $hairline }};
    }
    .lines-table tbody td:first-child { padding-left: 0; }
    .lines-table tbody td:last-child { padding-right: 0; }
    .lines-table .num {
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      font-family: {!! $fontMono !!};
    }
    .type-mark { font-size: 7.5pt; font-weight: 700; color: {{ $faint }}; font-family: {!! $fontMono !!}; }
    .lines-table tr.filler td { color: transparent; }

    .bottom { margin-top: 8px; page-break-inside: avoid; }
    .bottom > tbody > tr > td { vertical-align: bottom; }
    .sig-line {
      border-top: 1px solid {{ $hairline }};
      margin-right: 30px;
      padding-top: 4px;
      font-size: 6pt;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: {{ $faint }};
    }
    .customer-support-note {
      border: 1px solid {{ $hairline }};
      border-radius: 8px;
      padding: 10px 12px;
      background: {{ $wash }};
    }
    .support-title {
      font-size: 6pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: {{ $faint }};
      margin: 0 0 6px;
    }
    .support-line {
      margin: 0 0 6px;
      font-size: 8pt;
      color: {{ $muted }};
      line-height: 1.45;
    }
    .support-line:last-child { margin-bottom: 0; }
    .totals-table { font-size: 8.5pt; }
    .totals-table td { padding: 2px 0; }
    .totals-table td:first-child { color: {{ $muted }}; }
    .totals-table td:last-child {
      text-align: right;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      font-family: {!! $fontMono !!};
    }
    .totals-table tr.total td { padding-top: 5px; border-top: 1px solid {{ $ink }}; font-weight: 700; font-size: 9.5pt; }
    .balance-band { margin-top: 4px; background: {{ $wash }}; border: 1px solid {{ $hairline }}; border-radius: 8px; }
    .balance-band td { padding: 5px 10px; }
    .balance-band .bd-label { font-size: 6.5pt; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; white-space: nowrap; color: {{ $muted }}; }
    .balance-band .bd-amount { text-align: right; font-size: 10.5pt; font-weight: 700; font-family: {!! $fontMono !!}; }

    .footer {
      margin-top: 10px;
      padding-top: 6px;
      border-top: 1px solid {{ $hairline }};
      font-size: 6.5pt;
      color: {{ $faint }};
      letter-spacing: 0.08em;
    }
    .footer td:last-child { text-align: right; }
  </style>
</head>
<body>
  <table class="head">
    <tr>
      @if($sectionVisible('company_info'))
        <td width="{{ $sectionVisible('invoice_meta') ? '58%' : '100%' }}">
          <p class="kicker">{{ $doc['documentTitle'] ?? 'Invoice' }} &nbsp;{{ $doc['number'] ?? '' }}</p>
          <h1 class="company-name">{{ $company['name'] ?? 'Business Name' }}</h1>
          <div class="company-meta">
            {{ trim(implode(', ', array_filter([$company['addressLine1'] ?? '', $company['addressLine2'] ?? '']))) }}
            @if(!empty($company['phone']) || !empty($company['email']))
              &nbsp;·&nbsp; {{ $company['phone'] ?? '' }}@if(!empty($company['phone']) && !empty($company['email'])) &nbsp;·&nbsp; @endif{{ $company['email'] ?? '' }}
            @endif
          </div>
        </td>
      @endif
      @if($sectionVisible('invoice_meta'))
        <td width="{{ $sectionVisible('company_info') ? '42%' : '100%' }}">
          <p class="due-figure">{{ $totals['balanceDue'] ?? $totals['total'] ?? '$0.00' }}</p>
          <div class="due-caption">Amount due · {{ $doc['dueLabel'] ?? 'Due on receipt' }}@if(!empty($doc['statusLabel'])) · {{ $doc['statusLabel'] }}@endif</div>
        </td>
      @endif
    </tr>
  </table>

  <div class="head-rule"></div>

  <table class="info-row">
    <tr>
      @if($sectionVisible('customer'))
        <td width="{{ ($sectionVisible('vehicle') && $vehicle) ? '36%' : '55%' }}">
          <div class="label">{{ $sectionLabel('customer', 'Billed to') }}</div>
          <p class="strong">{{ $customer['name'] ?? '—' }}</p>
          @foreach(($customer['addressLines'] ?? []) as $line)
            <p class="muted">{{ $line }}</p>
          @endforeach
          @if(!empty($customer['phone']) && $customer['phone'] !== '—')<p class="muted">{{ $customer['phone'] }}</p>@endif
          @if(!empty($customer['email']) && $customer['email'] !== '—')<p class="muted">{{ $customer['email'] }}</p>@endif
        </td>
      @endif
      @if($sectionVisible('vehicle') && $vehicle)
        <td width="{{ $sectionVisible('customer') ? '36%' : '55%' }}">
          <div class="label">{{ $sectionLabel('vehicle', 'Vehicle / unit') }}</div>
          <table class="kv">
            <tr><td class="k">Unit</td><td class="v">{{ $vehicle['unitNumber'] ?? '—' }}</td></tr>
            <tr><td class="k">VIN</td><td class="v mono">{{ $vehicle['vin'] ?? '—' }}</td></tr>
            <tr><td class="k">Vehicle</td><td class="v">{{ $vehicle['plate'] ?? '—' }}</td></tr>
          </table>
        </td>
      @endif
      @if($sectionVisible('invoice_meta'))
        <td width="28%">
          <div class="label">Details</div>
          <table class="kv">
            <tr><td class="k">{{ $doc['numberLabel'] ?? 'Invoice #' }}</td><td class="v mono">{{ $doc['number'] ?? '—' }}</td></tr>
            <tr><td class="k">{{ $doc['dateLabel'] ?? 'Date' }}</td><td class="v">{{ $doc['date'] ?? '—' }}</td></tr>
            <tr><td class="k">{{ $doc['dueDateLabel'] ?? 'Due' }}</td><td class="v">{{ $doc['dueLabel'] ?? '—' }}</td></tr>
          </table>
        </td>
      @endif
    </tr>
  </table>

  @if($sectionVisible('symptoms') || $sectionVisible('job_summary'))
    <div class="complaint">
      <div class="label">{{ $sectionLabel('symptoms', 'Customer complaint / symptoms') }}</div>
      <div class="body">{{ $note }}</div>
    </div>
  @endif

  @if($sectionVisible('line_items'))
    <table class="lines-table">
      <thead>
        <tr>
          <th style="width:6%;">Type</th>
          <th style="width:48%;">Description</th>
          <th style="width:11%; text-align:right;">Qty</th>
          <th style="width:16%; text-align:right;">Unit price</th>
          <th style="width:19%; text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        @forelse($lineItems as $line)
          <tr>
            <td><span class="type-mark">{{ $line['typeBadge'] ?? '' }}</span></td>
            <td>{{ $line['description'] ?? '' }}</td>
            <td class="num">{{ $line['quantity'] ?? '0' }}</td>
            <td class="num">{{ $line['unitPrice'] ?? '$0.00' }}</td>
            <td class="num">{{ $line['lineAmount'] ?? '$0.00' }}</td>
          </tr>
        @empty
          <tr>
            <td colspan="5" class="muted" style="padding:12px 0; text-align:center;">No line items</td>
          </tr>
        @endforelse
        @for($i = 0; $i < $fillerRows; $i++)
          <tr class="filler"><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>
        @endfor
      </tbody>
    </table>
  @endif

  @if($sectionVisible('totals') || $sectionVisible('footer'))
    <table class="bottom">
      <tr>
        <td width="55%" style="padding-right:26px; vertical-align:top;">
          @if($sectionVisible('footer'))
            <div class="customer-support-note">
              <div class="support-title">{{ $doc['customerSupport']['title'] ?? 'Questions, changes, or portal access' }}</div>
              @foreach(($doc['customerSupport']['lines'] ?? []) as $line)
                <p class="support-line">{{ $line }}</p>
              @endforeach
            </div>
          @endif
        </td>
        @if($sectionVisible('totals'))
          <td width="45%">
            <table class="totals-table">
              <tr><td>Parts</td><td>{{ $totals['parts'] ?? '$0.00' }}</td></tr>
              <tr><td>Labor</td><td>{{ $totals['labor'] ?? '$0.00' }}</td></tr>
              <tr><td>Fees</td><td>{{ $totals['fees'] ?? '$0.00' }}</td></tr>
              <tr><td>Discount</td><td>{{ $totals['discount'] ?? '$0.00' }}</td></tr>
              <tr><td>Tax</td><td>{{ $totals['tax'] ?? '$0.00' }}</td></tr>
              <tr class="total"><td>Total</td><td>{{ $totals['total'] ?? '$0.00' }}</td></tr>
            </table>
            <table class="balance-band">
              <tr>
                <td class="bd-label">Balance due</td>
                <td class="bd-amount">{{ $totals['balanceDue'] ?? $totals['total'] ?? '$0.00' }}</td>
              </tr>
            </table>
          </td>
        @endif
      </tr>
    </table>
  @endif

  @if($sectionVisible('footer'))
    <table class="footer">
      <tr>
        <td>{{ $company['name'] ?? '' }} &nbsp;·&nbsp; {{ $doc['documentTitle'] ?? 'Invoice' }} {{ $doc['number'] ?? '' }}</td>
        <td>Thank you</td>
      </tr>
    </table>
  @endif
</body>
</html>
