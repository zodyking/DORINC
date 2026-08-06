<script setup lang="ts">
import AnnouncementRichEditor from '~/components/admin/AnnouncementRichEditor.vue'
import { accountTypeLabel } from '~/utils/users-ui'
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

definePageMeta({ layout: 'staff', permission: 'system.admin.all' })

interface OptionsPayload {
  accountTypes: Array<{ key: string, name: string }>
  users: Array<{ id: string, name: string, email: string, accountType: string }>
}

const { data: options } = useClientFetch<OptionsPayload>('/api/admin/announcements/options')

const form = reactive({
  title: '',
  subtitle: '',
  bodyHtml: '',
  isActive: true,
  priority: 10,
  startsAt: '',
  endsAt: '',
  audienceMode: 'all' as 'all' | 'account_type' | 'user',
  accountTypeKeys: [] as string[],
  userIds: [] as string[],
  ctaButtons: [] as Array<{ label: string, href: string, variant: 'primary' | 'secondary' | 'ghost' }>,
})

const busy = ref(false)
const error = ref('')
const userFilter = ref('')

const filteredUsers = computed(() => {
  const q = userFilter.value.trim().toLowerCase()
  const list = options.value?.users ?? []
  if (!q) return list
  return list.filter(u =>
    u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
  )
})

function addCta() {
  form.ctaButtons.push({ label: '', href: '/', variant: 'secondary' })
}

function removeCta(index: number) {
  form.ctaButtons.splice(index, 1)
}

function toggleType(key: string) {
  const i = form.accountTypeKeys.indexOf(key)
  if (i >= 0) form.accountTypeKeys.splice(i, 1)
  else form.accountTypeKeys.push(key)
}

function toggleUser(id: string) {
  const i = form.userIds.indexOf(id)
  if (i >= 0) form.userIds.splice(i, 1)
  else form.userIds.push(id)
}

function buildAudience() {
  if (form.audienceMode === 'account_type') {
    return { targetType: 'account_type' as const, accountTypeKeys: [...form.accountTypeKeys] }
  }
  if (form.audienceMode === 'user') {
    return { targetType: 'user' as const, userIds: [...form.userIds] }
  }
  return { targetType: 'all' as const }
}

async function createMessage() {
  if (!form.title.trim()) {
    error.value = 'Title is required'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const res = await $fetch<{ announcement: { id: string } }>('/api/admin/announcements', {
      method: 'POST',
      body: {
        title: form.title,
        subtitle: form.subtitle || null,
        bodyHtml: form.bodyHtml,
        isActive: form.isActive,
        priority: form.priority,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        ctaButtons: form.ctaButtons.filter(b => b.label.trim() && b.href.trim()),
        audience: buildAudience(),
      },
    })
    await navigateTo(`/admin/announcements/${res.announcement.id}`)
  }
  catch (e: unknown) {
    error.value = syncFetchErrorMessage(e, 'Could not create message')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="page active">
    <StaffPageHead subtitle="Create a mandatory login message">
      <template #title>New login message</template>
      <template #actions>
        <NuxtLink to="/admin/announcements" class="btn">Cancel</NuxtLink>
        <button type="button" class="btn primary" :disabled="busy" @click="createMessage">
          {{ busy ? 'Saving…' : 'Create message' }}
        </button>
      </template>
    </StaffPageHead>

    <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>

    <div class="card ann-form">
      <label class="fld">
        <span>Title</span>
        <input v-model="form.title" type="text" maxlength="200" placeholder="Important update">
      </label>
      <label class="fld">
        <span>Subtitle (optional)</span>
        <input v-model="form.subtitle" type="text" maxlength="300" placeholder="Short supporting line">
      </label>

      <label class="fld">
        <span>Body</span>
        <AnnouncementRichEditor v-model="form.bodyHtml" />
      </label>

      <div class="ann-grid">
        <label class="fld">
          <span>Priority (higher shows first)</span>
          <input v-model.number="form.priority" type="number" min="-1000" max="1000">
        </label>
        <label class="fld chk">
          <input v-model="form.isActive" type="checkbox">
          <span>Active immediately</span>
        </label>
      </div>

      <div class="ann-grid">
        <label class="fld">
          <span>Starts (optional)</span>
          <input v-model="form.startsAt" type="datetime-local">
        </label>
        <label class="fld">
          <span>Ends (optional)</span>
          <input v-model="form.endsAt" type="datetime-local">
        </label>
      </div>

      <fieldset class="ann-audience">
        <legend>Audience</legend>
        <label class="fld radio"><input v-model="form.audienceMode" type="radio" value="all"> All staff</label>
        <label class="fld radio"><input v-model="form.audienceMode" type="radio" value="account_type"> Account types</label>
        <label class="fld radio"><input v-model="form.audienceMode" type="radio" value="user"> Specific users</label>

        <div v-if="form.audienceMode === 'account_type'" class="ann-chips">
          <label
            v-for="type in options?.accountTypes ?? []"
            :key="type.key"
            class="ann-chip"
            :class="{ on: form.accountTypeKeys.includes(type.key) }"
          >
            <input type="checkbox" :checked="form.accountTypeKeys.includes(type.key)" @change="toggleType(type.key)">
            {{ type.name || accountTypeLabel(type.key) }}
          </label>
        </div>

        <div v-if="form.audienceMode === 'user'" class="ann-users">
          <input v-model="userFilter" type="search" placeholder="Filter users…" class="ann-user-filter">
          <label
            v-for="user in filteredUsers"
            :key="user.id"
            class="ann-user-row"
          >
            <input type="checkbox" :checked="form.userIds.includes(user.id)" @change="toggleUser(user.id)">
            <span>
              <b>{{ user.name }}</b>
              <span class="help">{{ user.email }} · {{ accountTypeLabel(user.accountType) }}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <div class="ann-ctas">
        <div class="ann-ctas-head">
          <h3>Buttons (optional)</h3>
          <button type="button" class="btn sm" @click="addCta">+ Add button</button>
        </div>
        <div v-for="(btn, index) in form.ctaButtons" :key="index" class="ann-cta-row">
          <input v-model="btn.label" type="text" placeholder="Label">
          <input v-model="btn.href" type="text" placeholder="/training or https://…">
          <select v-model="btn.variant">
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
            <option value="ghost">Ghost</option>
          </select>
          <button type="button" class="btn sm" @click="removeCta(index)">Remove</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ann-form {
  padding: 20px;
  display: grid;
  gap: 14px;
}
.ann-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.fld.chk, .fld.radio {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ann-audience {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px 14px;
}
.ann-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.ann-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 13px;
}
.ann-chip.on {
  border-color: #2563eb;
  background: #eff6ff;
}
.ann-users {
  margin-top: 10px;
  max-height: 260px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.ann-user-filter {
  width: 100%;
  border: 0;
  border-bottom: 1px solid #e5e7eb;
  padding: 10px 12px;
}
.ann-user-row {
  display: flex;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid #f1f5f9;
}
.ann-ctas-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ann-ctas-head h3 {
  margin: 0;
  font-size: 1rem;
}
.ann-cta-row {
  display: grid;
  grid-template-columns: 1fr 1.4fr 120px auto;
  gap: 8px;
  margin-top: 8px;
}
@media (max-width: 800px) {
  .ann-grid, .ann-cta-row {
    grid-template-columns: 1fr;
  }
}
</style>
