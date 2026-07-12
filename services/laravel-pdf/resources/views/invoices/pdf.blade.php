@php
  $paperCss = ($paper ?? 'letter') === 'a4' ? 'A4' : 'Letter';
  $m = $margins ?? ['top' => 0.75, 'right' => 0.75, 'bottom' => 0.75, 'left' => 0.75];
  $ink = '#111111';
  $muted = '#4b5563';
  $faint = '#6b7280';
  $line = '#d9dde3';
  $hairline = '#e7eaee';
  $surface = '#f6f7f9';
  $fontSans = $doc['design']['fontSans'] ?? 'DejaVu Sans, Helvetica, Arial, sans-serif';
  $fontMono = $doc['design']['fontMono'] ?? 'DejaVu Sans Mono, Courier, monospace';
  $company = $doc['company'] ?? [];
  $lineItems = $doc['lineItems'] ?? [];
  $customer = $doc['customer'] ?? [];
  $totals = $doc['totals'] ?? [];
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
      font-size: 9.5pt;
      line-height: 1.5;
      color: {{ $ink }};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    table { border-collapse: collapse; width: 100%; }
    .label {
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: {{ $faint }};
      margin: 0 0 5px;
    }
    .muted { color: {{ $muted }}; }
    .mono { font-family: {!! $fontMono !!}; font-variant-numeric: tabular-nums; }

    .company-name {
      margin: 0 0 7px;
      font-size: 17pt;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.15;
      color: {{ $ink }};
    }
    .company-meta { font-size: 8.5pt; color: {{ $muted }}; line-height: 1.6; }
    .doc-title {
      margin: 0;
      font-size: 27pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-align: right;
      line-height: 1;
      color: {{ $ink }};
    }
    .doc-number {
      margin-top: 8px;
      text-align: right;
      font-size: 10pt;
      font-weight: 600;
      color: {{ $muted }};
    }
    .status {
      display: inline-block;
      margin-top: 10px;
      padding: 3px 12px;
      border: 1.2px solid {{ $ink }};
      border-radius: 2px;
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: {{ $ink }};
      background: #ffffff;
    }
    .rule { height: 2.5px; background: {{ $ink }}; margin: 18px 0 0; }

    .meta-band { background: {{ $surface }}; margin-top: 14px; }
    .meta-band td {
      width: 25%;
      padding: 10px 14px;
      vertical-align: top;
      border-right: 1px solid {{ $line }};
    }
    .meta-band td:last-child { border-right: none; }
    .meta-band .val {
      display: block;
      margin-top: 1px;
      font-size: 10pt;
      font-weight: 700;
      color: {{ $ink }};
    }

    .parties { margin-top: 20px; }
    .parties > tbody > tr > td { vertical-align: top; }
    .panel {
      border: 1px solid {{ $line }};
      padding: 12px 14px;
      background: #ffffff;
    }
    .panel p { margin: 0 0 3px; font-size: 9.5pt; }
    .panel p:last-child { margin-bottom: 0; }
    .panel .party-name { font-size: 10.5pt; font-weight: 700; margin-bottom: 5px; }

    .vehicle-grid td {
      padding: 8px 10px;
      border: 1px solid {{ $line }};
      vertical-align: top;
      font-size: 9pt;
      background: #ffffff;
    }
    .vehicle-grid .vg-label {
      display: block;
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: {{ $faint }};
      margin-bottom: 2px;
    }
    .vehicle-grid .vg-val { font-weight: 600; color: {{ $ink }}; }

    .notes-block { margin-top: 18px; }
    .notes {
      font-size: 9pt;
      color: {{ $muted }};
      line-height: 1.6;
    }

    .lines-table { margin-top: 22px; font-size: 9pt; }
    .lines-table thead th {
      padding: 8px 10px;
      text-align: left;
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: {{ $faint }};
      border-bottom: 2px solid {{ $ink }};
    }
    .lines-table tbody td {
      padding: 9px 10px;
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
    .type-pill {
      display: inline-block;
      min-width: 16px;
      padding: 1px 4px;
      border: 1px solid {{ $line }};
      border-radius: 2px;
      text-align: center;
      font-size: 7.5pt;
      font-weight: 700;
      color: {{ $muted }};
      font-family: {!! $fontMono !!};
    }

    .bottom { margin-top: 22px; page-break-inside: avoid; }
    .bottom td { vertical-align: top; }

    .totals-table { font-size: 9pt; }
    .totals-table td { padding: 5px 2px; border-bottom: 1px solid {{ $hairline }}; }
    .totals-table td:first-child { color: {{ $muted }}; }
    .totals-table td:last-child {
      text-align: right;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      font-family: {!! $fontMono !!};
      color: {{ $ink }};
    }
    .totals-table tr.total td {
      padding-top: 9px;
      border-top: 2px solid {{ $ink }};
      border-bottom: none;
      font-size: 10.5pt;
      font-weight: 700;
      color: {{ $ink }};
    }
    .balance-band { margin-top: 8px; background: {{ $ink }}; }
    .balance-band td { padding: 9px 12px; }
    .balance-band .bd-label {
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #ffffff;
    }
    .balance-band .bd-amount {
      text-align: right;
      font-size: 12pt;
      font-weight: 700;
      color: #ffffff;
      font-family: {!! $fontMono !!};
    }

    .signatures { margin-top: 34px; page-break-inside: avoid; }
    .signatures td { width: 50%; padding: 0 18px 0 0; vertical-align: bottom; }
    .signatures td:last-child { padding: 0 0 0 18px; }
    .sig-line {
      border-top: 1px solid {{ $ink }};
      padding-top: 6px;
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: {{ $faint }};
    }
    .footer {
      margin-top: 22px;
      padding-top: 10px;
      border-top: 1px solid {{ $line }};
      font-size: 7.5pt;
      color: {{ $faint }};
      text-align: center;
      letter-spacing: 0.04em;
    }
  </style>
</head>
<body>
  <table width="100%">
    <tr>
      @if($sectionVisible('company_info'))
        <td width="{{ $sectionVisible('invoice_meta') ? '58%' : '100%' }}" valign="top">
          <h1 class="company-name">{{ $company['name'] ?? 'Business Name' }}</h1>
          <div class="company-meta">
            @if(!empty($company['addressLine1']))<div>{{ $company['addressLine1'] }}</div>@endif
            @if(!empty($company['addressLine2']))<div>{{ $company['addressLine2'] }}</div>@endif
            @if(!empty($company['phone']) || !empty($company['email']))
              <div>{{ $company['phone'] ?? '' }}@if(!empty($company['phone']) && !empty($company['email'])) &nbsp;·&nbsp; @endif{{ $company['email'] ?? '' }}</div>
            @endif
            @if(!empty($company['website']))<div>{{ $company['website'] }}</div>@endif
          </div>
        </td>
      @endif
      @if($sectionVisible('invoice_meta'))
        <td width="{{ $sectionVisible('company_info') ? '42%' : '100%' }}" valign="top">
          <h2 class="doc-title">{{ $doc['documentTitle'] ?? 'INVOICE' }}</h2>
          <div class="doc-number">{{ $doc['numberLabel'] ?? 'Invoice #' }} {{ $doc['number'] ?? '—' }}</div>
          @if(!empty($doc['statusLabel']))
            <div style="text-align:right;"><span class="status">{{ $doc['statusLabel'] }}</span></div>
          @endif
        </td>
      @endif
    </tr>
  </table>

  <div class="rule"></div>

  @if($sectionVisible('invoice_meta'))
    <table class="meta-band">
      <tr>
        <td>
          <span class="label">{{ $doc['numberLabel'] ?? 'Invoice #' }}</span>
          <span class="val">{{ $doc['number'] ?? '—' }}</span>
        </td>
        <td>
          <span class="label">{{ $doc['dateLabel'] ?? 'Date' }}</span>
          <span class="val">{{ $doc['date'] ?? '—' }}</span>
        </td>
        <td>
          <span class="label">{{ $doc['dueDateLabel'] ?? 'Due' }}</span>
          <span class="val">{{ $doc['dueLabel'] ?? '—' }}</span>
        </td>
        <td>
          <span class="label">Generated</span>
          <span class="val">{{ $doc['generatedAt'] ?? '—' }}</span>
        </td>
      </tr>
    </table>
  @endif

  @if($sectionVisible('customer') || ($sectionVisible('vehicle') && !empty($doc['vehicle'])))
    <table class="parties">
      <tr>
        @if($sectionVisible('customer'))
          <td width="{{ ($sectionVisible('vehicle') && !empty($doc['vehicle'])) ? '46%' : '100%' }}" style="padding-right:14px;">
            <div class="label">{{ $sectionLabel('customer', 'Bill to') }}</div>
            <div class="panel">
              <p class="party-name">{{ $customer['name'] ?? '—' }}</p>
              @foreach(($customer['addressLines'] ?? []) as $line)
                <p class="muted">{{ $line }}</p>
              @endforeach
              @if(!empty($customer['phone']) && $customer['phone'] !== '—')<p class="muted">{{ $customer['phone'] }}</p>@endif
              @if(!empty($customer['email']) && $customer['email'] !== '—')<p class="muted">{{ $customer['email'] }}</p>@endif
            </div>
          </td>
        @endif
        @if($sectionVisible('vehicle') && !empty($doc['vehicle']))
          <td width="{{ $sectionVisible('customer') ? '54%' : '100%' }}">
            <div class="label">{{ $sectionLabel('vehicle', 'Vehicle / unit') }}</div>
            <table class="vehicle-grid">
              <tr>
                <td width="20%"><span class="vg-label">Unit</span><span class="vg-val">{{ $doc['vehicle']['unitNumber'] ?? '—' }}</span></td>
                <td width="20%"><span class="vg-label">Year</span><span class="vg-val">{{ $doc['vehicle']['year'] ?? '—' }}</span></td>
                <td width="60%"><span class="vg-label">Make / model</span><span class="vg-val">{{ $doc['vehicle']['makeModel'] ?? '—' }}</span></td>
              </tr>
              <tr>
                <td colspan="2"><span class="vg-label">VIN</span><span class="vg-val mono">{{ $doc['vehicle']['vin'] ?? '—' }}</span></td>
                <td><span class="vg-label">Plate</span><span class="vg-val">{{ $doc['vehicle']['plate'] ?? '—' }}</span></td>
              </tr>
            </table>
          </td>
        @endif
      </tr>
    </table>
  @endif

  @if(($sectionVisible('symptoms') || $sectionVisible('job_summary')) && !empty($doc['note']) && $doc['note'] !== '—')
    <div class="notes-block">
      <div class="label">{{ $sectionLabel('symptoms', 'Work performed / notes') }}</div>
      <div class="notes">{{ $doc['note'] }}</div>
    </div>
  @endif

  @if($sectionVisible('line_items'))
    <table class="lines-table">
      <thead>
        <tr>
          <th style="width:8%;" class="center">Type</th>
          <th style="width:44%;">Description</th>
          <th style="width:12%;" class="num">Qty</th>
          <th style="width:16%;" class="num">Unit price</th>
          <th style="width:20%;" class="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        @forelse($lineItems as $line)
          <tr>
            <td class="center"><span class="type-pill">{{ $line['typeBadge'] ?? '' }}</span></td>
            <td>{{ $line['description'] ?? '' }}</td>
            <td class="num">{{ $line['quantity'] ?? '0' }}</td>
            <td class="num">{{ $line['unitPrice'] ?? '$0.00' }}</td>
            <td class="num">{{ $line['lineAmount'] ?? '$0.00' }}</td>
          </tr>
        @empty
          <tr>
            <td colspan="5" class="center muted" style="padding:16px;">No line items</td>
          </tr>
        @endforelse
      </tbody>
    </table>
  @endif

  @if($sectionVisible('totals') || $sectionVisible('payment') || $sectionVisible('terms'))
    <table class="bottom">
      <tr>
        @if($sectionVisible('payment') || $sectionVisible('terms'))
          <td width="{{ $sectionVisible('totals') ? '54%' : '100%' }}" style="padding-right:22px;">
            @if($sectionVisible('payment'))
              <div class="label">{{ $sectionLabel('payment', 'Payment instructions') }}</div>
              <div class="notes">{{ $doc['dueLabel'] ?? 'Due upon receipt' }}. Please reference invoice {{ $doc['number'] ?? '' }} with your payment.</div>
            @endif
            @if($sectionVisible('terms'))
              <div class="label" style="margin-top:14px;">{{ $sectionLabel('terms', 'Terms & conditions') }}</div>
              <div class="notes">Payment is due per the terms above. Late payments may incur fees where permitted by law.</div>
            @endif
          </td>
        @endif
        @if($sectionVisible('totals'))
          <td width="{{ ($sectionVisible('payment') || $sectionVisible('terms')) ? '46%' : '100%' }}">
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
    <table class="signatures">
      <tr>
        <td><div class="sig-line">Authorized signature</div></td>
        <td><div class="sig-line">Customer signature / date</div></td>
      </tr>
    </table>
    <div class="footer">
      {{ $company['name'] ?? '' }} &nbsp;·&nbsp; {{ $doc['documentTitle'] ?? 'Invoice' }} {{ $doc['number'] ?? '' }} &nbsp;·&nbsp; Generated {{ $doc['generatedAt'] ?? '' }} &nbsp;·&nbsp; Thank you for your business
    </div>
  @endif
</body>
</html>
