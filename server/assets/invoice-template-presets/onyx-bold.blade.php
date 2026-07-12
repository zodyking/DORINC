@php
  // Onyx Bold — high-contrast statement invoice with a full-width dark
  // masthead, dark table header, and a bold balance banner.
  $paperCss = ($paper ?? 'letter') === 'a4' ? 'A4' : 'Letter';
  $m = $margins ?? ['top' => 0.75, 'right' => 0.75, 'bottom' => 0.75, 'left' => 0.75];
  $ink = '#111827';
  $dark = '#111827';
  $muted = '#4b5563';
  $faint = '#9ca3af';
  $onDark = '#f9fafb';
  $onDarkMuted = '#d1d5db';
  $line = '#e5e7eb';
  $surface = '#f3f4f6';
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
    .label {
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: {{ $faint }};
      margin: 0 0 5px;
    }

    .masthead { background: {{ $dark }}; }
    .masthead td { padding: 20px 22px; vertical-align: top; }
    .masthead .company-name {
      margin: 0 0 6px;
      font-size: 16pt;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: {{ $onDark }};
      line-height: 1.2;
    }
    .masthead .company-meta { font-size: 8.5pt; color: {{ $onDarkMuted }}; line-height: 1.6; }
    .masthead .doc-title {
      margin: 0;
      font-size: 25pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-align: right;
      color: {{ $onDark }};
      line-height: 1;
    }
    .masthead .doc-sub {
      margin-top: 8px;
      text-align: right;
      font-size: 9.5pt;
      font-weight: 600;
      color: {{ $onDarkMuted }};
    }
    .masthead .status {
      display: inline-block;
      margin-top: 10px;
      padding: 3px 12px;
      border: 1.2px solid {{ $onDark }};
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: {{ $onDark }};
    }

    .meta-strip { border-bottom: 2px solid {{ $dark }}; }
    .meta-strip td {
      width: 25%;
      padding: 12px 22px 12px 0;
      vertical-align: top;
    }
    .meta-strip td:first-child { padding-left: 0; }
    .meta-strip .val { display: block; font-size: 10.5pt; font-weight: 700; color: {{ $ink }}; }

    .parties { margin-top: 20px; }
    .parties td { vertical-align: top; }
    .party p { margin: 0 0 3px; font-size: 9.5pt; }
    .party .party-name { font-size: 11pt; font-weight: 700; margin-bottom: 5px; }

    .vehicle-strip { margin-top: 4px; }
    .vehicle-strip td {
      padding: 7px 10px;
      background: {{ $surface }};
      border-right: 3px solid #ffffff;
      vertical-align: top;
      font-size: 9pt;
    }
    .vehicle-strip td:last-child { border-right: none; }
    .vehicle-strip .vg-label {
      display: block;
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: {{ $faint }};
      margin-bottom: 2px;
    }
    .vehicle-strip .vg-val { font-weight: 700; }

    .notes-block { margin-top: 18px; }
    .notes {
      border-left: 3px solid {{ $dark }};
      padding: 6px 0 6px 12px;
      font-size: 9pt;
      color: {{ $muted }};
      line-height: 1.6;
    }

    .lines-table { margin-top: 22px; font-size: 9pt; }
    .lines-table thead th {
      padding: 9px 10px;
      background: {{ $dark }};
      color: {{ $onDark }};
      text-align: left;
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .lines-table tbody td {
      padding: 9px 10px;
      vertical-align: top;
      border-bottom: 1px solid {{ $line }};
    }
    .lines-table tbody tr.alt td { background: {{ $surface }}; }
    .lines-table .num {
      text-align: right;
      white-space: nowrap;
      font-family: {!! $fontMono !!};
      font-variant-numeric: tabular-nums;
    }
    .lines-table .center { text-align: center; }
    .type-chip {
      display: inline-block;
      min-width: 16px;
      padding: 1px 5px;
      background: {{ $dark }};
      color: {{ $onDark }};
      text-align: center;
      font-size: 7.5pt;
      font-weight: 700;
      font-family: {!! $fontMono !!};
    }

    .bottom { margin-top: 22px; page-break-inside: avoid; }
    .bottom > tbody > tr > td { vertical-align: top; }

    .totals-table { font-size: 9pt; }
    .totals-table td { padding: 5px 2px; border-bottom: 1px solid {{ $line }}; }
    .totals-table td:first-child { color: {{ $muted }}; }
    .totals-table td:last-child {
      text-align: right;
      font-weight: 600;
      font-family: {!! $fontMono !!};
      font-variant-numeric: tabular-nums;
    }
    .totals-table tr.total td {
      border-top: 2px solid {{ $dark }};
      border-bottom: none;
      padding-top: 9px;
      font-size: 10.5pt;
      font-weight: 700;
    }
    .balance-banner { margin-top: 10px; background: {{ $dark }}; }
    .balance-banner td { padding: 11px 14px; }
    .balance-banner .bd-label {
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: {{ $onDarkMuted }};
    }
    .balance-banner .bd-amount {
      text-align: right;
      font-size: 14pt;
      font-weight: 700;
      color: {{ $onDark }};
      font-family: {!! $fontMono !!};
    }

    .pay-copy { font-size: 9pt; color: {{ $muted }}; line-height: 1.6; }

    .signatures { margin-top: 32px; page-break-inside: avoid; }
    .signatures td { width: 50%; padding: 0 18px 0 0; vertical-align: bottom; }
    .signatures td:last-child { padding: 0 0 0 18px; }
    .sig-line {
      border-top: 2px solid {{ $dark }};
      padding-top: 6px;
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: {{ $faint }};
    }
    .footer-band { margin-top: 24px; background: {{ $dark }}; }
    .footer-band td {
      padding: 8px 14px;
      font-size: 7.5pt;
      color: {{ $onDarkMuted }};
      letter-spacing: 0.06em;
    }
    .footer-band td:last-child { text-align: right; }
  </style>
</head>
<body>
  <table class="masthead">
    <tr>
      @if($sectionVisible('company_info'))
        <td width="{{ $sectionVisible('invoice_meta') ? '58%' : '100%' }}">
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
        <td width="{{ $sectionVisible('company_info') ? '42%' : '100%' }}">
          <h2 class="doc-title">{{ $doc['documentTitle'] ?? 'INVOICE' }}</h2>
          <div class="doc-sub">{{ $doc['numberLabel'] ?? 'Invoice #' }} {{ $doc['number'] ?? '—' }}</div>
          @if(!empty($doc['statusLabel']))
            <div style="text-align:right;"><span class="status">{{ $doc['statusLabel'] }}</span></div>
          @endif
        </td>
      @endif
    </tr>
  </table>

  @if($sectionVisible('invoice_meta'))
    <table class="meta-strip">
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
          <span class="label">Amount due</span>
          <span class="val">{{ $totals['balanceDue'] ?? $totals['total'] ?? '$0.00' }}</span>
        </td>
      </tr>
    </table>
  @endif

  @if($sectionVisible('customer') || ($sectionVisible('vehicle') && !empty($doc['vehicle'])))
    <table class="parties">
      <tr>
        @if($sectionVisible('customer'))
          <td width="{{ ($sectionVisible('vehicle') && !empty($doc['vehicle'])) ? '44%' : '100%' }}" style="padding-right:20px;">
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
          <td width="{{ $sectionVisible('customer') ? '56%' : '100%' }}">
            <div class="label">{{ $sectionLabel('vehicle', 'Vehicle / unit') }}</div>
            <table class="vehicle-strip">
              <tr>
                <td width="18%"><span class="vg-label">Unit</span><span class="vg-val">{{ $doc['vehicle']['unitNumber'] ?? '—' }}</span></td>
                <td width="18%"><span class="vg-label">Year</span><span class="vg-val">{{ $doc['vehicle']['year'] ?? '—' }}</span></td>
                <td width="34%"><span class="vg-label">Make / model</span><span class="vg-val">{{ $doc['vehicle']['makeModel'] ?? '—' }}</span></td>
                <td width="30%"><span class="vg-label">Plate</span><span class="vg-val">{{ $doc['vehicle']['plate'] ?? '—' }}</span></td>
              </tr>
              <tr>
                <td colspan="4"><span class="vg-label">VIN</span><span class="vg-val mono">{{ $doc['vehicle']['vin'] ?? '—' }}</span></td>
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
          <th style="width:8%; text-align:center;">Type</th>
          <th style="width:44%;">Description</th>
          <th style="width:12%; text-align:right;">Qty</th>
          <th style="width:16%; text-align:right;">Unit price</th>
          <th style="width:20%; text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        @forelse($lineItems as $i => $line)
          <tr class="{{ $i % 2 === 1 ? 'alt' : '' }}">
            <td class="center"><span class="type-chip">{{ $line['typeBadge'] ?? '' }}</span></td>
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
          <td width="{{ $sectionVisible('totals') ? '52%' : '100%' }}" style="padding-right:24px;">
            @if($sectionVisible('payment'))
              <div class="label">{{ $sectionLabel('payment', 'Payment instructions') }}</div>
              <div class="pay-copy">{{ $doc['dueLabel'] ?? 'Due upon receipt' }}. Reference {{ $doc['numberLabel'] ?? 'invoice' }} {{ $doc['number'] ?? '' }} with your payment.</div>
            @endif
            @if($sectionVisible('terms'))
              <div class="label" style="margin-top:14px;">{{ $sectionLabel('terms', 'Terms & conditions') }}</div>
              <div class="pay-copy">Payment is due per the terms above. Past-due balances may accrue late fees where permitted by law.</div>
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
            </table>
            <table class="balance-banner">
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
    <table class="footer-band">
      <tr>
        <td>{{ $company['name'] ?? '' }} — {{ $doc['documentTitle'] ?? 'Invoice' }} {{ $doc['number'] ?? '' }}</td>
        <td>Thank you for your business</td>
      </tr>
    </table>
  @endif
</body>
</html>
