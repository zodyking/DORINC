@php
  // Executive Slate — compact slate-accented invoice. Left accent bar on a
  // shared rounded header card, complaint strip above a slate-ruled item
  // grid that owns the page, rounded slate balance box.
  $paperCss = ($paper ?? 'letter') === 'a4' ? 'A4' : 'Letter';
  $m = $margins ?? ['top' => 0.75, 'right' => 0.75, 'bottom' => 0.75, 'left' => 0.75];
  $ink = '#1c2430';
  $slate = '#2b3949';
  $muted = '#4e5a68';
  $faint = '#8494a5';
  $line = '#d5dae1';
  $hairline = '#e4e8ed';
  $tint = '#eef1f5';
  $onDark = '#f4f6f9';
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
      line-height: 1.4;
      color: {{ $ink }};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    table { border-collapse: collapse; width: 100%; }
    .mono { font-family: {!! $fontMono !!}; font-variant-numeric: tabular-nums; }
    .muted { color: {{ $muted }}; }
    .label {
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: {{ $faint }};
      margin: 0 0 3px;
    }

    .head { border-left: 4px solid {{ $slate }}; }
    .head td { padding: 2px 0 2px 12px; vertical-align: top; }
    .doc-title { margin: 0; font-size: 17pt; font-weight: 700; letter-spacing: 0.08em; color: {{ $slate }}; line-height: 1.05; }
    .doc-sub { margin-top: 2px; font-size: 8.5pt; font-weight: 700; color: {{ $muted }}; }
    .company-name { margin: 0 0 2px; font-size: 11.5pt; font-weight: 700; line-height: 1.2; text-align: right; }
    .company-meta { font-size: 7.5pt; color: {{ $muted }}; line-height: 1.45; text-align: right; }
    .status {
      display: inline-block;
      margin-top: 3px;
      padding: 1px 9px;
      background: {{ $slate }};
      color: {{ $onDark }};
      border-radius: 9px;
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    .info-card {
      margin-top: 9px;
      background: {{ $tint }};
      border-radius: 10px;
    }
    .info-card td { padding: 8px 12px; vertical-align: top; border-left: 1px solid {{ $line }}; }
    .info-card td:first-child { border-left: none; }
    .info-card p { margin: 0 0 1px; font-size: 8.5pt; }
    .info-card .strong { font-weight: 700; font-size: 9pt; }
    .kv { font-size: 8.5pt; }
    .kv td { padding: 0 0 1px; border: none; vertical-align: top; }
    .kv .k { color: {{ $faint }}; width: 34%; padding-right: 6px; font-size: 7.5pt; }
    .kv .v { font-weight: 600; }

    .complaint {
      margin-top: 8px;
      border: 1px solid {{ $line }};
      border-left: 4px solid {{ $slate }};
      border-radius: 8px;
      padding: 6px 11px;
    }
    .complaint .body { font-size: 8.5pt; color: {{ $muted }}; line-height: 1.45; }

    .lines-table { margin-top: 10px; font-size: 8.5pt; }
    .lines-table thead th {
      padding: 4px 8px 5px;
      text-align: left;
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: {{ $slate }};
      border-bottom: 2px solid {{ $slate }};
    }
    .lines-table tbody td {
      padding: 4.5px 8px;
      vertical-align: top;
      border-bottom: 1px solid {{ $hairline }};
    }
    .lines-table .num {
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      font-family: {!! $fontMono !!};
    }
    .lines-table .center { text-align: center; }
    .type-mark { font-size: 7.5pt; font-weight: 700; color: {{ $slate }}; font-family: {!! $fontMono !!}; }
    .lines-table tr.filler td { color: transparent; }

    .bottom { margin-top: 8px; page-break-inside: avoid; }
    .bottom > tbody > tr > td { vertical-align: bottom; }
    .sig-line {
      border-top: 1px solid {{ $slate }};
      margin-right: 30px;
      padding-top: 4px;
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: {{ $faint }};
    }
    .totals-table { font-size: 8.5pt; }
    .totals-table td { padding: 2.5px 2px; }
    .totals-table td:first-child { color: {{ $muted }}; }
    .totals-table td:last-child {
      text-align: right;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      font-family: {!! $fontMono !!};
    }
    .totals-table tr.total td {
      padding-top: 5px;
      border-top: 2px solid {{ $slate }};
      font-size: 9.5pt;
      font-weight: 700;
    }
    .balance-band { margin-top: 5px; background: {{ $slate }}; border-radius: 8px; }
    .balance-band td { padding: 6px 10px; }
    .balance-band .bd-label {
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      white-space: nowrap;
      color: {{ $onDark }};
    }
    .balance-band .bd-amount {
      text-align: right;
      font-size: 11pt;
      font-weight: 700;
      color: {{ $onDark }};
      font-family: {!! $fontMono !!};
    }

    .footer {
      margin-top: 10px;
      padding-top: 6px;
      border-top: 1px solid {{ $line }};
      font-size: 7pt;
      color: {{ $faint }};
      text-align: center;
      letter-spacing: 0.05em;
    }
  </style>
</head>
<body>
  <table class="head">
    <tr>
      @if($sectionVisible('invoice_meta'))
        <td width="{{ $sectionVisible('company_info') ? '50%' : '100%' }}">
          <h1 class="doc-title">{{ $doc['documentTitle'] ?? 'INVOICE' }}</h1>
          <div class="doc-sub mono">{{ $doc['number'] ?? '—' }}</div>
          @if(!empty($doc['statusLabel']))
            <span class="status">{{ $doc['statusLabel'] }}</span>
          @endif
        </td>
      @endif
      @if($sectionVisible('company_info'))
        <td width="{{ $sectionVisible('invoice_meta') ? '50%' : '100%' }}">
          <h2 class="company-name">{{ $company['name'] ?? 'Business Name' }}</h2>
          <div class="company-meta">
            {{ trim(implode(', ', array_filter([$company['addressLine1'] ?? '', $company['addressLine2'] ?? '']))) }}<br>
            {{ $company['phone'] ?? '' }}@if(!empty($company['phone']) && !empty($company['email'])) &nbsp;·&nbsp; @endif{{ $company['email'] ?? '' }}
          </div>
        </td>
      @endif
    </tr>
  </table>

  <table class="info-card">
    <tr>
      @if($sectionVisible('customer'))
        <td width="{{ ($sectionVisible('vehicle') && $vehicle) ? '36%' : '55%' }}">
          <div class="label">{{ $sectionLabel('customer', 'Bill to') }}</div>
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
            <tr><td class="k">Unit</td><td class="v">{{ $vehicle['unitNumber'] ?? '—' }} · {{ $vehicle['year'] ?? '—' }} {{ $vehicle['makeModel'] ?? '' }}</td></tr>
            <tr><td class="k">VIN</td><td class="v mono">{{ $vehicle['vin'] ?? '—' }}</td></tr>
            <tr><td class="k">Plate</td><td class="v">{{ $vehicle['plate'] ?? '—' }}</td></tr>
          </table>
        </td>
      @endif
      @if($sectionVisible('invoice_meta'))
        <td width="28%">
          <div class="label">Invoice details</div>
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
          <th style="width:7%; text-align:center;">Type</th>
          <th style="width:47%;">Description</th>
          <th style="width:11%; text-align:right;">Qty</th>
          <th style="width:16%; text-align:right;">Unit price</th>
          <th style="width:19%; text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        @forelse($lineItems as $line)
          <tr>
            <td class="center"><span class="type-mark">{{ $line['typeBadge'] ?? '' }}</span></td>
            <td>{{ $line['description'] ?? '' }}</td>
            <td class="num">{{ $line['quantity'] ?? '0' }}</td>
            <td class="num">{{ $line['unitPrice'] ?? '$0.00' }}</td>
            <td class="num">{{ $line['lineAmount'] ?? '$0.00' }}</td>
          </tr>
        @empty
          <tr>
            <td colspan="5" class="center muted" style="padding:12px;">No line items</td>
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
        <td width="55%" style="padding-right:24px;">
          @if($sectionVisible('footer'))
            <div class="sig-line">Customer signature / date</div>
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
    <div class="footer">
      {{ $company['name'] ?? '' }} &nbsp;·&nbsp; {{ $doc['documentTitle'] ?? 'Invoice' }} {{ $doc['number'] ?? '' }} &nbsp;·&nbsp; Thank you for your business
    </div>
  @endif
</body>
</html>
