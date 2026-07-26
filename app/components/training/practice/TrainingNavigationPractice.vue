<script setup lang="ts">
import StaffNavIcon from '~/components/staff/StaffNavIcon.vue'
import type { StaffNavIconName } from '~/components/staff/StaffNavIcon.vue'
import { BRAND_ICON, BRAND_NAME } from '~/constants/brand'

const props = defineProps<{
  practiceId: string
}>()

const emit = defineEmits<{
  ready: [ready: boolean]
}>()

const picked = ref<string | null>(null)

const targets: Record<string, { id: string, label: string, icon: StaffNavIconName, hint: string }> = {
  'nav-service-logs': {
    id: 'service-logs',
    label: 'Service Logs',
    icon: 'service-logs',
    hint: 'Correct! New service log starts here.',
  },
  'nav-invoices': {
    id: 'invoices',
    label: 'Invoices',
    icon: 'invoices',
    hint: 'Correct! New invoice is on the Invoices list page.',
  },
  'nav-customers': {
    id: 'customers',
    label: 'Customers',
    icon: 'customers',
    hint: 'Correct! Search fleet accounts and open vehicle records from here.',
  },
}

const target = computed(() => targets[props.practiceId])

const ready = computed(() => picked.value === target.value?.id)

watch(ready, (v) => emit('ready', v), { immediate: true })

const navItems: Array<{ id: string, label: string, icon: StaffNavIconName }> = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'invoices', label: 'Invoices', icon: 'invoices' },
  { id: 'customers', label: 'Customers', icon: 'customers' },
  { id: 'vehicles', label: 'Vehicles', icon: 'vehicles' },
  { id: 'service-logs', label: 'Service Logs', icon: 'service-logs' },
  { id: 'training', label: 'Training', icon: 'training' },
]
</script>

<template>
  <div class="training-practice-wizard">
    <div class="training-practice-badge">Practice — tap the correct sidebar item</div>
    <p v-if="target" class="sl-hint" style="margin:0 0 12px;">
      Find <strong>{{ target.label }}</strong> in the sidebar and tap it.
    </p>
    <div class="training-ui-chrome-row">
      <nav class="side training-ui-side open" aria-label="Sidebar practice">
        <div class="logo">
          <img class="sq" :src="BRAND_ICON" alt="" width="32" height="32"> {{ BRAND_NAME }}
        </div>
        <div class="label">Workspace</div>
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          class="nav-item training-ui-nav-btn"
          :class="{
            on: picked === item.id,
            'training-nav-correct': ready && item.id === target?.id,
            'training-nav-wrong': picked === item.id && !ready,
          }"
          @click="picked = item.id"
        >
          <span class="ico" aria-hidden="true"><StaffNavIcon :name="item.icon" /></span>
          <span class="nav-label">{{ item.label }}</span>
        </button>
      </nav>
      <div class="training-ui-chrome-main">
        <div class="training-ui-chrome-body">
          <p v-if="ready && target" class="training-ui-hint">
            {{ target.hint }}
          </p>
          <p v-else-if="picked && !ready" class="help" style="margin:0;color:#dc2626;">
            Not quite — try another item.
          </p>
          <p v-else class="training-ui-hint muted">Tap an item in the sidebar.</p>
        </div>
      </div>
    </div>
  </div>
</template>
