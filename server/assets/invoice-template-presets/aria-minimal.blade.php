@php
  // Aria Minimal — airy, hairline-only invoice with generous whitespace,
  // an oversized amount-due figure, and no boxes or fills. Quietly premium.
  $paperCss = ($paper ?? 'letter') === 'a4' ? 'A4' : 'Letter';
  $m = $margins ?? ['top' => 0.75, 'right' => 0.75, 'bottom' => 0.75, 'left' => 0.75];
  $ink = '#1f2937';
  $muted = '#6b7280';
  $faint = '#9ca3af';
  $hairline = '#e5e7eb';
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
      line-height: 1.6;
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
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: {{ $faint }};
      margin: 0 0 6px;
    }

    .head td { vertical-align: top; }
    .doc-kicker {
      margin: 0 0 2px;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: {{ $faint }};
    }
    .company-name {
      margin: 0;
      font-size: 15pt;
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 1.25;
    }
    .company-meta { margin-top: 6px; font-size: 8pt; color: {{ $muted }}; line-height: 1.7; }
    .due-figure {
      margin: 0;
      text-align: right;
      font-size: 24pt;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.05;
      font-family: {!! $fontMono !!};
    }
    .due-caption {
      margin-top: 4px;
      text-align: right;
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: {{ $faint }};
    }
    .status-note {
      margin-top: 8px;
      text-align: right;
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: {{ $muted }};
    }

    .head-rule { border-top: 1px solid {{ $ink }}; margin-top: 18px; }

    .meta-row { margin-top: 14px; }
    .meta-row td { padding: 0 24px 0 0; vertical-align: top; }
    .meta-row .val { display: block; font-size: 9.5pt; font-weight: 600; }

    .parties { margin-top: 26px; }
    .parties td { vertical-align: top; }
    .party p { margin: 0 0 2px; font-size: 9.5pt; }
    .party .party-name { font-weight: 700; }

    .kv { font-size: 9pt; }
    .kv td { padding: 2px 0; vertical-align: top; }
    .kv .k { width: 34%; color: {{ $faint }}; font-size: 7.5pt; letter-spacing: 0.1em; text-transform: uppercase; padding-right: 8px; }
    .kv .v { font-weight: 600; }

    .notes-block { margin-top: 24px; }
    .notes { font-size: 9pt; color: {{ $muted }}; line-height: 1.7; max-width: 460px; }

    .lines-table { margin-top: 28px; font-size: 9pt; }
    .lines-table thead th {
      padding: 0 8px 8px;
      text-align: left;
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: {{ $faint }};
      border-bottom: 1px solid {{ $ink }};
    }
    .lines-table thead th:first-child { padding-left: 0; }
    .lines-table thead th:last-child { padding-right: 0; }
    .lines-table tbody td {
      padding: 10px 8px;
      vertical-align: top;
      border-bottom: 1px solid {{ $hairline }};
    }
    .lines-table tbody td:first-child { padding-left: 0; }
    .lines-table tbody td:last-child { padding-right: 0; }
    .lines-table .num {
      text-align: right;
      white-space: nowrap;
      font-family: {!! $fontMono !!};
      font-variant-numeric: tabular-nums;
    }
    .type-mark { font-size: 8pt; font-weight: 700; color: {{ $faint }}; font-family: {!! $fontMono !!}; }

    .bottom { margin-top: 26px; page-break-inside: avoid; }
    .bottom > tbody > tr > td { vertical-align: top; }

    .totals-table { font-size: 9pt; }
    .totals-table td { padding: 4px 0; }
    .totals-table td:first-child { color: {{ $muted }}; }
    .totals-table td:last-child {
      text-align: right;
      font-weight: 600;
      font-family: {!! $fontMono !!};
      font-variant-numeric: tabular-nums;
    }
    .totals-table tr.total td {
      padding-top: 10px;
      margin-top: 6px;
      border-top: 1px solid {{ $ink }};
      font-weight: 700;
      font-size: 10pt;
    }
    .totals-table tr.balance td {
      padding-top: 6px;
      font-weight: 700;
      font-size: 11.5pt;
    }

    .fine-copy { font-size: 8.5pt; color: {{ $muted }}; line-height: 1.7; }

    .signatures { margin-top: 40px; page-break-inside: avoid; }
    .signatures td { width: 50%; padding: 0 22px 0 0; vertical-align: bottom; }
    .signatures td:last-child { padding: 0 0 0 22px; }
    .sig-line {
      border-top: 1px solid {{ $hairline }};
      padding-top: 6px;
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: {{ $faint }};
    }
    .footer {
      margin-top: 26px;
      padding-top: 12px;
      border-top: 1px solid {{ $hairline }};
      font-size: 7.5pt;
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
        <td width="{{ $sectionVisible('invoice_meta') ? '55%' : '100%' }}">
          <p class="doc-kicker">{{ $doc['documentTitle'] ?? 'Invoice' }}</p>
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
        <td width="{{ $sectionVisible('company_info') ? '45%' : '100%' }}">
          <p class="due-figure">{{ $totals['balanceDue'] ?? $totals['total'] ?? '$0.00' }}</p>
          <div class="due-caption">Amount due &nbsp;·&nbsp; {{ $doc['dueLabel'] ?? 'Due on receipt' }}</div>
          @if(!empty($doc['statusLabel']))
            <div class="status-note">{{ $doc['statusLabel'] }}</div>
          @endif
        </td>
      @endif
    </tr>
  </table>

  <div class="head-rule"></div>

  @if($sectionVisible('invoice_meta'))
    <table class="meta-row">
      <tr>
        <td>
          <span class="label">{{ $doc['numberLabel'] ?? 'Invoice #' }}</span>
          <span class="val">{{ $doc['number'] ?? '—' }}</span>
        </td>
        <td>
          <span class="label">{{ $doc['dateLabel'] ?? 'Issued' }}</span>
          <span class="val">{{ $doc['date'] ?? '—' }}</span>
        </td>
        <td>
          <span class="label">{{ $doc['dueDateLabel'] ?? 'Due' }}</span>
          <span class="val">{{ $doc['dueLabel'] ?? '—' }}</span>
        </td>
        <td style="padding-right:0;">
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
          <td width="{{ ($sectionVisible('vehicle') && !empty($doc['vehicle'])) ? '50%' : '100%' }}" style="padding-right:26px;">
            <div class="label">{{ $sectionLabel('customer', 'Billed to') }}</div>
            <div class="party">
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
          <td width="{{ $sectionVisible('customer') ? '50%' : '100%' }}">
            <div class="label">{{ $sectionLabel('vehicle', 'Vehicle / unit') }}</div>
            <table class="kv">
              <tr><td class="k">Unit</td><td class="v">{{ $doc['vehicle']['unitNumber'] ?? '—' }}</td></tr>
              <tr><td class="k">Year</td><td class="v">{{ $doc['vehicle']['year'] ?? '—' }}</td></tr>
              <tr><td class="k">Make / model</td><td class="v">{{ $doc['vehicle']['makeModel'] ?? '—' }}</td></tr>
              <tr><td class="k">VIN</td><td class="v mono">{{ $doc['vehicle']['vin'] ?? '—' }}</td></tr>
              <tr><td class="k">Plate</td><td class="v">{{ $doc['vehicle']['plate'] ?? '—' }}</td></tr>
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
          <th style="width:7%;">Type</th>
          <th style="width:45%;">Description</th>
          <th style="width:12%; text-align:right;">Qty</th>
          <th style="width:16%; text-align:right;">Unit price</th>
          <th style="width:20%; text-align:right;">Amount</th>
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
            <td colspan="5" class="muted" style="padding:16px 0; text-align:center;">No line items</td>
          </tr>
        @endforelse
      </tbody>
    </table>
  @endif

  @if($sectionVisible('totals') || $sectionVisible('payment') || $sectionVisible('terms'))
    <table class="bottom">
      <tr>
        @if($sectionVisible('payment') || $sectionVisible('terms'))
          <td width="{{ $sectionVisible('totals') ? '55%' : '100%' }}" style="padding-right:32px;">
            @if($sectionVisible('payment'))
              <div class="label">{{ $sectionLabel('payment', 'Payment') }}</div>
              <div class="fine-copy">{{ $doc['dueLabel'] ?? 'Due upon receipt' }}. Please reference {{ $doc['numberLabel'] ?? 'invoice' }} {{ $doc['number'] ?? '' }} with your payment.</div>
            @endif
            @if($sectionVisible('terms'))
              <div class="label" style="margin-top:16px;">{{ $sectionLabel('terms', 'Terms') }}</div>
              <div class="fine-copy">Payment is due per the terms above. Late payments may incur fees where permitted by law.</div>
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
    <table class="footer">
      <tr>
        <td>{{ $company['name'] ?? '' }} &nbsp;·&nbsp; {{ $doc['documentTitle'] ?? 'Invoice' }} {{ $doc['number'] ?? '' }}</td>
        <td>Thank you</td>
      </tr>
    </table>
  @endif
</body>
</html>
