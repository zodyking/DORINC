@php
  /*
  |--------------------------------------------------------------------------
  | Shop Matrix Invoice
  |--------------------------------------------------------------------------
  | US Letter portrait, standard margins, compact dealership styling,
  | bordered sections, and a clean line-item ledger without internal grid lines.
  | Dense monospace shop-RO aesthetic for automotive service invoices.
  */

  $paperCss = ($paper ?? 'letter') === 'a4' ? 'A4' : 'Letter';

  $m = $margins ?? [
    'top' => 0.50,
    'right' => 0.50,
    'bottom' => 0.50,
    'left' => 0.50,
  ];

  $ink = '#161616';
  $muted = '#707070';
  $darkRule = '#303030';
  $rule = '#707070';
  $headerShade = '#dddddd';
  $bandShade = '#f0f0f0';
  $lightShade = '#f7f7f7';

  $fontMono = '"DejaVu Sans Mono", "Liberation Mono", "Courier New", monospace';

  $company = $doc['company'] ?? [];
  $customer = $doc['customer'] ?? [];
  $vehicle = $doc['vehicle'] ?? [];
  $lineItems = $doc['lineItems'] ?? [];
  $totals = $doc['totals'] ?? [];
  $sections = $doc['design']['sections'] ?? [];

  $documentTitle = strtoupper($doc['documentTitle'] ?? 'INVOICE');
  $documentNumber = $doc['number'] ?? '';
  $documentDate = $doc['date'] ?? '';

  $note = trim((string) ($doc['note'] ?? ''));

  if ($note === '' || $note === '-') {
    $note = 'NO COMPLAINT OR ADDITIONAL SERVICE NOTES RECORDED.';
  }

  $sectionVisible = function (string $key) use ($sections): bool {
    if (!isset($sections[$key])) {
      return true;
    }

    return (bool) ($sections[$key]['visible'] ?? true);
  };

  $sectionLabel = function (
    string $key,
    string $fallback
  ) use ($sections): string {
    $label = $sections[$key]['label'] ?? null;

    if (is_string($label) && trim($label) !== '') {
      return strtoupper(trim($label));
    }

    return strtoupper($fallback);
  };

  $customerAddress = implode(
    ' ',
    array_filter($customer['addressLines'] ?? [])
  );

  $vehicleMakeModel = trim((string) (
    $vehicle['makeModel']
    ?? trim(
      ($vehicle['make'] ?? '') . ' ' .
      ($vehicle['model'] ?? '')
    )
  ));

  $mileageIn = $vehicle['mileageIn']
    ?? $vehicle['mileage']
    ?? '';

  $mileageOut = $vehicle['mileageOut']
    ?? $vehicle['mileage']
    ?? '';

  $busNumber = $vehicle['busNumber']
    ?? $vehicle['unitNumber']
    ?? $vehicle['tag']
    ?? '';

  $customerContact = '';

  if (!empty($customer['phone']) && $customer['phone'] !== '-') {
    $customerContact = $customer['phone'];
  } elseif (!empty($customer['email']) && $customer['email'] !== '-') {
    $customerContact = $customer['email'];
  }

  $partsTotal = $totals['parts'] ?? '$0.00';
  $laborTotal = $totals['labor'] ?? '$0.00';
  $feeTotal = $totals['fees'] ?? '$0.00';

  $grandTotal = $totals['balanceDue']
    ?? $totals['total']
    ?? '$0.00';

  $fillerRows = max(0, 16 - count($lineItems));
@endphp

