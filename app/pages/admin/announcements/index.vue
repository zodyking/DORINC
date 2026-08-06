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
  <section class="page active">
    <StaffPageHead subtitle="Mandatory full-screen messages shown after login before the dashboard">
      <template #title>Login messages</template>
      <template #actions>
        <NuxtLink to="/admin/announcements/new" class="btn primary">+ New message</NuxtLink>
      </template>
    </StaffPageHead>

    <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>
    <div v-if="pending && !items.length" class="cp-state">Loading…</div>

    <div v-else class="card">
      <div class="tscroll">
        <table class="tbl">
          <thead>
            <tr>
              <th>Title</th>
              <th>Audience</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Seen</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in items" :key="row.id">
              <td>
                <NuxtLink :to="`/admin/announcements/${row.id}`" class="ann-title-link">{{ row.title }}</NuxtLink>
                <div v-if="row.subtitle" class="help">{{ row.subtitle }}</div>
              </td>
              <td>
                <div>{{ audienceModeLabel(row.audienceMode) }}</div>
                <div class="help">{{ audienceDetail(row) }}</div>
              </td>
              <td>
                <span :class="row.isActive ? 'pill ok' : 'pill gray'">
                  {{ row.isActive ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td>{{ row.priority }}</td>
              <td>{{ row.acknowledgementCount }}</td>
              <td class="ann-actions">
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
              </td>
            </tr>
            <tr v-if="!items.length">
              <td colspan="6" class="empty" style="display:table-cell;">
                No login messages yet. Create one to require staff to read it after sign-in.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ann-title-link {
  font-weight: 650;
  color: inherit;
  text-decoration: none;
}
.ann-title-link:hover {
  text-decoration: underline;
}
.ann-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}
</style>
