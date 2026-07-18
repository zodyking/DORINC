@php
  // Service Matrix — dot-matrix dealership service invoice. Dense boxed
  // spec grid, monospace uppercase type, ruled line-item area that owns
  // the page, and a boxed pay panel — modeled on classic dealer RO forms.
  $paperCss = ($paper ?? 'letter') === 'a4' ? 'A4' : 'Letter';
  $m = $margins ?? ['top' => 0.75, 'right' => 0.75, 'bottom' => 0.75, 'left' => 0.75];
  $ink = '#141414';
  $mid = '#3d3d3d';
  $rule = '#141414';
  $band = '#efefef';
  $fontMono = 'DejaVu Sans Mono, Courier, monospace';
  $company = $doc['company'] ?? [];
  $lineItems = $doc['lineItems'] ?? [];
  $customer = $doc['customer'] ?? [];
  $totals = $doc['totals'] ?? [];
  $vehicle = $doc['vehicle'] ?? null;
  $note = trim((string) ($doc['note'] ?? ''));
  if ($note === '' || $note === '—') { $note = 'NO COMPLAINT / SYMPTOMS RECORDED.'; }
  $fillerRows = max(0, 13 - count($lineItems));
  $sections = $doc['design']['sections'] ?? [];
  $sectionVisible = function (string $key) use ($sections): bool {
    if (!isset($sections[$key])) return true;
    return (bool) ($sections[$key]['visible'] ?? true);
  };
  $sectionLabel = function (string $key, string $fallback) use ($sections): string {
    $label = $sections[$key]['label'] ?? null;
    return is_string($label) && trim($label) !== '' ? trim($label) : $fallback;
  };
  $customerLine = trim(implode('  ', array_filter([
    $customer['name'] ?? '',
    implode(', ', $customer['addressLines'] ?? []),
  ])));
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
      font-family: {{ $fontMono }};
      font-size: 8pt;
      line-height: 1.35;
      color: {{ $ink }};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    table { border-collapse: collapse; width: 100%; }
    .up { text-transform: uppercase; }

    .masthead td { vertical-align: top; }
    .company-name {
      margin: 0 0 2px;
      font-size: 13pt;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .company-meta { font-size: 7.5pt; color: {{ $mid }}; line-height: 1.4; text-transform: uppercase; }
    .doc-mark {
      margin: 0;
      text-align: right;
      font-size: 12pt;
      font-weight: 700;
      letter-spacing: 0.28em;
    }
    .doc-no {
      margin-top: 2px;
      text-align: right;
      font-size: 10.5pt;
      font-weight: 700;
      letter-spacing: 0.12em;
    }

    .spec-grid { margin-top: 8px; }
    .spec-grid td {
      border: 1px solid {{ $rule }};
      padding: 2px 6px 3px;
      vertical-align: top;
      font-size: 8pt;
    }
    .spec-grid .cap {
      display: block;
      font-size: 6pt;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: {{ $mid }};
    }
    .spec-grid .val { font-weight: 700; text-transform: uppercase; }

    .states { margin-top: 8px; }
    .states .cap {
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .states .body {
      margin-top: 1px;
      font-size: 8pt;
      text-transform: uppercase;
      line-height: 1.45;
    }

    .lines-head { margin-top: 8px; border-top: 1.4px solid {{ $rule }}; border-bottom: 1.4px solid {{ $rule }}; }
    .lines-head th {
      padding: 3px 6px;
      text-align: left;
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .lines-body td {
      padding: 3px 6px;
      vertical-align: top;
      font-size: 8pt;
    }
    .lines-body tr.band td { background: {{ $band }}; }
    .lines-body .num { text-align: right; white-space: nowrap; }
    .lines-body .center { text-align: center; }
    .lines-body tr.filler td { color: transparent; }
    .lines-close { border-top: 1.4px solid {{ $rule }}; height: 0; font-size: 0; line-height: 0; }
    .stars { font-size: 7pt; letter-spacing: 0.18em; text-align: center; color: {{ $mid }}; padding: 2px 0; }

    .bottom { margin-top: 8px; page-break-inside: avoid; }
    .bottom > tbody > tr > td { vertical-align: top; }
    .sig-box { border: 1px solid {{ $rule }}; }
    .sig-box td { padding: 4px 8px; font-size: 6.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: {{ $mid }}; }
    .sig-box .sig-space { height: 30px; }
    .fine {
      margin-top: 5px;
      font-size: 6pt;
      color: {{ $mid }};
      line-height: 1.5;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .customer-support-note {
      border: 1px solid {{ $rule }};
      padding: 8px 10px;
      background: {{ $band }};
    }
    .support-title {
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: {{ $mid }};
      margin: 0 0 6px;
    }
    .support-line {
      margin: 0 0 6px;
      font-size: 7.5pt;
      color: {{ $mid }};
      line-height: 1.45;
      text-transform: none;
      letter-spacing: 0;
    }
    .support-line:last-child { margin-bottom: 0; }

    .pay-box td {
      border: 1px solid {{ $rule }};
      padding: 3px 8px;
      font-size: 7.5pt;
      text-transform: uppercase;
    }
    .pay-box td:first-child { letter-spacing: 0.06em; }
    .pay-box td:last-child { text-align: right; font-weight: 700; white-space: nowrap; }
    .pay-box tr.grand td {
      background: {{ $ink }};
      color: #ffffff;
      font-weight: 700;
      font-size: 8.5pt;
      padding: 5px 8px;
    }

    .footer {
      margin-top: 8px;
      border-top: 1.4px solid {{ $rule }};
      padding-top: 4px;
      text-align: center;
      font-size: 6.5pt;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: {{ $mid }};
    }
  </style>
</head>
<body>
  <table class="masthead">
    <tr>
      @if($sectionVisible('company_info'))
        <td width="{{ $sectionVisible('invoice_meta') ? '62%' : '100%' }}">
          <h1 class="company-name">{{ $company['name'] ?? 'Business Name' }}</h1>
          <div class="company-meta">
            {{ trim(implode(' * ', array_filter([$company['addressLine1'] ?? '', $company['addressLine2'] ?? '']))) }}<br>
            @if(!empty($company['phone']))PHONE {{ $company['phone'] }}@endif
            @if(!empty($company['phone']) && !empty($company['email'])) * @endif
            {{ $company['email'] ?? '' }}
          </div>
        </td>
      @endif
      @if($sectionVisible('invoice_meta'))
        <td width="{{ $sectionVisible('company_info') ? '38%' : '100%' }}">
          <p class="doc-mark">*{{ $doc['documentTitle'] ?? 'INVOICE' }}*</p>
          <div class="doc-no">{{ $doc['number'] ?? '—' }}</div>
        </td>
      @endif
    </tr>
  </table>

  <table class="spec-grid">
    <tr>
      @if($sectionVisible('vehicle') && $vehicle)
        <td width="10%"><span class="cap">Unit</span><span class="val">{{ $vehicle['unitNumber'] ?? '—' }}</span></td>
        <td width="8%"><span class="cap">Year</span><span class="val">{{ $vehicle['year'] ?? '—' }}</span></td>
        <td width="24%"><span class="cap">Make/Model</span><span class="val">{{ $vehicle['makeModel'] ?? '—' }}</span></td>
        <td width="28%"><span class="cap">VIN</span><span class="val">{{ $vehicle['vin'] ?? '—' }}</span></td>
        <td width="12%"><span class="cap">Vehicle</span><span class="val">{{ $vehicle['plate'] ?? '—' }}</span></td>
      @endif
      @if($sectionVisible('invoice_meta'))
        <td width="9%"><span class="cap">{{ $doc['dateLabel'] ?? 'Date' }}</span><span class="val">{{ $doc['date'] ?? '—' }}</span></td>
        <td width="9%"><span class="cap">{{ $doc['dueDateLabel'] ?? 'Due' }}</span><span class="val">{{ $doc['dueLabel'] ?? '—' }}</span></td>
      @endif
    </tr>
    @if($sectionVisible('customer'))
      <tr>
        <td colspan="5">
          <span class="cap">{{ $sectionLabel('customer', 'Customer / Bill to') }}</span>
          <span class="val">{{ $customerLine !== '' ? $customerLine : '—' }}</span>
        </td>
        <td colspan="2">
          <span class="cap">Contact</span>
          <span class="val">{{ (!empty($customer['phone']) && $customer['phone'] !== '—') ? $customer['phone'] : ((!empty($customer['email']) && $customer['email'] !== '—') ? $customer['email'] : '—') }}</span>
        </td>
      </tr>
    @endif
  </table>

  @if($sectionVisible('symptoms') || $sectionVisible('job_summary'))
    <div class="states">
      <div class="cap">{{ $sectionLabel('symptoms', 'Customer states / symptoms') }}:</div>
      <div class="body">{{ $note }}</div>
    </div>
  @endif

  @if($sectionVisible('line_items'))
    <table class="lines-head">
      <tr>
        <th style="width:6%; text-align:center;">Line</th>
        <th style="width:7%; text-align:center;">Type</th>
        <th style="width:46%;">Description</th>
        <th style="width:10%; text-align:right;">Qty</th>
        <th style="width:15%; text-align:right;">Unit</th>
        <th style="width:16%; text-align:right;">Total</th>
      </tr>
    </table>
    <table class="lines-body">
      @forelse($lineItems as $i => $line)
        <tr class="{{ $i % 2 === 1 ? 'band' : '' }}">
          <td style="width:6%;" class="center">{{ $i + 1 }}</td>
          <td style="width:7%;" class="center">{{ $line['typeBadge'] ?? '' }}</td>
          <td style="width:46%;" class="up">{{ $line['description'] ?? '' }}</td>
          <td style="width:10%;" class="num">{{ $line['quantity'] ?? '0' }}</td>
          <td style="width:15%;" class="num">{{ $line['unitPrice'] ?? '$0.00' }}</td>
          <td style="width:16%;" class="num">{{ $line['lineAmount'] ?? '$0.00' }}</td>
        </tr>
      @empty
        <tr><td class="center" style="padding:10px;">NO LINE ITEMS</td></tr>
      @endforelse
      @for($i = 0; $i < $fillerRows; $i++)
        <tr class="filler {{ (count($lineItems) + $i) % 2 === 1 ? 'band' : '' }}">
          <td style="width:6%;">&nbsp;</td><td style="width:7%;"></td><td style="width:46%;"></td>
          <td style="width:10%;"></td><td style="width:15%;"></td><td style="width:16%;"></td>
        </tr>
      @endfor
    </table>
    <div class="lines-close"></div>
    <div class="stars">****************************************************************</div>
  @endif

  <table class="bottom">
    <tr>
      <td width="52%" style="padding-right:12px;">
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
        <td width="48%">
          <table class="pay-box">
            <tr><td>Parts amount</td><td>{{ $totals['parts'] ?? '$0.00' }}</td></tr>
            <tr><td>Labor amount</td><td>{{ $totals['labor'] ?? '$0.00' }}</td></tr>
            <tr><td>Misc. charges</td><td>{{ $totals['fees'] ?? '$0.00' }}</td></tr>
            <tr><td>Discount</td><td>{{ $totals['discount'] ?? '$0.00' }}</td></tr>
            <tr><td>Sales tax</td><td>{{ $totals['tax'] ?? '$0.00' }}</td></tr>
            <tr><td>Total charges</td><td>{{ $totals['total'] ?? '$0.00' }}</td></tr>
            <tr class="grand"><td>Please pay this amount</td><td>{{ $totals['balanceDue'] ?? $totals['total'] ?? '$0.00' }}</td></tr>
          </table>
        </td>
      @endif
    </tr>
  </table>

  @if($sectionVisible('footer'))
    <div class="footer">
      {{ $company['name'] ?? '' }} * {{ $doc['documentTitle'] ?? 'Invoice' }} {{ $doc['number'] ?? '' }}
    </div>
  @endif
</body>
</html>
