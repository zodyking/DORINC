<script setup lang="ts">
import StaplesPrintJobsPanel from '~/components/staples/StaplesPrintJobsPanel.vue'
import StaffNavIcon from '~/components/staff/StaffNavIcon.vue'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

definePageMeta({ layout: 'staff', permission: 'staples.read.all' })

const auth = useAuthStore()
const canPrint = computed(() => auth.can('staples.print.all'))
const jobsPanel = ref<{ refresh: () => Promise<void> } | null>(null)
const sendBusy = ref(false)
const actionError = ref('')
const actionOk = ref('')

async function sendBlankSheet() {
  if (!canPrint.value || sendBusy.value) return
  sendBusy.value = true
  actionError.value = ''
  actionOk.value = ''
  try {
    const res = await $fetch<{ job: { id: string, status: string, errorMessage: string | null } }>(
      '/api/service-logs/sheet/staples-print',
      { method: 'POST' },
    )
    if (res.job.status === 'failed') {
      actionError.value = res.job.errorMessage || 'Could not email Staples PrintMe'
      return
    }
    actionOk.value = 'Sheet emailed to Staples PrintMe. Waiting for the release code…'
    await jobsPanel.value?.refresh()
  }
  catch (e: unknown) {
    actionError.value = syncFetchErrorMessage(e, 'Could not start Staples PrintMe')
  }
  finally {
    sendBusy.value = false
  }
}
</script>

<template>
  <section class="page active">
    <StaffPageHead subtitle="PrintMe release codes for blank service log sheets at Staples">
      <template #title>
        <span class="staples-page-title">
          <StaffNavIcon name="staples" class="staples-page-logo" />
          Staples
        </span>
      </template>
      <template v-if="canPrint" #actions>
        <button
          type="button"
          class="btn primary"
          :disabled="sendBusy"
          @click="sendBlankSheet"
        >
          {{ sendBusy ? 'Sending…' : 'Send blank sheet to PrintMe' }}
        </button>
      </template>
    </StaffPageHead>

    <p v-if="actionError" class="help" style="color:#dc2626; margin:0 0 12px;">{{ actionError }}</p>
    <p v-else-if="actionOk" class="help" style="color:#15803d; margin:0 0 12px;">{{ actionOk }}</p>

    <div class="card staples-page-card">
      <StaplesPrintJobsPanel ref="jobsPanel" />
    </div>
  </section>
</template>

<style scoped>
.staples-page-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.staples-page-logo {
  width: 22px;
  height: 22px;
  color: #64748b;
}
.staples-page-card {
  padding: 16px;
}
</style>
