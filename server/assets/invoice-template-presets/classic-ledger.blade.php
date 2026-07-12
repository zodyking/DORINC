@php
  // Classic Ledger — traditional serif invoice with a centered letterhead,
  // double rules, and a fully boxed line-item grid. Formal and timeless.
  $paperCss = ($paper ?? 'letter') === 'a4' ? 'A4' : 'Letter';
  $m = $margins ?? ['top' => 0.75, 'right' => 0.75, 'bottom' => 0.75, 'left' => 0.75];
  $ink = '#1a1a1a';
  $muted = '#444444';
  $faint = '#777777';
  $line = '#1a1a1a';
  $soft = '#cccccc';
  $shade = '#f2f0eb';
  $fontSerif = 'DejaVu Serif, Georgia, Times New Roman, serif';
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
      font-family: {{ $fontSerif }};
      font-size: 9.5pt;
      line-height: 1.5;
      color: {{ $ink }};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    table { border-collapse: collapse; width: 100%; }
    .mono { font-family: {!! $fontMono !!}; font-variant-numeric: tabular-nums; }
    .muted { color: {{ $muted }}; }
    .small-caps {
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: {{ $faint }};
    }

    .letterhead { text-align: center; }
    .letterhead .company-name {
      margin: 0 0 6px;
      font-size: 19pt;
      font-weight: 700;
      letter-spacing: 0.03em;
    }
    .letterhead .company-meta { font-size: 8.5pt; color: {{ $muted }}; line-height: 1.6; }

    .double-rule { border-top: 3px double {{ $line }}; margin-top: 14px; }
    .double-rule-inner { border-top: 1px solid {{ $line }}; margin-top: 2px; }

    .doc-heading { text-align: center; margin-top: 16px; }
    .doc-heading .title {
      display: inline-block;
      margin: 0;
      font-size: 15pt;
      font-weight: 700;
      letter-spacing: 0.35em;
      text-transform: uppercase;
      padding: 0 6px 0 12px;
    }
    .doc-heading .status-note {
      margin-top: 4px;
      font-size: 8pt;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: {{ $faint }};
    }

    .ref-table { margin-top: 16px; }
    .ref-table td {
      width: 25%;
      padding: 7px 10px;
      border: 1px solid {{ $soft }};
      vertical-align: top;
      text-align: center;
    }
    .ref-table .ref-label {
      display: block;
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: {{ $faint }};
      margin-bottom: 2px;
    }
    .ref-table .ref-val { font-size: 9.5pt; font-weight: 700; }

    .parties { margin-top: 18px; }
    .parties td { vertical-align: top; }
    .party-block p { margin: 0 0 3px; font-size: 9.5pt; }
    .party-block .party-name { font-weight: 700; font-size: 10.5pt; }
    .party-head {
      border-bottom: 1px solid {{ $line }};
      padding-bottom: 3px;
      margin-bottom: 7px;
    }

    .vehicle-list { margin-top: 6px; font-size: 9pt; }
    .vehicle-list td { padding: 2px 0; vertical-align: top; }
    .vehicle-list .vl-key { width: 38%; color: {{ $faint }}; font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; }
    .vehicle-list .vl-val { font-weight: 700; }

    .notes-block { margin-top: 16px; }
    .notes {
      margin-top: 6px;
      font-size: 9pt;
      color: {{ $muted }};
      font-style: italic;
      line-height: 1.6;
    }

    .lines-table { margin-top: 18px; font-size: 9pt; }
    .lines-table th, .lines-table td { border: 1px solid {{ $line }}; }
    .lines-table thead th {
      padding: 7px 9px;
      background: {{ $shade }};
      text-align: left;
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: {{ $ink }};
    }
    .lines-table tbody td { padding: 7px 9px; vertical-align: top; }
    .lines-table .num {
      text-align: right;
      white-space: nowrap;
      font-family: {!! $fontMono !!};
      font-variant-numeric: tabular-nums;
    }
    .lines-table .center { text-align: center; }

    .bottom { margin-top: 16px; page-break-inside: avoid; }
    .bottom > tbody > tr > td { vertical-align: top; }

    .totals-box td { border: 1px solid {{ $line }}; padding: 6px 10px; font-size: 9pt; }
    .totals-box td:first-child { color: {{ $muted }}; letter-spacing: 0.04em; }
    .totals-box td:last-child {
      text-align: right;
      font-weight: 700;
      font-family: {!! $fontMono !!};
      font-variant-numeric: tabular-nums;
    }
    .totals-box tr.total td { background: {{ $shade }}; font-size: 10pt; font-weight: 700; color: {{ $ink }}; }
    .totals-box tr.balance td { border-top: 2px solid {{ $line }}; font-size: 10.5pt; font-weight: 700; }

    .terms-block { padding-right: 22px; }
    .terms-head {
      border-bottom: 1px solid {{ $line }};
      padding-bottom: 3px;
      margin-bottom: 7px;
    }
    .terms-copy { font-size: 8.5pt; color: {{ $muted }}; line-height: 1.65; }

    .signatures { margin-top: 34px; page-break-inside: avoid; }
    .signatures td { width: 50%; padding: 0 20px 0 0; vertical-align: bottom; }
    .signatures td:last-child { padding: 0 0 0 20px; }
    .sig-line {
      border-top: 1px solid {{ $ink }};
      padding-top: 5px;
      font-size: 7.5pt;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: {{ $faint }};
      text-align: center;
    }
    .footer {
      margin-top: 24px;
      border-top: 3px double {{ $line }};
      padding-top: 8px;
      text-align: center;
      font-size: 8pt;
      color: {{ $faint }};
      letter-spacing: 0.06em;
    }
  </style>
