@php
  // Executive Slate — two-column layout with a tinted sidebar for company,
  // customer, and payment details, and a wide content column for the work.
  $paperCss = ($paper ?? 'letter') === 'a4' ? 'A4' : 'Letter';
  $m = $margins ?? ['top' => 0.75, 'right' => 0.75, 'bottom' => 0.75, 'left' => 0.75];
  $ink = '#1c2430';
  $muted = '#4e5a68';
  $faint = '#8494a5';
  $line = '#d5dae1';
  $hairline = '#e4e8ed';
  $sidebar = '#eceff3';
  $slate = '#2b3949';
  $onDark = '#f4f6f9';
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
    .side-label {
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: {{ $faint }};
      margin: 0 0 5px;
    }

    .title-block { border-bottom: 3px solid {{ $slate }}; padding-bottom: 14px; }
    .title-block td { vertical-align: bottom; }
    .doc-title {
      margin: 0;
      font-size: 26pt;
      font-weight: 700;
      letter-spacing: 0.06em;
      line-height: 1;
      color: {{ $slate }};
    }
    .doc-sub { margin-top: 6px; font-size: 9.5pt; font-weight: 600; color: {{ $muted }}; }
    .title-meta { text-align: right; font-size: 8.5pt; color: {{ $muted }}; line-height: 1.7; }
    .title-meta .tm-strong { font-weight: 700; color: {{ $ink }}; }
    .status {
      display: inline-block;
      margin-top: 6px;
      padding: 2px 10px;
      background: {{ $slate }};
      color: {{ $onDark }};
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    .layout { margin-top: 0; }
    .layout > tbody > tr > td { vertical-align: top; }
    .sidebar-cell {
      width: 31%;
      background: {{ $sidebar }};
      padding: 16px 14px;
    }
    .content-cell {
      width: 69%;
      padding: 16px 0 0 22px;
    }

    .side-section { margin-bottom: 18px; }
    .side-section p { margin: 0 0 3px; font-size: 8.5pt; }
    .side-section .side-strong { font-size: 9.5pt; font-weight: 700; }
    .side-rule { border-top: 1px solid {{ $line }}; margin: 0 0 14px; }

    .side-kv td { padding: 2px 0; font-size: 8.5pt; vertical-align: top; }
    .side-kv .k { color: {{ $faint }}; width: 40%; padding-right: 6px; }
    .side-kv .v { font-weight: 600; }

    .content-h {
      margin: 0 0 8px;
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: {{ $faint }};
      border-bottom: 1px solid {{ $line }};
      padding-bottom: 5px;
    }

    .notes { font-size: 9pt; color: {{ $muted }}; line-height: 1.6; margin-bottom: 18px; }

    .lines-table { font-size: 9pt; margin-bottom: 4px; }
    .lines-table thead th {
      padding: 7px 8px;
      background: {{ $slate }};
      color: {{ $onDark }};
      text-align: left;
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .lines-table tbody td {
      padding: 8px;
      vertical-align: top;
      border-bottom: 1px solid {{ $hairline }};
    }
    .lines-table .num {
      text-align: right;
      white-space: nowrap;
      font-family: {!! $fontMono !!};
      font-variant-numeric: tabular-nums;
    }
    .lines-table .center { text-align: center; }
    .type-mark { font-size: 8pt; font-weight: 700; color: {{ $faint }}; font-family: {!! $fontMono !!}; }

    .totals-wrap { margin-top: 14px; page-break-inside: avoid; }
    .totals-wrap > tbody > tr > td { vertical-align: top; }
    .totals-table { font-size: 9pt; }
    .totals-table td { padding: 4px 2px; border-bottom: 1px solid {{ $hairline }}; }
    .totals-table td:first-child { color: {{ $muted }}; }
    .totals-table td:last-child {
      text-align: right;
      font-weight: 600;
      font-family: {!! $fontMono !!};
      font-variant-numeric: tabular-nums;
    }
    .totals-table tr.total td {
      padding-top: 8px;
      border-top: 2px solid {{ $slate }};
      border-bottom: none;
      font-size: 10pt;
      font-weight: 700;
    }
    .balance-box { margin-top: 8px; background: {{ $slate }}; }
    .balance-box td { padding: 9px 12px; }
    .balance-box .bb-label {
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      white-space: nowrap;
      color: {{ $onDark }};
    }
    .balance-box .bb-amount {
      text-align: right;
      font-size: 12.5pt;
      font-weight: 700;
      color: {{ $onDark }};
      font-family: {!! $fontMono !!};
    }

    .terms-copy { font-size: 8pt; color: {{ $muted }}; line-height: 1.65; }

    .signatures { margin-top: 24px; page-break-inside: avoid; }
    .signatures td { width: 50%; padding: 0 16px 0 0; vertical-align: bottom; }
    .signatures td:last-child { padding: 0 0 0 16px; }
    .sig-line {
      border-top: 1px solid {{ $slate }};
      padding-top: 5px;
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: {{ $faint }};
    }
    .footer {
      margin-top: 14px;
      padding-top: 8px;
      border-top: 1px solid {{ $line }};
      font-size: 7.5pt;
      color: {{ $faint }};
      text-align: center;
      letter-spacing: 0.05em;
    }
  </style>
</head>
<body>
  <table class="title-block">
    <tr>
      <td width="55%">
        <h1 class="doc-title">{{ $doc['documentTitle'] ?? 'INVOICE' }}</h1>
        @if($sectionVisible('invoice_meta'))
          <div class="doc-sub">{{ $doc['numberLabel'] ?? 'Invoice #' }} {{ $doc['number'] ?? '—' }}</div>
        @endif
      </td>
      <td width="45%">
        @if($sectionVisible('invoice_meta'))
          <div class="title-meta">
            <div><span class="tm-strong">{{ $doc['dateLabel'] ?? 'Date' }}:</span> {{ $doc['date'] ?? '—' }}</div>
            <div><span class="tm-strong">{{ $doc['dueDateLabel'] ?? 'Due' }}:</span> {{ $doc['dueLabel'] ?? '—' }}</div>
            <div><span class="tm-strong">Generated:</span> {{ $doc['generatedAt'] ?? '—' }}</div>
            @if(!empty($doc['statusLabel']))
              <div><span class="status">{{ $doc['statusLabel'] }}</span></div>
            @endif
          </div>
        @endif
      </td>
    </tr>
  </table>

  <table class="layout">
    <tr>
      <td class="sidebar-cell">
        @if($sectionVisible('company_info'))
          <div class="side-section">
            <div class="side-label">From</div>
            <p class="side-strong">{{ $company['name'] ?? 'Business Name' }}</p>
            @if(!empty($company['addressLine1']))<p class="muted">{{ $company['addressLine1'] }}</p>@endif
            @if(!empty($company['addressLine2']))<p class="muted">{{ $company['addressLine2'] }}</p>@endif
            @if(!empty($company['phone']))<p class="muted">{{ $company['phone'] }}</p>@endif
            @if(!empty($company['email']))<p class="muted">{{ $company['email'] }}</p>@endif
            @if(!empty($company['website']))<p class="muted">{{ $company['website'] }}</p>@endif
          </div>
          <div class="side-rule"></div>
        @endif

        @if($sectionVisible('customer'))
          <div class="side-section">
            <div class="side-label">{{ $sectionLabel('customer', 'Bill to') }}</div>
            <p class="side-strong">{{ $customer['name'] ?? '—' }}</p>
            @foreach(($customer['addressLines'] ?? []) as $line)
              <p class="muted">{{ $line }}</p>
            @endforeach
            @if(!empty($customer['phone']) && $customer['phone'] !== '—')<p class="muted">{{ $customer['phone'] }}</p>@endif
            @if(!empty($customer['email']) && $customer['email'] !== '—')<p class="muted">{{ $customer['email'] }}</p>@endif
          </div>
          <div class="side-rule"></div>
        @endif

        @if($sectionVisible('vehicle') && !empty($doc['vehicle']))
          <div class="side-section">
            <div class="side-label">{{ $sectionLabel('vehicle', 'Vehicle / unit') }}</div>
            <table class="side-kv">
              <tr><td class="k">Unit</td><td class="v">{{ $doc['vehicle']['unitNumber'] ?? '—' }}</td></tr>
              <tr><td class="k">Year</td><td class="v">{{ $doc['vehicle']['year'] ?? '—' }}</td></tr>
              <tr><td class="k">Make</td><td class="v">{{ $doc['vehicle']['makeModel'] ?? '—' }}</td></tr>
              <tr><td class="k">VIN</td><td class="v mono" style="font-size:7.5pt;">{{ $doc['vehicle']['vin'] ?? '—' }}</td></tr>
              <tr><td class="k">Plate</td><td class="v">{{ $doc['vehicle']['plate'] ?? '—' }}</td></tr>
            </table>
          </div>
          <div class="side-rule"></div>
        @endif

        @if($sectionVisible('payment'))
          <div class="side-section">
            <div class="side-label">{{ $sectionLabel('payment', 'Payment') }}</div>
            <p class="muted" style="line-height:1.6;">
              {{ $doc['dueLabel'] ?? 'Due upon receipt' }}. Reference
              {{ $doc['numberLabel'] ?? 'invoice' }} {{ $doc['number'] ?? '' }} with your payment.
            </p>
          </div>
        @endif
      </td>

      <td class="content-cell">
        @if(($sectionVisible('symptoms') || $sectionVisible('job_summary')) && !empty($doc['note']) && $doc['note'] !== '—')
          <div class="content-h">{{ $sectionLabel('symptoms', 'Work performed / notes') }}</div>
          <div class="notes">{{ $doc['note'] }}</div>
        @endif

        @if($sectionVisible('line_items'))
          <table class="lines-table">
            <thead>
              <tr>
                <th style="width:9%; text-align:center;">Type</th>
                <th style="width:43%;">Description</th>
                <th style="width:12%; text-align:right;">Qty</th>
                <th style="width:16%; text-align:right;">Unit price</th>
                <th style="width:20%; text-align:right;">Amount</th>
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
                  <td colspan="5" class="center muted" style="padding:14px;">No line items</td>
                </tr>
              @endforelse
            </tbody>
          </table>
        @endif

        @if($sectionVisible('totals') || $sectionVisible('terms'))
          <table class="totals-wrap">
            <tr>
              @if($sectionVisible('terms'))
                <td width="{{ $sectionVisible('totals') ? '48%' : '100%' }}" style="padding-right:18px;">
                  <div class="content-h">{{ $sectionLabel('terms', 'Terms & conditions') }}</div>
                  <div class="terms-copy">
                    Payment is due per the terms shown. Past-due balances may accrue
                    late fees where permitted by law. Please contact us with any
                    questions about this {{ strtolower($doc['documentTitle'] ?? 'invoice') }}.
                  </div>
                </td>
              @endif
              @if($sectionVisible('totals'))
                <td width="{{ $sectionVisible('terms') ? '52%' : '100%' }}">
                  <table class="totals-table">
                    <tr><td>Parts</td><td>{{ $totals['parts'] ?? '$0.00' }}</td></tr>
                    <tr><td>Labor</td><td>{{ $totals['labor'] ?? '$0.00' }}</td></tr>
                    <tr><td>Fees</td><td>{{ $totals['fees'] ?? '$0.00' }}</td></tr>
                    <tr><td>Discount</td><td>{{ $totals['discount'] ?? '$0.00' }}</td></tr>
                    <tr><td>Tax</td><td>{{ $totals['tax'] ?? '$0.00' }}</td></tr>
                    <tr class="total"><td>Total</td><td>{{ $totals['total'] ?? '$0.00' }}</td></tr>
                  </table>
                  <table class="balance-box">
                    <tr>
                      <td class="bb-label">Balance due</td>
                      <td class="bb-amount">{{ $totals['balanceDue'] ?? $totals['total'] ?? '$0.00' }}</td>
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
        @endif
      </td>
    </tr>
  </table>

  @if($sectionVisible('footer'))
    <div class="footer">
      {{ $company['name'] ?? '' }} &nbsp;·&nbsp; {{ $doc['documentTitle'] ?? 'Invoice' }} {{ $doc['number'] ?? '' }} &nbsp;·&nbsp; Thank you for your business
    </div>
  @endif
</body>
</html>
