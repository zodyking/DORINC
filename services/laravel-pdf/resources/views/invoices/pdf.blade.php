@php
  $paperCss = ($paper ?? 'letter') === 'a4' ? 'A4' : 'Letter';
  $m = $margins ?? ['top' => 0.4, 'right' => 0.4, 'bottom' => 0.4, 'left' => 0.4];
  $fontMono = $doc['design']['fontMono'] ?? '"Courier New", Courier, "Liberation Mono", monospace';
  $company = $doc['company'] ?? [];
  $lineItems = $doc['lineItems'] ?? [];
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
      font-family: {!! $fontMono !!};
      font-size: 9pt;
      line-height: 1.2;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet { width: 100%; }
    .rule { border-top: 1px solid #000; margin: 6px 0; }
    .rule-dbl { border-top: 2px solid #000; margin: 8px 0; }
    .hdr {
      display: table;
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 4px;
    }
    .hdr-row { display: table-row; }
    .hdr-left, .hdr-right { display: table-cell; vertical-align: top; }
    .hdr-right { text-align: right; width: 42%; }
    .co-name { font-size: 11pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .co-line { font-size: 8.5pt; }
    .doc-type { font-size: 10pt; font-weight: 700; letter-spacing: 0.12em; }
    .meta { font-size: 8.5pt; margin-top: 2px; }
    .meta b { display: inline-block; min-width: 5.5em; text-align: left; }
    .blk { margin: 6px 0; font-size: 8.5pt; }
    .blk-title {
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .blk-grid { display: table; width: 100%; }
    .blk-row { display: table-row; }
    .blk-k, .blk-v { display: table-cell; padding: 1px 0; vertical-align: top; }
    .blk-k { width: 7em; font-weight: 700; padding-right: 8px; }
    .veh-inline { font-size: 8.5pt; }
    .veh-inline span { margin-right: 12px; }
    .veh-inline .lbl { font-weight: 700; }
    table.matrix {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      margin-top: 4px;
    }
    table.matrix th,
    table.matrix td {
      border: 1px solid #000;
      padding: 2px 4px;
      vertical-align: top;
    }
    table.matrix th {
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      background: #f5f5f5;
      padding: 3px 4px;
    }
    table.matrix td.num { text-align: right; font-variant-numeric: tabular-nums; }
    table.matrix td.center { text-align: center; }
    table.matrix td.idx { width: 2.2em; text-align: center; color: #333; }
    table.matrix td.type { width: 2.4em; text-align: center; font-weight: 700; }
    table.matrix td.qty { width: 3.2em; }
    table.matrix td.rate { width: 4.8em; }
    table.matrix td.amt { width: 5.2em; }
    .note { font-size: 8.5pt; margin: 4px 0; white-space: pre-wrap; }
    .foot {
      display: table;
      width: 100%;
      margin-top: 8px;
      font-size: 8.5pt;
    }
    .foot-left, .foot-right { display: table-cell; vertical-align: top; }
    .foot-right { width: 42%; text-align: right; }
    .totals { border: 1px solid #000; display: inline-block; min-width: 14em; text-align: left; }
    .totals-row {
      display: table;
      width: 100%;
      border-bottom: 1px dotted #666;
    }
    .totals-row:last-child { border-bottom: none; }
    .totals-k, .totals-v {
      display: table-cell;
      padding: 2px 6px;
      font-size: 8.5pt;
    }
    .totals-k { font-weight: 700; text-transform: uppercase; font-size: 7.5pt; }
    .totals-v { text-align: right; font-variant-numeric: tabular-nums; }
    .totals-grand {
      border-top: 2px solid #000;
      font-weight: 700;
      font-size: 9.5pt;
    }
    .sig { margin-top: 10px; font-size: 8pt; }
    .sig-line { border-bottom: 1px solid #000; height: 18px; margin-top: 14px; }
    .stamp { font-size: 7.5pt; margin-top: 8px; color: #333; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="hdr">
      <div class="hdr-row">
        <div class="hdr-left">
          <div class="co-name">{{ $company['name'] ?? 'Devon Onsite Repairs' }}</div>
          <div class="co-line">{{ $company['addressLine1'] ?? '' }} {{ $company['addressLine2'] ?? '' }}</div>
          <div class="co-line">P: {{ $company['phone'] ?? '' }}  E: {{ $company['email'] ?? '' }}</div>
          <div class="co-line">{{ $company['hours'] ?? '' }}</div>
        </div>
        <div class="hdr-right">
          <div class="doc-type">{{ strtoupper($doc['documentTitle'] ?? 'INVOICE') }}</div>
          <div class="meta"><b>{{ $doc['numberLabel'] ?? 'NO.' }}</b> {{ $doc['number'] ?? '—' }}</div>
          <div class="meta"><b>{{ $doc['dateLabel'] ?? 'DATE' }}</b> {{ $doc['date'] ?? '—' }}</div>
          <div class="meta"><b>{{ $doc['dueDateLabel'] ?? 'DUE' }}</b> {{ $doc['dueLabel'] ?? '—' }}</div>
          <div class="meta"><b>STATUS</b> {{ strtoupper($doc['statusLabel'] ?? 'DRAFT') }}</div>
        </div>
      </div>
    </div>

    <div class="rule-dbl"></div>

    <div class="blk">
      <div class="blk-title">Bill To</div>
      <div class="blk-grid">
        <div class="blk-row"><div class="blk-k">CUSTOMER</div><div class="blk-v">{{ $doc['customer']['name'] ?? '—' }}</div></div>
        @foreach(($doc['customer']['addressLines'] ?? []) as $i => $line)
          <div class="blk-row"><div class="blk-k">{{ $i === 0 ? 'ADDRESS' : '' }}</div><div class="blk-v">{{ $line }}</div></div>
        @endforeach
        <div class="blk-row"><div class="blk-k">PHONE</div><div class="blk-v">{{ $doc['customer']['phone'] ?? '—' }}</div></div>
        <div class="blk-row"><div class="blk-k">EMAIL</div><div class="blk-v">{{ $doc['customer']['email'] ?? '—' }}</div></div>
      </div>
    </div>

    @if(!empty($doc['vehicle']))
      <div class="blk">
        <div class="blk-title">Vehicle</div>
        <div class="veh-inline">
          <span><span class="lbl">UNIT</span> {{ $doc['vehicle']['unitNumber'] ?? '—' }}</span>
          <span><span class="lbl">YEAR</span> {{ $doc['vehicle']['year'] ?? '—' }}</span>
          <span><span class="lbl">MAKE/MODEL</span> {{ $doc['vehicle']['makeModel'] ?? '—' }}</span>
          <span><span class="lbl">VIN</span> {{ $doc['vehicle']['vin'] ?? '—' }}</span>
          <span><span class="lbl">PLATE</span> {{ $doc['vehicle']['plate'] ?? '—' }}</span>
        </div>
      </div>
    @endif

    @if(!empty($doc['note']))
      <div class="blk">
        <div class="blk-title">Complaint / Notes</div>
        <div class="note">{{ $doc['note'] }}</div>
      </div>
    @endif

    <div class="rule"></div>

    <table class="matrix">
      <thead>
        <tr>
          <th class="idx">#</th>
          <th class="type">T</th>
          <th>DESCRIPTION</th>
          <th class="qty">QTY</th>
          <th class="rate">RATE</th>
          <th class="amt">AMOUNT</th>
        </tr>
      </thead>
      <tbody>
        @foreach($lineItems as $i => $line)
          <tr>
            <td class="idx">{{ $i + 1 }}</td>
            <td class="type center">{{ $line['typeBadge'] ?? 'L' }}</td>
            <td>{{ $line['description'] ?? '' }}</td>
            <td class="num qty">{{ $line['quantity'] ?? '0' }}</td>
            <td class="num rate">{{ $line['unitPrice'] ?? '$0.00' }}</td>
            <td class="num amt">{{ $line['lineAmount'] ?? '$0.00' }}</td>
          </tr>
        @endforeach
        @if(count($lineItems) === 0)
          <tr>
            <td colspan="6" class="center" style="padding:8px;">— NO LINE ITEMS —</td>
          </tr>
        @endif
      </tbody>
    </table>

    <div class="foot">
      <div class="foot-left">
        <div class="blk-title">Payment</div>
        <div class="co-line">{{ $doc['dueLabel'] ?? 'Due upon receipt' }}</div>
        <div class="co-line" style="margin-top:4px;">Include {{ strtolower($doc['documentTitle'] ?? 'invoice') }} # on payment memo.</div>
        <div class="sig">
          <div class="blk-title">Authorization</div>
          <div class="sig-line"></div>
          <div>Customer signature / date</div>
        </div>
      </div>
      <div class="foot-right">
        <div class="totals">
          <div class="totals-row"><div class="totals-k">Parts</div><div class="totals-v">{{ $doc['totals']['parts'] ?? '$0.00' }}</div></div>
          <div class="totals-row"><div class="totals-k">Labor</div><div class="totals-v">{{ $doc['totals']['labor'] ?? '$0.00' }}</div></div>
          <div class="totals-row"><div class="totals-k">Fees</div><div class="totals-v">{{ $doc['totals']['fees'] ?? '$0.00' }}</div></div>
          <div class="totals-row"><div class="totals-k">Discount</div><div class="totals-v">{{ $doc['totals']['discount'] ?? '$0.00' }}</div></div>
          <div class="totals-row"><div class="totals-k">Tax</div><div class="totals-v">{{ $doc['totals']['tax'] ?? '$0.00' }}</div></div>
          <div class="totals-row totals-grand"><div class="totals-k">Total Due</div><div class="totals-v">{{ $doc['totals']['total'] ?? '$0.00' }}</div></div>
          <div class="totals-row"><div class="totals-k">Balance</div><div class="totals-v">{{ $doc['totals']['balanceDue'] ?? $doc['totals']['total'] ?? '$0.00' }}</div></div>
        </div>
      </div>
    </div>

    <div class="stamp">
      {{ strtoupper($doc['documentTitle'] ?? 'INVOICE') }} {{ $doc['number'] ?? '' }} — GENERATED {{ $doc['generatedAt'] ?? '' }}
    </div>
  </div>
</body>
</html>
