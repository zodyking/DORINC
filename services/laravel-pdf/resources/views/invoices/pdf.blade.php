@php
  $paperCss = ($paper ?? 'letter') === 'a4' ? 'A4' : 'Letter';
  $m = $margins ?? ['top' => 0.5, 'right' => 0.5, 'bottom' => 0.5, 'left' => 0.5];
  $accent = $doc['design']['accentColor'] ?? '#ffd400';
  $accent2 = $doc['design']['accentColor2'] ?? '#0b0f1a';
  $fontSans = $doc['design']['fontSans'] ?? 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
  $fontMono = $doc['design']['fontMono'] ?? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  $company = $doc['company'] ?? [];
@endphp
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{{ $doc['documentTitle'] ?? 'Invoice' }} {{ $doc['number'] ?? '' }}</title>
  <style>
    @page { size: {{ $paperCss }}; margin: {{ $m['top'] }}in {{ $m['right'] }}in {{ $m['bottom'] }}in {{ $m['left'] }}in; }
    :root{
      --ink:#111; --muted:#666; --soft:#f3f4f6; --soft2:#eef0f3;
      --line:#1a1a1a; --hair:#cfd4dc;
      --accent:{{ $accent }}; --accent2:{{ $accent2 }};
      --danger:#c1121f;
      --mono: {{ $fontMono }};
      --sans: {{ $fontSans }};
      --radius: 10px;
    }
    body{ margin:0; font-family:var(--sans); color:var(--ink); -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .sheet{ width:100%; background:#fff; }
    .pad{ padding:20px 22px; }
    .row{ display:flex; gap:16px; }
    .col{ flex:1; }
    .right{ text-align:right; }
    .muted{ color:var(--muted); }
    .mono{ font-family:var(--mono); }
    .small{ font-size:12px; }
    .xs{ font-size:11px; }
    .tight{ line-height:1.22; }
    .sep{ height:1px; background:var(--line); margin:14px 0; }
    .hair{ height:1px; background:var(--hair); margin:10px 0; }
    .topbar{ display:flex; justify-content:space-between; align-items:flex-start; gap:18px; padding:22px 22px 10px; }
    .brand{ display:flex; gap:12px; align-items:flex-start; min-width:300px; }
    .logo{ width:58px; height:58px; display:grid; place-items:center; border-radius:12px; background:var(--accent); border:1px solid #000; overflow:hidden; font-weight:1000; letter-spacing:.08em; text-transform:uppercase; font-size:12px; line-height:1.1; text-align:center; }
    .logo img{ width:100%; height:100%; object-fit:cover; }
    .brand h1{ margin:0; font-size:18px; letter-spacing:.06em; text-transform:uppercase; }
    .brand .tagline{ margin-top:2px; font-size:11px; color:var(--muted); letter-spacing:.03em; text-transform:uppercase; }
    .brand .contact{ margin-top:8px; font-size:11px; line-height:1.4; }
    .docmeta{ text-align:right; min-width:260px; }
    .docmeta .title{ font-size:14px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; margin:0; }
    .docmeta .sub{ margin-top:6px; font-size:11px; color:var(--muted); }
    .status-chip{ display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px; border:1px solid #000; background:var(--accent); font-weight:800; font-size:11px; letter-spacing:.04em; text-transform:uppercase; margin-top:10px; }
    .dot{ width:8px; height:8px; border-radius:50%; background:#000; }
    .strip{ display:flex; justify-content:space-between; gap:16px; padding:0 22px 14px; }
    .box{ border:1px solid #000; border-radius:var(--radius); padding:12px 12px 10px; background:#fff; }
    .box h3{ margin:0 0 8px; font-size:11px; letter-spacing:.10em; text-transform:uppercase; }
    .kv{ display:grid; grid-template-columns:96px 1fr; gap:2px 10px; font-size:11px; line-height:1.4; }
    .k{ font-weight:800; }
    .card{ border:1px solid #000; border-radius:var(--radius); overflow:hidden; background:#fff; margin-top:14px; }
    .card .head{ display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:var(--soft2); border-bottom:1px solid var(--hair); }
    .card .head h3{ margin:0; font-size:11px; letter-spacing:.10em; text-transform:uppercase; }
    .flag{ font-size:10px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; padding:5px 8px; border:1px solid #000; border-radius:999px; background:var(--accent); }
    .card .body{ padding:10px 12px 12px; }
    .vehicle-grid{ display:grid; grid-template-columns:1fr 1fr; gap:12px 18px; }
    .lines{ display:grid; grid-template-columns:140px 1fr; gap:3px 10px; font-size:11px; line-height:1.35; }
    .lines .label{ font-weight:800; }
    .symptoms .note{ border-left:4px solid #000; padding-left:10px; font-style:italic; }
    table{ width:100%; border-collapse:collapse; font-size:11px; }
    thead th{ text-align:left; padding:8px; border-top:1px solid #000; border-bottom:1px solid #000; font-size:10px; letter-spacing:.12em; text-transform:uppercase; }
    tbody td{ padding:7px 8px; border-bottom:1px solid var(--hair); vertical-align:top; }
    tbody tr:nth-child(even){ background:#fafafa; }
    .num{ text-align:right; font-variant-numeric:tabular-nums; }
    .center{ text-align:center; }
    .desc{ font-weight:800; }
    .type-badge{ display:inline-block; padding:3px 7px; border:1px solid #000; border-radius:999px; font-size:10px; font-weight:900; background:var(--soft2); min-width:26px; text-align:center; }
    .bottom{ display:grid; grid-template-columns:1fr 1.25fr; gap:16px; margin-top:14px; }
    .totals{ border:1px solid #000; border-radius:var(--radius); overflow:hidden; }
    .totals .head{ padding:10px 12px; background:var(--accent2); color:#fff; display:flex; justify-content:space-between; align-items:center; }
    .totals .head h3{ margin:0; font-size:11px; letter-spacing:.12em; text-transform:uppercase; }
    .totals .body{ padding:10px 12px 12px; }
    .totals .rowline{ display:flex; justify-content:space-between; gap:10px; padding:6px 0; border-bottom:1px dashed var(--hair); font-size:11px; }
    .totals .rowline .l{ color:var(--muted); font-weight:800; text-transform:uppercase; font-size:10px; }
    .totals .rowline .r{ font-weight:900; }
    .grand{ margin-top:10px; padding:10px 12px; border:1px solid #000; border-radius:12px; background:var(--accent); display:flex; justify-content:space-between; align-items:baseline; }
    .grand .label{ font-weight:1000; letter-spacing:.12em; text-transform:uppercase; font-size:11px; }
    .grand .amt{ font-weight:1000; font-size:18px; font-variant-numeric:tabular-nums; }
    .pay{ border:1px solid #000; border-radius:var(--radius); padding:12px; }
    .pay h3{ margin:0 0 8px; font-size:11px; letter-spacing:.12em; text-transform:uppercase; }
    .footer{ display:flex; justify-content:space-between; gap:16px; margin-top:16px; padding-top:12px; border-top:1px solid #000; font-size:10.5px; }
    .signature{ border:1px solid var(--hair); border-radius:10px; padding:10px; }
    .sigline{ height:34px; border-bottom:1px solid var(--hair); margin:8px 0 6px; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="topbar">
      <div class="brand">
        <div class="logo">
          @if(!empty($company['logoUrl']))
            <img src="{{ $company['logoUrl'] }}" alt="Logo" />
          @else
            {!! $company['logoText'] ?? 'DOR<br/>INC' !!}
          @endif
        </div>
        <div>
          <h1>{{ $company['name'] ?? 'Devon Onsite Repairs' }}</h1>
          <div class="tagline">{{ $company['tagline'] ?? 'Diesel • Fleet • On-Call Service' }}</div>
          <div class="contact tight">
            <div class="mono small">
              {{ $company['addressLine1'] ?? '387 Van Siclen Ave' }}<br/>
              {{ $company['addressLine2'] ?? 'Brooklyn, NY 11207' }}
            </div>
            <div class="small">
              <span class="muted">P:</span> {{ $company['phone'] ?? '(646) 731-7021' }}
              &nbsp; <span class="muted">E:</span> {{ $company['email'] ?? 'devononsiterepairs@gmail.com' }}<br/>
              <span class="muted">Hours:</span> {{ $company['hours'] ?? 'Mon–Sat 7:00AM–7:00PM' }}
            </div>
          </div>
        </div>
      </div>
      <div class="docmeta">
        <p class="title">{{ $doc['documentTitle'] ?? 'INVOICE' }}</p>
        <div class="sub mono">
          <div><span class="muted">{{ $doc['numberLabel'] ?? 'Invoice #' }}</span> <b>{{ $doc['number'] ?? '—' }}</b></div>
          <div><span class="muted">{{ $doc['dateLabel'] ?? 'Date' }}</span> <b>{{ $doc['date'] ?? '—' }}</b></div>
          <div><span class="muted">{{ $doc['dueDateLabel'] ?? 'Due' }}</span> <b>{{ $doc['dueLabel'] ?? '—' }}</b></div>
        </div>
        <div class="status-chip"><span class="dot"></span>{{ $doc['statusLabel'] ?? 'DRAFT' }}</div>
      </div>
    </div>

    <div class="sep"></div>

    <div class="strip">
      <div class="box" style="flex:1.05">
        <h3>Customer</h3>
        <div class="kv mono">
          <div class="k">NAME</div><div class="v">{{ $doc['customer']['name'] ?? '—' }}</div>
          @foreach(($doc['customer']['addressLines'] ?? []) as $i => $line)
            @if($i === 0)
              <div class="k">HOME</div><div class="v">{{ $line }}</div>
            @else
              <div class="k"></div><div class="v">{{ $line }}</div>
            @endif
          @endforeach
          <div class="k">PHONE</div><div class="v">{{ $doc['customer']['phone'] ?? '—' }}</div>
          <div class="k">EMAIL</div><div class="v">{{ $doc['customer']['email'] ?? '—' }}</div>
        </div>
      </div>
    </div>

    <div class="pad">
      @if(!empty($doc['vehicle']))
        <div class="card">
          <div class="head">
            <h3>Vehicle Information</h3>
            <span class="flag">{{ $doc['statusLabel'] ?? '' }}</span>
          </div>
          <div class="body">
            <div class="vehicle-grid">
              <div class="lines mono">
                <div class="label">Unit #</div><div class="val">{{ $doc['vehicle']['unitNumber'] ?? '—' }}</div>
                <div class="label">Year</div><div class="val">{{ $doc['vehicle']['year'] ?? '—' }}</div>
                <div class="label">Make / Model</div><div class="val">{{ $doc['vehicle']['makeModel'] ?? '—' }}</div>
                <div class="label">VIN</div><div class="val">{{ $doc['vehicle']['vin'] ?? '—' }}</div>
                <div class="label">Plate</div><div class="val">{{ $doc['vehicle']['plate'] ?? 'Not on file' }}</div>
              </div>
            </div>
          </div>
        </div>
      @endif

      <div class="card">
        <div class="head"><h3>Symptoms / Complaints</h3></div>
        <div class="body">
          <div class="symptoms">
            <h3 class="xs muted" style="margin:0 0 6px; text-transform:uppercase; letter-spacing:.12em;">Customer stated</h3>
            <div class="note">{{ $doc['note'] ?? '—' }}</div>
          </div>
        </div>
      </div>

      <div style="margin-top:14px;">
        <table>
          <thead>
            <tr>
              <th style="width:52%;">Details</th>
              <th style="width:10%;" class="center">Type</th>
              <th style="width:10%;" class="center">Qty</th>
              <th style="width:14%;" class="num">Rate</th>
              <th style="width:14%;" class="num">Total</th>
            </tr>
          </thead>
          <tbody>
            @foreach(($doc['lineItems'] ?? []) as $line)
              <tr>
                <td><div class="desc">{{ $line['description'] ?? '' }}</div></td>
                <td class="center"><span class="type-badge">{{ $line['typeBadge'] ?? 'L' }}</span></td>
                <td class="center mono">{{ $line['quantity'] ?? '0' }}</td>
                <td class="num mono">{{ $line['unitPrice'] ?? '$0.00' }}</td>
                <td class="num mono">{{ $line['lineAmount'] ?? '$0.00' }}</td>
              </tr>
            @endforeach
          </tbody>
        </table>
      </div>

      <div class="bottom">
        <div class="pay">
          <h3>Payment & Delivery</h3>
          <div class="small tight">
            <b>Payment terms:</b> {{ $doc['dueLabel'] ?? 'Due upon receipt' }}<br/>
            <span class="muted">Please include {{ strtolower($doc['documentTitle'] ?? 'invoice') }} number in memo for electronic payments.</span>
          </div>
        </div>
        <div class="totals">
          <div class="head"><h3>Totals</h3><div class="xs mono" style="opacity:.9;">USD</div></div>
          <div class="body">
            <div class="rowline"><div class="l">Parts</div><div class="r mono">{{ $doc['totals']['parts'] ?? '$0.00' }}</div></div>
            <div class="rowline"><div class="l">Labor</div><div class="r mono">{{ $doc['totals']['labor'] ?? '$0.00' }}</div></div>
            <div class="rowline"><div class="l">Shop Fees</div><div class="r mono">{{ $doc['totals']['fees'] ?? '$0.00' }}</div></div>
            <div class="rowline"><div class="l">Discounts</div><div class="r mono">{{ $doc['totals']['discount'] ?? '$0.00' }}</div></div>
            <div class="rowline"><div class="l">Tax</div><div class="r mono">{{ $doc['totals']['tax'] ?? '$0.00' }}</div></div>
            <div class="grand">
              <div class="label">Amount Due</div>
              <div class="amt mono">{{ $doc['totals']['total'] ?? '$0.00' }}</div>
            </div>
            <div class="hair"></div>
            <div class="small tight">
              <b>Status:</b> {{ $doc['statusLabel'] ?? '' }}<br/>
              <b>Balance after payment:</b> <span class="mono">{{ $doc['totals']['balanceDue'] ?? $doc['totals']['total'] ?? '$0.00' }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="footer">
        <div>
          <div class="mono small">
            <b>{{ $company['name'] ?? 'Devon Onsite Repairs Inc.' }}</b><br/>
            {{ $company['addressLine1'] ?? '' }}, {{ $company['addressLine2'] ?? '' }}<br/>
            P: {{ $company['phone'] ?? '' }} • E: {{ $company['email'] ?? '' }}
          </div>
        </div>
        <div class="signature">
          <div class="small"><b>Customer Authorization</b></div>
          <div class="xs muted">I authorize the repairs described above and understand the terms.</div>
          <div class="sigline"></div>
        </div>
      </div>

      <div class="xs muted" style="margin-top:10px;">
        {{ $doc['documentTitle'] ?? 'Invoice' }} {{ $doc['number'] ?? '' }} • Generated {{ $doc['generatedAt'] ?? '' }}
      </div>
    </div>
  </div>
</body>
</html>
