<script setup lang="ts">
// Shell placeholder — live KPIs/data land in P1-37.
definePageMeta({ layout: 'staff' })
</script>

<template>
  <section class="page active">
    <div class="pagehead">
      <div>
        <h2>Dashboard</h2>
        <p>Workspace overview</p>
      </div>
      <div class="actions">
        <button class="btn">Review queue</button>
        <button class="btn primary">+ New Invoice</button>
      </div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="t">Outstanding</div><div class="v">$0.00</div><div class="d flat">0 open invoices</div></div>
      <div class="kpi"><div class="t">Paid this month</div><div class="v">$0.00</div><div class="d flat">—</div></div>
      <div class="kpi"><div class="t">Overdue</div><div class="v">$0.00</div><div class="d flat">—</div></div>
      <div class="kpi"><div class="t">Avg. days to pay</div><div class="v">—</div><div class="d flat">—</div></div>
    </div>
  </section>
</template>
