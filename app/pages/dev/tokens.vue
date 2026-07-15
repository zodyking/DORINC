<script setup lang="ts">
// Dev-only preview of the Ledger design system (P0-04 verify).
definePageMeta({ middleware: 'dev-only' })
</script>

<template>
  <div class="page active" style="max-width: 1080px; margin: 0 auto">
    <div class="pagehead">
      <div>
        <h2>Ledger design tokens</h2>
        <p>Base components extracted 1:1 from the UI mockup.</p>
      </div>
      <div class="actions">
        <button class="btn">Secondary</button>
        <button class="btn primary">Primary action</button>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi">
        <div class="t">Outstanding</div>
        <div class="v">$14,204.95</div>
        <div class="d up">↑ 12% vs last month</div>
      </div>
      <div class="kpi">
        <div class="t">Overdue</div>
        <div class="v">$3,286.20</div>
        <div class="d down">↓ 2 invoices</div>
      </div>
      <div class="kpi">
        <div class="t">Paid this month</div>
        <div class="v">$22,910.00</div>
        <div class="d up">↑ 8%</div>
      </div>
      <div class="kpi">
        <div class="t">Logs to review</div>
        <div class="v">7</div>
        <div class="d flat">— steady</div>
      </div>
    </div>

    <div class="card" style="margin-bottom: 18px">
      <div class="chead">
        <h3>Buttons, pills &amp; chips</h3>
        <div class="right">
          <button class="btn sm">Small</button>
        </div>
      </div>
      <div class="cbody" style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center">
        <button class="btn primary">Primary</button>
        <button class="btn">Default</button>
        <button class="btn ghost">Ghost</button>
        <button class="btn danger">Danger</button>
        <button class="btn sm">Small</button>
        <span class="pill paid">Paid</span>
        <span class="pill sent">Sent</span>
        <span class="pill over">Overdue</span>
        <span class="pill draft">Draft</span>
        <span class="pill warn">Pending</span>
        <span class="pill indigo">Indigo</span>
        <button class="chip on">Filter on</button>
        <button class="chip">Filter off</button>
        <span class="mono">INV-2051 · mono sample</span>
      </div>
    </div>

    <div class="card">
      <div class="chead">
        <h3>Table</h3>
      </div>
      <div class="tscroll">
        <table class="tbl">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Status</th>
              <th class="num">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr class="click">
              <td><span class="lead mono">INV-2051</span><span class="sub">Jul 03, 2026</span></td>
              <td>Hollis Logistics LLC</td>
              <td><span class="pill sent">Sent</span></td>
              <td class="num">$1,482.13</td>
            </tr>
            <tr class="click">
              <td><span class="lead mono">INV-2050</span><span class="sub">Jul 01, 2026</span></td>
              <td>Bright Path Charters</td>
              <td><span class="pill paid">Paid</span></td>
              <td class="num">$3,286.20</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="cfoot"><span>2 of 2 invoices</span></div>
    </div>
  </div>
</template>
