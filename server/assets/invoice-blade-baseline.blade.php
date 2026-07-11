@php
  $paperCss = ($paper ?? 'letter') === 'a4' ? 'A4' : 'Letter';
  $m = $margins ?? ['top' => 0.75, 'right' => 0.75, 'bottom' => 0.75, 'left' => 0.75];
  $ink = '#0a0a0a';
  $muted = '#525252';
  $faint = '#737373';
  $line = '#e5e5e5';
  $surface = '#fafafa';
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
    .sheet { width: 100%; }
    .rule { height: 2px; background: {{ $ink }}; margin: 0 0 20px; }
    .rule-thin { height: 1px; background: {{ $line }}; margin: 16px 0; }
    .label {
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: {{ $faint }};
      margin: 0 0 6px;
    }
    .muted { color: {{ $muted }}; }
    .company-name {
      margin: 0 0 8px;
      font-size: 16pt;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: {{ $ink }};
      line-height: 1.15;
    }
    .company-meta { font-size: 9pt; color: {{ $muted }}; line-height: 1.55; }
    .doc-title {
      margin: 0 0 12px;
      font-size: 24pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      color: {{ $ink }};
      text-align: right;
    }
    .meta-grid td {
      padding: 0 12px 0 0;
      vertical-align: top;
      width: 25%;
    }
    .meta-grid td:last-child { padding-right: 0; }
    .meta-grid .val {
      display: block;
      margin-top: 2px;
      font-size: 10pt;
      font-weight: 600;
      color: {{ $ink }};
    }
    .status {
      display: inline-block;
      margin-top: 10px;
      padding: 4px 10px;
      border: 1px solid {{ $ink }};
      border-radius: 3px;
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: {{ $ink }};
      background: #fff;
    }
    .panel {
      border: 1px solid {{ $line }};
      border-radius: 4px;
      padding: 12px 14px;
      background: {{ $surface }};
    }
    .panel p { margin: 0 0 4px; font-size: 9.5pt; color: {{ $ink }}; }
    .panel p:last-child { margin-bottom: 0; }
    .vehicle-grid td {
      padding: 8px 10px;
      border: 1px solid {{ $line }};
      vertical-align: top;
      font-size: 9pt;
    }
    .vehicle-grid .vg-label {
      display: block;
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: {{ $faint }};
      margin-bottom: 3px;
    }
    .vehicle-grid .vg-val { font-weight: 600; color: {{ $ink }}; }
    .lines-table { margin-top: 18px; font-size: 9pt; }
    .lines-table thead th {
      padding: 9px 10px;
      text-align: left;
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: {{ $faint }};
      border-bottom: 2px solid {{ $ink }};
    }
    .lines-table tbody td {
      padding: 9px 10px;
      vertical-align: top;
      border-bottom: 1px solid {{ $line }};
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
      min-width: 1.4em;
      text-align: center;
      font-size: 8pt;
      font-weight: 700;
      color: {{ $ink }};
      font-family: {!! $fontMono !!};
    }
    .bottom td { vertical-align: top; padding-top: 4px; }
    .notes { font-size: 9pt; color: {{ $muted }}; line-height: 1.55; padding-right: 16px; }
    .totals-table { font-size: 9pt; }
    .totals-table td { padding: 5px 0; border-bottom: 1px solid {{ $line }}; }
    .totals-table td:first-child { color: {{ $muted }}; }
    .totals-table td:last-child {
      text-align: right;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      font-family: {!! $fontMono !!};
      color: {{ $ink }};
    }
    .totals-table tr.total td {
      padding-top: 10px;
      border-top: 2px solid {{ $ink }};
      border-bottom: none;
      font-size: 10.5pt;
      font-weight: 700;
      color: {{ $ink }};
    }
    .totals-table tr.balance td {
      font-weight: 700;
      color: {{ $ink }};
      border-bottom: none;
    }
    .signatures { margin-top: 28px; }
    .signatures td { width: 50%; padding: 0 16px 0 0; vertical-align: bottom; }
    .signatures td:last-child { padding: 0 0 0 16px; }
    .sig-line {
      border-top: 1px solid {{ $ink }};
      padding-top: 6px;
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: {{ $faint }};
    }
    .footer {
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px solid {{ $line }};
      font-size: 8pt;
      color: {{ $faint }};
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <table width="100%">
      <tr>
        @if($sectionVisible('company_info'))
          <td width="{{ $sectionVisible('invoice_meta') ? '58%' : '100%' }}" valign="top">
            <h1 class="company-name">{{ $company['name'] ?? 'Business Name' }}</h1>
            <div class="company-meta">
              @if(!empty($company['addressLine1']))<div>{{ $company['addressLine1'] }}</div>@endif
              @if(!empty($company['addressLine2']))<div>{{ $company['addressLine2'] }}</div>@endif
              @if(!empty($company['phone']) || !empty($company['email']))
                <div>{{ $company['phone'] ?? '' }}@if(!empty($company['phone']) && !empty($company['email'])) · @endif{{ $company['email'] ?? '' }}</div>
              @endif
              @if(!empty($company['website']))<div>{{ $company['website'] }}</div>@endif
            </div>
          </td>
        @endif
        @if($sectionVisible('invoice_meta'))
          <td width="{{ $sectionVisible('company_info') ? '42%' : '100%' }}" valign="top">
            <h2 class="doc-title">{{ $doc['documentTitle'] ?? 'INVOICE' }}</h2>
            @if(!empty($doc['statusLabel']))
              <div style="text-align:right;"><span class="status">{{ $doc['statusLabel'] }}</span></div>
            @endif
          </td>
        @endif
      </tr>
    </table>

    <div class="rule"></div>

    @if($sectionVisible('invoice_meta'))
      <table class="meta-grid">
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
      <div class="rule-thin"></div>
    @endif

    @if($sectionVisible('customer') || ($sectionVisible('vehicle') && !empty($doc['vehicle'])))
      <table width="100%">
        <tr>
          @if($sectionVisible('customer'))
            <td width="{{ ($sectionVisible('vehicle') && !empty($doc['vehicle'])) ? '50%' : '100%' }}" valign="top" style="padding-right:14px;">
              <div class="label">{{ $sectionLabel('customer', 'Bill to') }}</div>
              <div class="panel">
                <p><strong>{{ $customer['name'] ?? '—' }}</strong></p>
                @foreach(($customer['addressLines'] ?? []) as $line)
                  <p>{{ $line }}</p>
                @endforeach
                @if(!empty($customer['phone']) && $customer['phone'] !== '—')<p>{{ $customer['phone'] }}</p>@endif
                @if(!empty($customer['email']) && $customer['email'] !== '—')<p>{{ $customer['email'] }}</p>@endif
              </div>
            </td>
          @endif
          @if($sectionVisible('vehicle') && !empty($doc['vehicle']))
            <td width="{{ $sectionVisible('customer') ? '50%' : '100%' }}" valign="top" style="padding-left:14px;">
              <div class="label">{{ $sectionLabel('vehicle', 'Vehicle / unit') }}</div>
              <table class="vehicle-grid">
                <tr>
                  <td><span class="vg-label">Unit</span><span class="vg-val">{{ $doc['vehicle']['unitNumber'] ?? '—' }}</span></td>
                  <td><span class="vg-label">Year</span><span class="vg-val">{{ $doc['vehicle']['year'] ?? '—' }}</span></td>
                  <td><span class="vg-label">Make / model</span><span class="vg-val">{{ $doc['vehicle']['makeModel'] ?? '—' }}</span></td>
                </tr>
                <tr>
                  <td colspan="2"><span class="vg-label">VIN</span><span class="vg-val">{{ $doc['vehicle']['vin'] ?? '—' }}</span></td>
                  <td><span class="vg-label">Plate</span><span class="vg-val">{{ $doc['vehicle']['plate'] ?? '—' }}</span></td>
                </tr>
              </table>
            </td>
          @endif
        </tr>
      </table>
    @endif

    @if(($sectionVisible('symptoms') || $sectionVisible('job_summary')) && !empty($doc['note']) && $doc['note'] !== '—')
      <div style="margin-top:16px;">
        <div class="label">{{ $sectionLabel('symptoms', 'Work performed / notes') }}</div>
        <div class="panel notes">{{ $doc['note'] }}</div>
      </div>
    @endif

    @if($sectionVisible('line_items'))
      <table class="lines-table">
        <thead>
          <tr>
            <th style="width:8%;" class="center">Type</th>
            <th style="width:44%;">Description</th>
            <th style="width:12%;" class="num">Qty</th>
            <th style="width:16%;" class="num">Rate</th>
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
      <table class="bottom" style="margin-top:18px;">
        <tr>
          @if($sectionVisible('payment') || $sectionVisible('terms'))
            <td width="{{ $sectionVisible('totals') ? '55%' : '100%' }}">
              @if($sectionVisible('payment'))
                <div class="label">{{ $sectionLabel('payment', 'Payment instructions') }}</div>
              @endif
              <div class="notes">{{ $doc['dueLabel'] ?? 'Due upon receipt' }}. Please reference invoice {{ $doc['number'] ?? '' }} with your payment.</div>
              @if($sectionVisible('terms'))
                <div class="label" style="margin-top:14px;">{{ $sectionLabel('terms', 'Terms & conditions') }}</div>
                <div class="notes">Payment is due per the terms above. Late payments may incur fees where permitted by law.</div>
              @endif
            </td>
          @endif
          @if($sectionVisible('totals'))
            <td width="{{ ($sectionVisible('payment') || $sectionVisible('terms')) ? '45%' : '100%' }}">
              <table class="totals-table">
                <tr><td>Parts</td><td>{{ $totals['parts'] ?? '$0.00' }}</td></tr>
                <tr><td>Labor</td><td>{{ $totals['labor'] ?? '$0.00' }}</td></tr>
                <tr><td>Fees</td><td>{{ $totals['fees'] ?? '$0.00' }}</td></tr>
                <tr><td>Discount</td><td>{{ $totals['discount'] ?? '$0.00' }}</td></tr>
                <tr><td>Tax</td><td>{{ $totals['tax'] ?? '$0.00' }}</td></tr>
                <tr class="total"><td>Total</td><td>{{ $totals['total'] ?? '$0.00' }}</td></tr>
                <tr class="balance"><td>Balance due</td><td>{{ $totals['balanceDue'] ?? $totals['total'] ?? '$0.00' }}</td></tr>
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
        {{ $company['name'] ?? '' }} · {{ $doc['documentTitle'] ?? 'Invoice' }} {{ $doc['number'] ?? '' }} · {{ $doc['generatedAt'] ?? '' }}
      </div>
    @endif
  </div>
</body>
</html>
