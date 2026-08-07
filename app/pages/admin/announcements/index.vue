<script setup lang="ts">
import { audienceModeLabel } from '~/utils/announcements-ui'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

definePageMeta({ layout: 'staff', permission: 'system.admin.all' })

interface AnnouncementRow {
  id: string
  title: string
  subtitle: string | null
  isActive: boolean
  priority: number
  startsAt: string | null
  endsAt: string | null
  audienceMode: string
  accountTypeKeys: string[]
  userIds: string[]
  acknowledgementCount: number
  updatedAt: string
}

const { data, refresh, pending } = useClientFetch<{ items: AnnouncementRow[] }>('/api/admin/announcements')
const items = computed(() => data.value?.items ?? [])

const deleteBusy = ref<string | null>(null)
const error = ref('')

async function toggleActive(row: AnnouncementRow) {
  error.value = ''
  try {
    await $fetch(`/api/admin/announcements/${row.id}`, {
      method: 'PATCH',
      body: { isActive: !row.isActive },
    })
    await refresh()
  }
  catch (e: unknown) {
    error.value = syncFetchErrorMessage(e, 'Could not update message')
  }
}

async function removeRow(row: AnnouncementRow) {
  if (!confirm(`Delete “${row.title}”? Acknowledged history for this message will be removed.`)) return
  deleteBusy.value = row.id
  error.value = ''
  try {
    await $fetch(`/api/admin/announcements/${row.id}`, { method: 'DELETE' })
    await refresh()
  }
  catch (e: unknown) {
    error.value = syncFetchErrorMessage(e, 'Could not delete message')
  }
  finally {
    deleteBusy.value = null
  }
}

function audienceDetail(row: AnnouncementRow) {
  if (row.audienceMode === 'all') return 'Everyone on staff'
  if (row.audienceMode === 'account_type') {
    return row.accountTypeKeys.length ? row.accountTypeKeys.join(', ') : '—'
  }
  return `${row.userIds.length} user${row.userIds.length === 1 ? '' : 's'}`
}
</script>

<template>
  <section class="page active ann-list-page">
    <StaffPageHead subtitle="Mandatory full-screen messages shown after login before the dashboard">
      <template #title>Login Messages</template>
      <template #actions>
        <NuxtLink to="/admin/announcements/new" class="btn primary">+ New Message</NuxtLink>
      </template>
    </StaffPageHead>

    <p v-if="error" class="help ann-error">{{ error }}</p>
    <div v-if="pending && !items.length" class="cp-state">Loading…</div>

    <div v-else-if="!items.length" class="ann-empty">
      <h2>No login messages yet</h2>
      <p>Create an active message to force staff through a full-screen notice after sign-in.</p>
      <NuxtLink to="/admin/announcements/new" class="btn primary">Create message</NuxtLink>
    </div>

    <div v-else class="ann-cards">
      <article
        v-for="row in items"
        :key="row.id"
        class="ann-card"
      >
        <div class="ann-card-main">
          <div class="ann-card-title-row">
            <NuxtLink :to="`/admin/announcements/${row.id}`" class="ann-title-link">
              {{ row.title }}
            </NuxtLink>
            <span :class="row.isActive ? 'pill ok' : 'pill gray'">
              {{ row.isActive ? 'Active' : 'Inactive' }}
            </span>
          </div>
          <p v-if="row.subtitle" class="ann-card-sub">{{ row.subtitle }}</p>
          <div class="ann-card-meta">
            <span>{{ audienceModeLabel(row.audienceMode) }} · {{ audienceDetail(row) }}</span>
            <span>Priority {{ row.priority }} (lower first)</span>
            <span>{{ row.acknowledgementCount }} seen</span>
          </div>
        </div>
        <div class="ann-card-actions">
          <button type="button" class="btn sm" @click="toggleActive(row)">
            {{ row.isActive ? 'Deactivate' : 'Activate' }}
          </button>
          <NuxtLink :to="`/admin/announcements/${row.id}`" class="btn sm">Edit</NuxtLink>
          <button
            type="button"
            class="btn sm"
            :disabled="deleteBusy === row.id"
            @click="removeRow(row)"
          >
            Delete
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.ann-list-page {
  max-width: 1100px;
}
.ann-error {
  color: #dc2626;
}
.ann-empty {
  border: 1px dashed #cbd5e1;
  border-radius: 14px;
  padding: 36px 24px;
  text-align: center;
  background: #f8fafc;
}
.ann-empty h2 {
  margin: 0 0 8px;
}
.ann-empty p {
  margin: 0 0 16px;
  color: #64748b;
}
.ann-cards {
  display: grid;
  gap: 10px;
}
.ann-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
}
.ann-card-main {
  min-width: 0;
}
.ann-card-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.ann-title-link {
  font-weight: 700;
  color: inherit;
  text-decoration: none;
  font-size: 1.05rem;
}
.ann-title-link:hover {
  text-decoration: underline;
}
.ann-card-sub {
  margin: 6px 0 0;
  color: #64748b;
}
.ann-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  margin-top: 10px;
  font-size: 12px;
  color: #64748b;
}
.ann-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
  flex-shrink: 0;
}
@media (max-width: 720px) {
  .ann-card {
    flex-direction: column;
    align-items: stretch;
  }
  .ann-card-actions {
    justify-content: flex-start;
  }
}
</style>
