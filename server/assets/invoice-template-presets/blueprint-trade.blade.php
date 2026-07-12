@php
  // Blueprint Trade — structured service-shop invoice with steel-blue section
  // bars, boxed panels, and a work-order feel. Built for fleet & repair trades.
  $paperCss = ($paper ?? 'letter') === 'a4' ? 'A4' : 'Letter';
  $m = $margins ?? ['top' => 0.75, 'right' => 0.75, 'bottom' => 0.75, 'left' => 0.75];
  $ink = '#16222e';
  $navy = '#1f3a56';
  $steel = '#3c5876';
  $muted = '#51606f';
  $faint = '#7d8a97';
  $line = '#c7d2dd';
  $surface = '#f0f4f8';
  $onDark = '#f5f8fb';
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
    .mono { font-family: {!! $fontMono !!}; font-variant-numeric: tabular-nums; }
    .muted { color: {{ $muted }}; }

    .head td { vertical-align: top; }
    .company-name {
      margin: 0 0 6px;
      font-size: 16pt;
      font-weight: 700;
      color: {{ $navy }};
      line-height: 1.2;
    }
    .company-meta { font-size: 8.5pt; color: {{ $muted }}; line-height: 1.6; }
    .doc-box {
      border: 2px solid {{ $navy }};
    }
    .doc-box .doc-box-title {
      background: {{ $navy }};
      color: {{ $onDark }};
      text-align: center;
      padding: 7px 10px;
      font-size: 13pt;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
    }
    .doc-box .doc-box-row { border-top: 1px solid {{ $line }}; }
    .doc-box .doc-box-row td {
      padding: 5px 10px;
      font-size: 8.5pt;
    }
    .doc-box .doc-box-row td:first-child {
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-size: 7pt;
      color: {{ $steel }};
      width: 42%;
    }
    .doc-box .doc-box-row td:last-child { text-align: right; font-weight: 700; }

    .section-bar {
      margin-top: 16px;
      background: {{ $navy }};
      color: {{ $onDark }};
      padding: 5px 10px;
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }

    .panel-grid td { vertical-align: top; }
    .panel {
      border: 1px solid {{ $line }};
      border-top: none;
      padding: 10px 12px;
      background: #ffffff;
    }
    .panel p { margin: 0 0 3px; font-size: 9pt; }
    .panel .party-name { font-size: 10pt; font-weight: 700; }

    .spec-table td {
      border: 1px solid {{ $line }};
      border-top: none;
      padding: 7px 10px;
      vertical-align: top;
      font-size: 9pt;
      background: #ffffff;
    }
    .spec-table .sp-label {
      display: block;
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: {{ $steel }};
      margin-bottom: 2px;
    }
    .spec-table .sp-val { font-weight: 700; }

    .notes-panel {
      border: 1px solid {{ $line }};
      border-top: none;
      padding: 10px 12px;
      font-size: 9pt;
      color: {{ $muted }};
      line-height: 1.6;
      background: #ffffff;
    }

    .lines-table { font-size: 9pt; }
    .lines-table th, .lines-table td { border: 1px solid {{ $line }}; }
    .lines-table thead th {
      padding: 7px 9px;
      background: {{ $surface }};
      text-align: left;
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: {{ $steel }};
      border-top: none;
    }
    .lines-table tbody td { padding: 8px 9px; vertical-align: top; }
    .lines-table .num {
      text-align: right;
      white-space: nowrap;
      font-family: {!! $fontMono !!};
      font-variant-numeric: tabular-nums;
    }
    .lines-table .center { text-align: center; }
    .type-tag {
      display: inline-block;
      min-width: 16px;
      padding: 1px 4px;
      border: 1px solid {{ $steel }};
      color: {{ $steel }};
      text-align: center;
      font-size: 7.5pt;
      font-weight: 700;
      font-family: {!! $fontMono !!};
    }

    .bottom { margin-top: 16px; page-break-inside: avoid; }
    .bottom > tbody > tr > td { vertical-align: top; }

    .pay-panel {
      border: 1px solid {{ $line }};
      padding: 10px 12px;
      background: {{ $surface }};
      font-size: 8.5pt;
      color: {{ $muted }};
      line-height: 1.6;
    }
    .pay-panel .pay-head {
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: {{ $steel }};
      margin-bottom: 4px;
    }

    .totals-table { font-size: 9pt; }
    .totals-table td { border: 1px solid {{ $line }}; padding: 5px 10px; background: #ffffff; }
    .totals-table td:first-child {
      color: {{ $steel }};
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .totals-table td:last-child {
      text-align: right;
      font-weight: 700;
      font-family: {!! $fontMono !!};
      font-variant-numeric: tabular-nums;
    }
    .totals-table tr.total td { background: {{ $surface }}; font-size: 10pt; }
    .totals-table tr.balance td {
      background: {{ $navy }};
      color: {{ $onDark }};
      border-color: {{ $navy }};
      font-size: 11pt;
    }
    .totals-table tr.balance td:first-child { color: {{ $onDark }}; }

    .signatures { margin-top: 30px; page-break-inside: avoid; }
    .signatures td { width: 50%; padding: 0 18px 0 0; vertical-align: bottom; }
    .signatures td:last-child { padding: 0 0 0 18px; }
    .sig-line {
      border-top: 1px solid {{ $ink }};
      padding-top: 5px;
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: {{ $faint }};
    }
    .footer {
      margin-top: 20px;
      border-top: 2px solid {{ $navy }};
      padding-top: 8px;
      font-size: 7.5pt;
      color: {{ $faint }};
    }
    .footer td:last-child { text-align: right; }
  </style>
</head>
<body>
  <table class="head">
    <tr>
      @if($sectionVisible('company_info'))
        <td width="{{ $sectionVisible('invoice_meta') ? '56%' : '100%' }}" style="padding-right:20px;">
          <h1 class="company-name">{{ $company['name'] ?? 'Business Name' }}</h1>
          <div class="company-meta">
            @if(!empty($company['addressLine1']))<div>{{ $company['addressLine1'] }}</div>@endif
            @if(!empty($company['addressLine2']))<div>{{ $company['addressLine2'] }}</div>@endif
            @if(!empty($company['phone']))<div>Tel: {{ $company['phone'] }}</div>@endif
            @if(!empty($company['email']))<div>{{ $company['email'] }}</div>@endif
            @if(!empty($company['website']))<div>{{ $company['website'] }}</div>@endif
          </div>
        </td>
      @endif
      @if($sectionVisible('invoice_meta'))
        <td width="{{ $sectionVisible('company_info') ? '44%' : '100%' }}">
          <table class="doc-box">
            <tr><td class="doc-box-title" colspan="2">{{ $doc['documentTitle'] ?? 'INVOICE' }}</td></tr>
            <tr class="doc-box-row"><td>{{ $doc['numberLabel'] ?? 'Invoice #' }}</td><td>{{ $doc['number'] ?? '—' }}</td></tr>
            <tr class="doc-box-row"><td>{{ $doc['dateLabel'] ?? 'Date' }}</td><td>{{ $doc['date'] ?? '—' }}</td></tr>
            <tr class="doc-box-row"><td>{{ $doc['dueDateLabel'] ?? 'Due' }}</td><td>{{ $doc['dueLabel'] ?? '—' }}</td></tr>
            @if(!empty($doc['statusLabel']))
              <tr class="doc-box-row"><td>Status</td><td>{{ $doc['statusLabel'] }}</td></tr>
            @endif
            <tr class="doc-box-row"><td>Amount due</td><td>{{ $totals['balanceDue'] ?? $totals['total'] ?? '$0.00' }}</td></tr>
          </table>
        </td>
      @endif
    </tr>
  </table>

  @if($sectionVisible('customer') || ($sectionVisible('vehicle') && !empty($doc['vehicle'])))
    <table class="panel-grid" style="margin-top:2px;">
      <tr>
        @if($sectionVisible('customer'))
          <td width="{{ ($sectionVisible('vehicle') && !empty($doc['vehicle'])) ? '46%' : '100%' }}" style="{{ ($sectionVisible('vehicle') && !empty($doc['vehicle'])) ? 'padding-right:12px;' : '' }}">
            <div class="section-bar">{{ $sectionLabel('customer', 'Bill to') }}</div>
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
            <div class="section-bar">{{ $sectionLabel('vehicle', 'Vehicle / unit') }}</div>
            <table class="spec-table">
              <tr>
                <td width="25%"><span class="sp-label">Unit</span><span class="sp-val">{{ $doc['vehicle']['unitNumber'] ?? '—' }}</span></td>
                <td width="25%"><span class="sp-label">Year</span><span class="sp-val">{{ $doc['vehicle']['year'] ?? '—' }}</span></td>
                <td width="50%"><span class="sp-label">Make / model</span><span class="sp-val">{{ $doc['vehicle']['makeModel'] ?? '—' }}</span></td>
              </tr>
              <tr>
                <td colspan="2"><span class="sp-label">VIN</span><span class="sp-val mono">{{ $doc['vehicle']['vin'] ?? '—' }}</span></td>
                <td><span class="sp-label">Plate</span><span class="sp-val">{{ $doc['vehicle']['plate'] ?? '—' }}</span></td>
              </tr>
            </table>
          </td>
        @endif
      </tr>
    </table>
  @endif

  @if(($sectionVisible('symptoms') || $sectionVisible('job_summary')) && !empty($doc['note']) && $doc['note'] !== '—')
    <div class="section-bar">{{ $sectionLabel('symptoms', 'Work performed / customer notes') }}</div>
    <div class="notes-panel">{{ $doc['note'] }}</div>
  @endif

  @if($sectionVisible('line_items'))
    <div class="section-bar">{{ $sectionLabel('line_items', 'Parts & labor detail') }}</div>
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
            <td class="center"><span class="type-tag">{{ $line['typeBadge'] ?? '' }}</span></td>
            <td>{{ $line['description'] ?? '' }}</td>
            <td class="num">{{ $line['quantity'] ?? '0' }}</td>
            <td class="num">{{ $line['unitPrice'] ?? '$0.00' }}</td>
            <td class="num">{{ $line['lineAmount'] ?? '$0.00' }}</td>
          </tr>
        @empty
          <tr>
            <td colspan="5" class="center muted" style="padding:14px;">No line items</td>
          </tr>
        @endforelse
      </tbody>
    </table>
  @endif

  @if($sectionVisible('totals') || $sectionVisible('payment') || $sectionVisible('terms'))
    <table class="bottom">
      <tr>
        @if($sectionVisible('payment') || $sectionVisible('terms'))
          <td width="{{ $sectionVisible('totals') ? '52%' : '100%' }}" style="padding-right:14px;">
            @if($sectionVisible('payment'))
              <div class="pay-panel">
                <div class="pay-head">{{ $sectionLabel('payment', 'Payment instructions') }}</div>
                {{ $doc['dueLabel'] ?? 'Due upon receipt' }}. Please reference {{ $doc['numberLabel'] ?? 'invoice' }} {{ $doc['number'] ?? '' }} with your payment.
              </div>
            @endif
            @if($sectionVisible('terms'))
              <div class="pay-panel" style="margin-top:10px;">
                <div class="pay-head">{{ $sectionLabel('terms', 'Terms & conditions') }}</div>
                All work has been completed as described above. Payment is due per the stated terms;
                past-due balances may accrue service charges where permitted by law.
              </div>
            @endif
          </td>
        @endif
        @if($sectionVisible('totals'))
          <td width="{{ ($sectionVisible('payment') || $sectionVisible('terms')) ? '48%' : '100%' }}">
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
    <table class="footer">
      <tr>
        <td>{{ $company['name'] ?? '' }} — {{ $doc['documentTitle'] ?? 'Invoice' }} {{ $doc['number'] ?? '' }}</td>
        <td>Generated {{ $doc['generatedAt'] ?? '' }}</td>
      </tr>
    </table>
  @endif
</body>
</html>