</head>
<body>
  @if($sectionVisible('company_info'))
    <div class="letterhead">
      <h1 class="company-name">{{ $company['name'] ?? 'Business Name' }}</h1>
      <div class="company-meta">
        @php
          $addressBits = array_filter([$company['addressLine1'] ?? '', $company['addressLine2'] ?? '']);
          $contactBits = array_filter([$company['phone'] ?? '', $company['email'] ?? '', $company['website'] ?? '']);
        @endphp
        @if(count($addressBits))<div>{{ implode(' · ', $addressBits) }}</div>@endif
        @if(count($contactBits))<div>{{ implode(' · ', $contactBits) }}</div>@endif
      </div>
    </div>
  @endif

  <div class="double-rule"></div>
  <div class="double-rule-inner"></div>

  <div class="doc-heading">
    <h2 class="title">{{ $doc['documentTitle'] ?? 'INVOICE' }}</h2>
    @if(!empty($doc['statusLabel']))
      <div class="status-note">{{ $doc['statusLabel'] }}</div>
    @endif
  </div>

  @if($sectionVisible('invoice_meta'))
    <table class="ref-table">
      <tr>
        <td>
          <span class="ref-label">{{ $doc['numberLabel'] ?? 'Invoice No.' }}</span>
          <span class="ref-val">{{ $doc['number'] ?? '—' }}</span>
        </td>
        <td>
          <span class="ref-label">{{ $doc['dateLabel'] ?? 'Date of issue' }}</span>
          <span class="ref-val">{{ $doc['date'] ?? '—' }}</span>
        </td>
        <td>
          <span class="ref-label">{{ $doc['dueDateLabel'] ?? 'Terms' }}</span>
          <span class="ref-val">{{ $doc['dueLabel'] ?? '—' }}</span>
        </td>
        <td>
          <span class="ref-label">Amount due</span>
          <span class="ref-val">{{ $totals['balanceDue'] ?? $totals['total'] ?? '$0.00' }}</span>
        </td>
      </tr>
    </table>
  @endif

  @if($sectionVisible('customer') || ($sectionVisible('vehicle') && !empty($doc['vehicle'])))
    <table class="parties">
      <tr>
        @if($sectionVisible('customer'))
          <td width="{{ ($sectionVisible('vehicle') && !empty($doc['vehicle'])) ? '50%' : '100%' }}" style="padding-right:18px;">
            <div class="party-head small-caps">{{ $sectionLabel('customer', 'Billed to') }}</div>
            <div class="party-block">
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
          <td width="{{ $sectionVisible('customer') ? '50%' : '100%' }}" style="padding-left:18px;">
            <div class="party-head small-caps">{{ $sectionLabel('vehicle', 'Vehicle / unit') }}</div>
            <table class="vehicle-list">
              <tr><td class="vl-key">Unit</td><td class="vl-val">{{ $doc['vehicle']['unitNumber'] ?? '—' }}</td></tr>
              <tr><td class="vl-key">Year</td><td class="vl-val">{{ $doc['vehicle']['year'] ?? '—' }}</td></tr>
              <tr><td class="vl-key">Make / model</td><td class="vl-val">{{ $doc['vehicle']['makeModel'] ?? '—' }}</td></tr>
              <tr><td class="vl-key">VIN</td><td class="vl-val mono">{{ $doc['vehicle']['vin'] ?? '—' }}</td></tr>
              <tr><td class="vl-key">Plate</td><td class="vl-val">{{ $doc['vehicle']['plate'] ?? '—' }}</td></tr>
            </table>
          </td>
        @endif
      </tr>
    </table>
  @endif

  @if(($sectionVisible('symptoms') || $sectionVisible('job_summary')) && !empty($doc['note']) && $doc['note'] !== '—')
    <div class="notes-block">
      <div class="party-head small-caps">{{ $sectionLabel('symptoms', 'Description of work') }}</div>
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
            <td class="center mono">{{ $line['typeBadge'] ?? '' }}</td>
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
          <td width="{{ $sectionVisible('totals') ? '52%' : '100%' }}" class="terms-block">
            @if($sectionVisible('payment'))
              <div class="terms-head small-caps">{{ $sectionLabel('payment', 'Remittance') }}</div>
              <div class="terms-copy">
                Payment terms: {{ $doc['dueLabel'] ?? 'Due upon receipt' }}. Kindly reference
                {{ $doc['numberLabel'] ?? 'invoice' }} {{ $doc['number'] ?? '' }} with your remittance.
              </div>
            @endif
            @if($sectionVisible('terms'))
              <div class="terms-head small-caps" style="margin-top:14px;">{{ $sectionLabel('terms', 'Terms & conditions') }}</div>
              <div class="terms-copy">
                All amounts are payable in full according to the terms stated above. Accounts past due
                may be subject to service charges where permitted by law.
              </div>
            @endif
          </td>
        @endif
        @if($sectionVisible('totals'))
          <td width="{{ ($sectionVisible('payment') || $sectionVisible('terms')) ? '48%' : '100%' }}">
            <table class="totals-box">
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
        <td><div class="sig-line">Customer signature &amp; date</div></td>
      </tr>
    </table>
    <div class="footer">
      {{ $company['name'] ?? '' }} — {{ $doc['documentTitle'] ?? 'Invoice' }} {{ $doc['number'] ?? '' }} — We appreciate your prompt payment
    </div>
  @endif
</body>
</html>