<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">

  <title>
    {{ $documentTitle }} {{ $documentNumber }}
  </title>

  <style>
    @page { size: {{ $paperCss }}; margin: {{ $m['top'] }}in {{ $m['right'] }}in {{ $m['bottom'] }}in {{ $m['left'] }}in; }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      width: auto;
      margin: 0;
      padding: 0;
    }

    body {
      color: {{ $ink }};
      font-family: {!! $fontMono !!};
      font-size: 6.25pt;
      line-height: 1;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      border-spacing: 0;
      table-layout: fixed;
    }

    td,
    th {
      vertical-align: top;
    }

    .page {
      width: auto;
      margin: 0;
      padding: 0;
    }

    .center {
      text-align: center;
    }

    .right {
      text-align: right;
    }

    .strong {
      font-weight: 700;
    }

    /*
    |--------------------------------------------------------------------------
    | Header
    |--------------------------------------------------------------------------
    */

    .masthead {
      margin: 0 0 5px;
      border: 1px solid {{ $darkRule }};
    }

    .masthead td {
      height: 72px;
      vertical-align: middle;
    }

    .header-company {
      width: 52%;
      padding: 5px 8px;
      text-align: left;
    }

    .header-document {
      width: 25%;
      border-left: 1px solid {{ $rule }};
      border-right: 1px solid {{ $rule }};
      background: {{ $headerShade }};
      padding: 8px 6px 6px;
      text-align: center;
    }

    .header-meta {
      width: 23%;
      padding: 5px 7px;
      text-align: left;
    }

    .company-name {
      margin: 0 0 3px;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 17pt;
      font-weight: 700;
      font-style: italic;
      line-height: 0.95;
      letter-spacing: -0.05em;
    }

    .company-details {
      font-size: 5.4pt;
      font-weight: 700;
      line-height: 1.18;
      text-transform: uppercase;
    }

    .control-number {
      margin-bottom: 8px;
      font-size: 8.2pt;
      font-weight: 700;
      letter-spacing: 0.34em;
      white-space: nowrap;
    }

    .document-title {
      margin-bottom: 9px;
      font-size: 10.2pt;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-decoration: underline;
    }

    .meta-group {
      margin-bottom: 5px;
    }

    .meta-group:last-child {
      margin-bottom: 0;
    }

    .meta-label {
      display: block;
      margin-bottom: 1px;
      font-size: 4.8pt;
      color: #555555;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .meta-value {
      display: block;
      font-size: 6.7pt;
      font-weight: 700;
      text-transform: uppercase;
    }

    /*
    |--------------------------------------------------------------------------
    | Vehicle information
    |--------------------------------------------------------------------------
    */

    .spec-grid {
      border: 1px solid {{ $darkRule }};
      text-transform: uppercase;
    }

    .spec-grid th,
    .spec-grid td {
      border-right: 0.55px solid {{ $rule }};
      overflow: hidden;
    }

    .spec-grid th:last-child,
    .spec-grid td:last-child {
      border-right: 0;
    }

    .spec-grid th {
      height: 10px;
      border-bottom: 0.55px solid {{ $rule }};
      background: {{ $headerShade }};
      padding: 1px 3px;
      font-size: 4.7pt;
      font-weight: 400;
      line-height: 1;
      text-align: center;
      text-decoration: underline;
      white-space: nowrap;
    }

    .spec-grid td {
      height: 14px;
      padding: 2px 3px;
      background: {{ $lightShade }};
      font-size: 6.2pt;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /*
    |--------------------------------------------------------------------------
    | Customer and invoice information
    |--------------------------------------------------------------------------
    */

    .customer-grid,
    .job-grid {
      margin-top: 2px;
      border: 1px solid {{ $darkRule }};
      text-transform: uppercase;
    }

    .customer-grid th,
    .job-grid th {
      height: 10px;
      border-right: 0.55px solid {{ $rule }};
      border-bottom: 0.55px solid {{ $rule }};
      background: {{ $headerShade }};
      padding: 1px 3px;
      font-size: 4.7pt;
      font-weight: 400;
      line-height: 1;
      text-align: center;
      text-decoration: underline;
    }

    .customer-grid td,
    .job-grid td {
      height: 14px;
      border-right: 0.55px solid {{ $rule }};
      padding: 2px 3px;
      font-size: 6.1pt;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .customer-grid th:last-child,
    .customer-grid td:last-child,
    .job-grid th:last-child,
    .job-grid td:last-child {
      border-right: 0;
    }

    .job-grid td {
      text-align: center;
    }

    .statement {
      margin-top: 2px;
      border: 1px solid {{ $darkRule }};
      background: {{ $lightShade }};
      padding: 3px 4px;
      font-size: 6pt;
      line-height: 1.05;
      text-transform: uppercase;
    }

    /*
    |--------------------------------------------------------------------------
    | Line-item ledger
    |--------------------------------------------------------------------------
    */

    .ledger {
      margin-top: 3px;
      border: 1px solid {{ $darkRule }};
      text-transform: uppercase;
    }

    .ledger th {
      height: 12px;
      border: 0;
      border-bottom: 1px solid {{ $darkRule }};
      background: {{ $headerShade }};
      padding: 2px 3px;
      font-size: 4.75pt;
      font-weight: 700;
      line-height: 1;
      white-space: nowrap;
    }

    .ledger td {
      height: 11px;
      border: 0;
      padding: 2px 3px;
      font-size: 5.75pt;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ledger tbody tr:nth-child(even) td {
      background: {{ $bandShade }};
    }

    .ledger .type-cell {
      font-weight: 700;
      text-align: center;
    }

    .ledger .description-cell {
      text-align: left;
    }

    .ledger .qty-cell {
      text-align: center;
    }

    .ledger .unit-cell,
    .ledger .total-cell {
      text-align: right;
    }

    .ledger .total-cell {
      font-weight: 700;
    }

    .ledger .filler td {
      height: 10px;
      color: transparent;
    }

    /*
    |--------------------------------------------------------------------------
    | Authorization and totals
    |--------------------------------------------------------------------------
    */

    .bottom {
      margin-top: 4px;
      page-break-inside: avoid;
    }

    .bottom-left {
      width: 68%;
      padding-right: 5px;
    }

    .bottom-right {
      width: 32%;
    }

    .legal-grid {
      border: 1px solid {{ $darkRule }};
    }

    .legal-grid td {
      height: 39px;
      border-right: 0.55px solid {{ $rule }};
      padding: 3px 4px;
      font-size: 4.15pt;
      line-height: 1.12;
      text-align: justify;
      text-transform: uppercase;
    }

    .legal-grid td:last-child {
      border-right: 0;
      background: {{ $lightShade }};
    }

    .signature-box {
      margin-top: 3px;
      border: 1px solid {{ $darkRule }};
      text-transform: uppercase;
    }

    .signature-box th {
      height: 10px;
      border-right: 0.55px solid {{ $rule }};
      border-bottom: 0.55px solid {{ $rule }};
      background: {{ $headerShade }};
      padding: 1px 3px;
      font-size: 4.6pt;
      font-weight: 700;
      line-height: 1;
      text-align: left;
    }

    .signature-box td {
      height: 19px;
      border-right: 0.55px solid {{ $rule }};
      padding: 8px 3px 1px;
      font-size: 4.8pt;
      line-height: 1;
    }

    .signature-box th:last-child,
    .signature-box td:last-child {
      border-right: 0;
    }

    .customer-support-note {
      border: 1px solid {{ $darkRule }};
      padding: 6px 8px;
      background: #ffffff;
    }
    .support-title {
      font-size: 5.8pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: {{ $muted }};
      margin: 0 0 4px;
    }
    .support-line {
      margin: 0 0 4px;
      font-size: 5.8pt;
      color: {{ $ink }};
      line-height: 1.25;
      text-transform: none;
    }
    .support-line:last-child { margin-bottom: 0; }

    .totals-box {
      border: 1px solid {{ $darkRule }};
      text-transform: uppercase;
    }

    .totals-box th {
      height: 11px;
      border-right: 0.55px solid {{ $rule }};
      border-bottom: 1px solid {{ $darkRule }};
      background: {{ $headerShade }};
      padding: 2px 4px;
      font-size: 4.8pt;
      font-weight: 400;
      line-height: 1;
      text-align: center;
      text-decoration: underline;
    }

    .totals-box td {
      height: 15px;
      border-right: 0.55px solid {{ $rule }};
      border-bottom: 0.55px solid {{ $rule }};
      padding: 3px 4px;
      font-size: 5.8pt;
      line-height: 1;
    }

    .totals-box th:last-child,
    .totals-box td:last-child {
      border-right: 0;
      text-align: right;
      white-space: nowrap;
    }

    .totals-box tr:nth-child(odd) td {
      background: {{ $bandShade }};
    }

    .totals-box .grand-total td {
      height: 27px;
      border-top: 1px solid {{ $darkRule }};
      border-bottom: 0;
      background: {{ $headerShade }};
      padding-top: 5px;
      font-size: 6.3pt;
      font-weight: 700;
      vertical-align: top;
    }

    .totals-box .grand-total td:last-child {
      font-size: 7pt;
    }

    .footer-copy {
      margin-top: 3px;
      border-top: 1px solid {{ $darkRule }};
      padding-top: 2px;
      font-size: 3.9pt;
      line-height: 1.12;
      text-align: justify;
      text-transform: uppercase;
    }
  </style>
</head>

<body>
  <div class="page">

    <table class="masthead">
      <tr>
        <td class="header-company">
          @if($sectionVisible('company_info'))
            <div class="company-name">
              {{ $company['name'] ?? 'Business Name' }}
            </div>

            <div class="company-details">
              @if(!empty($company['addressLine1']))
                {{ $company['addressLine1'] }}<br>
              @endif

              @if(!empty($company['addressLine2']))
                {{ $company['addressLine2'] }}<br>
              @endif

              @if(!empty($company['phone']))
                PHONE {{ $company['phone'] }}
              @endif

              @if(!empty($company['fax']))
                &nbsp; FAX {{ $company['fax'] }}
              @endif

              @if(!empty($company['email']))
                <br>{{ $company['email'] }}
              @endif
            </div>
          @endif
        </td>

        <td class="header-document">
          <div class="control-number">
            {{ $doc['controlNumber'] ?? $documentNumber }}
          </div>

          <div class="document-title">
            *{{ $documentTitle }}*
          </div>
        </td>

        <td class="header-meta">
          <div class="meta-group">
            <span class="meta-label">Invoice number</span>
            <span class="meta-value">{{ $documentNumber }}</span>
          </div>

          <div class="meta-group">
            <span class="meta-label">Date</span>
            <span class="meta-value">{{ $documentDate }}</span>
          </div>
        </td>
      </tr>
    </table>

    @if($sectionVisible('vehicle'))
      <table class="spec-grid">
        <colgroup>
          <col style="width: 10%;">
          <col style="width: 8%;">
          <col style="width: 25%;">
          <col style="width: 27%;">
          <col style="width: 13%;">
          <col style="width: 12%;">
          <col style="width: 5%;">
        </colgroup>

        <tr>
          <th>COLOR</th>
          <th>YEAR</th>
          <th>MAKE / MODEL</th>
          <th>VIN</th>
          <th>VEHICLE</th>
          <th>MILEAGE IN / OUT</th>
          <th>BUS NO.</th>
        </tr>

        <tr>
          <td>{{ strtoupper($vehicle['color'] ?? '') }}</td>

          <td class="center">
            {{ $vehicle['year'] ?? '' }}
          </td>

          <td>
            {{ strtoupper($vehicleMakeModel) }}
          </td>

          <td class="center">
            {{ strtoupper($vehicle['vin'] ?? '') }}
          </td>

          <td class="center">
            {{ $vehicle['plate'] ?? '' }}
          </td>

          <td class="center">
            {{ $mileageIn }}

            @if($mileageIn !== '' || $mileageOut !== '')
              /
            @endif

            {{ $mileageOut }}
          </td>

          <td class="center">
            {{ $vehicle['unitNumber'] ?? '' }}
          </td>
        </tr>
      </table>
    @endif

    @if($sectionVisible('customer'))
      <table class="customer-grid">
        <colgroup>
          <col style="width: 45%;">
          <col style="width: 40%;">
          <col style="width: 15%;">
        </colgroup>

        <tr>
          <th>
            {{ $sectionLabel('customer', 'Bill to / customer') }}
          </th>

          <th>ADDRESS</th>
          <th>CONTACT</th>
        </tr>

        <tr>
          <td>
            {{ strtoupper($customer['name'] ?? '') }}
          </td>

          <td>
            {{ strtoupper($customerAddress) }}
          </td>

          <td>
            {{ strtoupper($customerContact) }}
          </td>
        </tr>
      </table>
    @endif

    <table class="job-grid">
      <colgroup>
        <col style="width: 25%;">
        <col style="width: 25%;">
        <col style="width: 25%;">
        <col style="width: 25%;">
      </colgroup>

      <tr>
        <th>INVOICE NO.</th>
        <th>INVOICE DATE</th>
        <th>R.O. OPENED</th>
        <th>READY</th>
      </tr>

      <tr>
        <td>{{ $documentNumber }}</td>
        <td>{{ $documentDate }}</td>

        <td>
          {{ $doc['openedAt'] ?? $doc['timeOpened'] ?? $documentDate }}
        </td>

        <td>
          {{ $doc['readyAt'] ?? '' }}
        </td>
      </tr>
    </table>

    @if($sectionVisible('symptoms') || $sectionVisible('job_summary'))
      <div class="statement">
        <span class="strong">
          {{ $sectionLabel('symptoms', 'Symptoms / complaints') }}:
        </span>

        {{ strtoupper($note) }}
      </div>
    @endif

    @if($sectionVisible('line_items'))
      <table class="ledger">
        <colgroup>
          <col style="width: 9%;">
          <col style="width: 63%;">
          <col style="width: 6%;">
          <col style="width: 11%;">
          <col style="width: 11%;">
        </colgroup>

        <thead>
          <tr>
            <th>TYPE</th>
            <th style="text-align: left;">DESCRIPTION</th>
            <th>QTY</th>
            <th style="text-align: right;">UNIT</th>
            <th style="text-align: right;">TOTAL</th>
          </tr>
        </thead>

        <tbody>
          @forelse($lineItems as $line)
            <tr>
              <td class="type-cell">
                {{ strtoupper(
                  $line['typeBadge']
                  ?? $line['type']
                  ?? 'SERVICE'
                ) }}
              </td>

              <td class="description-cell">
                {{ strtoupper($line['description'] ?? '') }}
              </td>

              <td class="qty-cell">
                {{ $line['quantity'] ?? '1' }}
              </td>

              <td class="unit-cell">
                {{ $line['unitPrice'] ?? '' }}
              </td>

              <td class="total-cell">
                {{ $line['lineAmount'] ?? '' }}
              </td>
            </tr>
          @empty
            <tr>
              <td class="type-cell">SERVICE</td>

              <td class="description-cell">
                NO SERVICE OPERATIONS RECORDED
              </td>

              <td></td>
              <td></td>
              <td></td>
            </tr>
          @endforelse

          @for($i = 0; $i < $fillerRows; $i++)
            <tr class="filler">
              <td>&nbsp;</td>
              <td></td>
              <td></td>
              <td></td>
              <td></td>
            </tr>
          @endfor
        </tbody>
      </table>
    @endif

    <table class="bottom">
      <tr>
        <td class="bottom-left">
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
          <td class="bottom-right">
            <table class="totals-box">
              <colgroup>
                <col style="width: 65%;">
                <col style="width: 35%;">
              </colgroup>

              <tr>
                <th>CHARGE TYPE</th>
                <th>TOTAL</th>
              </tr>

              <tr>
                <td>PARTS</td>
                <td>{{ $partsTotal }}</td>
              </tr>

              <tr>
                <td>LABOR</td>
                <td>{{ $laborTotal }}</td>
              </tr>

              <tr>
                <td>FEES</td>
                <td>{{ $feeTotal }}</td>
              </tr>

              <tr class="grand-total">
                <td>
                  PLEASE PAY<br>
                  THIS AMOUNT
                </td>

                <td>
                  {{ $grandTotal }}
                </td>
              </tr>
            </table>
          </td>
        @endif
      </tr>
    </table>

    @if($sectionVisible('footer'))
      <div class="footer-copy">
        ALL PARTS INSTALLED ARE NEW UNLESS OTHERWISE SPECIFIED. REMOVED PARTS
        WILL BE DISCARDED UNLESS REQUESTED BEFORE WORK BEGINS. STORAGE FEES MAY
        APPLY TO VEHICLES NOT REMOVED WITHIN THE TIME ALLOWED BY APPLICABLE LAW.
      </div>
    @endif

  </div>
</body>
</html>
