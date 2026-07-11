@php
  $paperCss = ($paper ?? 'letter') === 'a4' ? 'A4' : 'Letter';
  $m = $margins ?? ['top' => 0.5, 'right' => 0.5, 'bottom' => 0.5, 'left' => 0.5];
  $accent = $doc['design']['accentColor'] ?? '#2563eb';
  $fontSans = $doc['design']['fontSans'] ?? 'DejaVu Sans, Helvetica, Arial, sans-serif';
  $company = $doc['company'] ?? [];
  $lineItems = $doc['lineItems'] ?? [];
  $customer = $doc['customer'] ?? [];
  $totals = $doc['totals'] ?? [];
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
      font-size: 10pt;
      line-height: 1.45;
      color: #1e293b;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    table { border-collapse: collapse; }
    .sheet { width: 100%; }
    .accent-bar { height: 4px; background: {{ $accent }}; margin-bottom: 18px; }
    .muted { color: #64748b; }
    .label {
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 4px;
    }
    .company-name {
      margin: 0 0 6px;
      font-size: 18pt;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.2;
    }
    .company-meta { font-size: 9pt; color: #475569; line-height: 1.5; }
    .doc-title {
      margin: 0 0 10px;
      font-size: 22pt;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: 0.02em;
      text-align: right;
    }
    .meta-table { width: 100%; font-size: 9.5pt; }
    .meta-table td { padding: 2px 0; vertical-align: top; }
    .meta-table td:first-child { color: #64748b; width: 38%; text-align: right; padding-right: 10px; }
    .meta-table td:last-child { font-weight: 600; text-align: right; color: #0f172a; }
    .status {
      display: inline-block;
      margin-top: 8px;
      padding: 4px 10px;
      border-radius: 4px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #334155;
    }
    .section { margin-top: 18px; }
    .info-box {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px 14px;
      background: #fafbfc;
    }
    .info-box p { margin: 0 0 4px; font-size: 9.5pt; }
    .info-box p:last-child { margin-bottom: 0; }
    .lines-table {
      width: 100%;
      margin-top: 18px;
      font-size: 9.5pt;
    }
    .lines-table thead th {
      padding: 8px 10px;
      text-align: left;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #475569;
      background: #f8fafc;
      border-top: 1px solid #cbd5e1;
      border-bottom: 1px solid #cbd5e1;
    }
    .lines-table tbody td {
      padding: 8px 10px;
      vertical-align: top;
      border-bottom: 1px solid #e2e8f0;
    }
    .lines-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .lines-table .center { text-align: center; }
    .lines-table .desc { color: #0f172a; }
    .type-pill {
      display: inline-block;
      min-width: 1.4em;
      text-align: center;
      font-size: 8pt;
      font-weight: 700;
      color: #475569;
    }
    .bottom { width: 100%; margin-top: 16px; }
    .bottom td { vertical-align: top; }
    .notes {
      padding-right: 20px;
      font-size: 9.5pt;
      color: #475569;
      line-height: 1.5;
    }
    .totals-table { width: 100%; font-size: 9.5pt; }
    .totals-table td { padding: 5px 0; border-bottom: 1px solid #f1f5f9; }
    .totals-table td:first-child { color: #64748b; }
    .totals-table td:last-child { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
    .totals-table tr.total td {
      padding-top: 10px;
      border-top: 2px solid #0f172a;
      border-bottom: none;
      font-size: 11pt;
      font-weight: 700;
      color: #0f172a;
    }
    .totals-table tr.balance td {
      font-weight: 700;
      color: {{ $accent }};
    }
    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      font-size: 8.5pt;
      color: #94a3b8;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="accent-bar"></div>

    <table width="100%">
      <tr>
        <td width="55%" valign="top">
          @if(!empty($company['logoUrl']))
            <img src="{{ $company['logoUrl'] }}" alt="" style="max-height:48px; max-width:160px; margin-bottom:10px;" />
          @endif
          <h1 class="company-name">{{ $company['name'] ?? 'Business Name' }}</h1>
          <div class="company-meta">
            @if(!empty($company['tagline']))<div>{{ $company['tagline'] }}</div>@endif
            <div>{{ $company['addressLine1'] ?? '' }}</div>
            <div>{{ $company['addressLine2'] ?? '' }}</div>
            <div>{{ $company['phone'] ?? '' }}@if(!empty($company['email'])) · {{ $company['email'] }}@endif</div>
            @if(!empty($company['hours']))<div>{{ $company['hours'] }}</div>@endif
          </div>
        </td>
        <td width="45%" valign="top">
          <h2 class="doc-title">{{ $doc['documentTitle'] ?? 'INVOICE' }}</h2>
          <table class="meta-table">
            <tr><td>{{ $doc['numberLabel'] ?? 'Invoice #' }}</td><td>{{ $doc['number'] ?? '—' }}</td></tr>
            <tr><td>{{ $doc['dateLabel'] ?? 'Date' }}</td><td>{{ $doc['date'] ?? '—' }}</td></tr>
            <tr><td>{{ $doc['dueDateLabel'] ?? 'Due' }}</td><td>{{ $doc['dueLabel'] ?? '—' }}</td></tr>
          </table>
          <div style="text-align:right;"><span class="status">{{ $doc['statusLabel'] ?? '' }}</span></div>
        </td>
      </tr>
    </table>

    <table width="100%" class="section">
      <tr>
        <td width="50%" valign="top" style="padding-right:12px;">
          <div class="label">Bill to</div>
          <div class="info-box">
            <p><strong>{{ $customer['name'] ?? '—' }}</strong></p>
            @foreach(($customer['addressLines'] ?? []) as $line)
              <p>{{ $line }}</p>
            @endforeach
            @if(!empty($customer['phone']) && $customer['phone'] !== '—')<p>{{ $customer['phone'] }}</p>@endif
            @if(!empty($customer['email']) && $customer['email'] !== '—')<p>{{ $customer['email'] }}</p>@endif
          </div>
        </td>
        @if(!empty($doc['vehicle']))
          <td width="50%" valign="top" style="padding-left:12px;">
            <div class="label">Vehicle / unit</div>
            <div class="info-box">
              <p><strong>Unit {{ $doc['vehicle']['unitNumber'] ?? '—' }}</strong></p>
              <p>{{ $doc['vehicle']['year'] ?? '' }} {{ $doc['vehicle']['makeModel'] ?? '' }}</p>
              <p>VIN: {{ $doc['vehicle']['vin'] ?? '—' }}</p>
              <p>Plate: {{ $doc['vehicle']['plate'] ?? '—' }}</p>
            </div>
          </td>
        @endif
      </tr>
    </table>

    @if(!empty($doc['note']) && $doc['note'] !== '—')
      <div class="section">
        <div class="label">Work performed / notes</div>
        <div class="info-box notes">{{ $doc['note'] }}</div>
      </div>
    @endif

    <table class="lines-table">
      <thead>
        <tr>
          <th style="width:46%;">Description</th>
          <th style="width:8%;" class="center">Type</th>
          <th style="width:12%;" class="num">Qty</th>
          <th style="width:16%;" class="num">Rate</th>
          <th style="width:18%;" class="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        @forelse($lineItems as $line)
          <tr>
            <td class="desc">{{ $line['description'] ?? '' }}</td>
            <td class="center"><span class="type-pill">{{ $line['typeBadge'] ?? '' }}</span></td>
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

    <table class="bottom">
      <tr>
        <td width="55%">
          <div class="label">Payment terms</div>
          <div class="notes">{{ $doc['dueLabel'] ?? 'Due upon receipt' }}. Please reference invoice {{ $doc['number'] ?? '' }} with your payment.</div>
        </td>
        <td width="45%">
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
      </tr>
    </table>

    <div class="footer">
      Thank you for your business — {{ $company['name'] ?? '' }} · {{ $doc['documentTitle'] ?? 'Invoice' }} {{ $doc['number'] ?? '' }}
    </div>
  </div>
</body>
</html>
