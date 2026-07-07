<script setup lang="ts">
// Portal shell placeholder — live data lands in P2-04.
definePageMeta({ layout: 'portal' })
</script>

<template>
  <section class="page active">
    <div class="pagehead">
      <div>
        <h2>Welcome back</h2>
        <p>Fleet billing overview</p>
      </div>
      <div class="actions">
        <button class="btn">+ Add vehicle</button>
        <button class="btn">Request service</button>
        <button class="btn primary">View invoices</button>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="l">Open balance</div><div class="v">$0.00</div><div class="s">0 unpaid invoices</div></div>
      <div class="kpi"><div class="l">Vehicles</div><div class="v">0</div><div class="s">Active fleet units</div></div>
      <div class="kpi"><div class="l">Paid YTD</div><div class="v">$0</div><div class="s">—</div></div>
      <div class="kpi"><div class="l">Pending requests</div><div class="v">0</div><div class="s">Awaiting shop review</div></div>
    </div>
  </section>
</template>
