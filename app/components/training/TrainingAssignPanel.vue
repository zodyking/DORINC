<script setup lang="ts">
const props = defineProps<{
  userId: string
  userName: string
}>()

const emit = defineEmits<{ assigned: [] }>()

interface ModuleRow {
  id: string
  title: string
  slug: string
  estimatedMinutes: number
}

interface AssignmentRow {
  id: string
  moduleId: string
  status: string
  locksAccess: boolean
  module: { title: string, slug?: string }
}

const { data: modulesData, error: modulesError } = useClientFetch<{ items: ModuleRow[] }>('/api/training/modules')
const {
  data: assignmentsData,
  refresh,
  error: assignmentsError,
  pending: assignmentsPending,
} = useClientFetch<{ items: AssignmentRow[] }>(
  '/api/training/assignments',
  { query: { userId: props.userId } },
)

const moduleId = ref('')
const locksAccess = ref(true)
const notes = ref('')
const busy = ref(false)
const errorMsg = ref('')
const notice = ref('')
const confirmClear = ref(false)

const modules = computed(() => modulesData.value?.items ?? [])
const assignments = computed(() => assignmentsData.value?.items ?? [])
const lockingCount = computed(() =>
  assignments.value.filter(a => a.locksAccess && a.status !== 'completed').length,
)

const assignmentsLoadError = computed(() => {
  if (!assignmentsError.value) return ''
  return (assignmentsError.value as { data?: { message?: string }, message?: string })?.data?.message
    || (assignmentsError.value as { message?: string })?.message
    || 'Could not load training assignments'
})

const modulesLoadError = computed(() => {
  if (!modulesError.value) return ''
  return (modulesError.value as { data?: { message?: string }, message?: string })?.data?.message
    || (modulesError.value as { message?: string })?.message
    || 'Could not load training modules'
})

const availableModules = computed(() => {
  const assigned = new Set(assignments.value.filter(a => a.status !== 'completed').map(a => a.moduleId))
  return modules.value.filter(m => !assigned.has(m.id))
})

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ')
}

function statusPill(status: string): string {
  if (status === 'completed') return 'pill green'
  if (status === 'in_progress') return 'pill blue'
  return 'pill amber'
}

async function assign() {
  if (!moduleId.value) return
  busy.value = true
  errorMsg.value = ''
  notice.value = ''
  confirmClear.value = false
  try {
    await $fetch('/api/training/assignments', {
      method: 'POST',
      body: {
        userId: props.userId,
        moduleId: moduleId.value,
        locksAccess: locksAccess.value,
        notes: notes.value || null,
      },
    })
    notice.value = locksAccess.value
      ? 'Assigned and locked until complete'
      : 'Training module assigned'
    moduleId.value = ''
    notes.value = ''
    await refresh()
    emit('assigned')
  }
  catch (e: unknown) {
    errorMsg.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not assign training'
  }
  finally {
    busy.value = false
  }
}

async function removeAssignment(id: string) {
  busy.value = true
  errorMsg.value = ''
  notice.value = ''
  try {
    await $fetch(`/api/training/assignments/${id}`, { method: 'DELETE' })
    notice.value = 'Assignment removed'
    await refresh()
    emit('assigned')
  }
  catch (e: unknown) {
    errorMsg.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not remove assignment'
  }
  finally {
    busy.value = false
  }
}

async function setLock(id: string, next: boolean) {
  busy.value = true
  errorMsg.value = ''
  notice.value = ''
  try {
    await $fetch(`/api/training/assignments/${id}`, {
      method: 'PATCH',
      body: { locksAccess: next },
    })
    notice.value = next ? 'Access lock enabled' : 'Access lock removed'
    await refresh()
    emit('assigned')
  }
  catch (e: unknown) {
    errorMsg.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not update lock'
  }
  finally {
    busy.value = false
  }
}

async function clearLocks() {
  busy.value = true
  errorMsg.value = ''
  notice.value = ''
  try {
    const res = await $fetch<{ cleared: number }>(`/api/training/users/${props.userId}/clear`, {
      method: 'POST',
      query: { mode: 'locks' },
    })
    notice.value = res.cleared
      ? `Removed ${res.cleared} access lock${res.cleared === 1 ? '' : 's'}`
      : 'No access locks to clear'
    await refresh()
    emit('assigned')
  }
  catch (e: unknown) {
    errorMsg.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not clear locks'
  }
  finally {
    busy.value = false
  }
}

async function clearAllTraining() {
  busy.value = true
  errorMsg.value = ''
  notice.value = ''
  confirmClear.value = false
  try {
    const res = await $fetch<{ cleared: number }>(`/api/training/users/${props.userId}/clear`, {
      method: 'POST',
      query: { mode: 'all' },
    })
    notice.value = res.cleared
      ? `Cleared ${res.cleared} training assignment${res.cleared === 1 ? '' : 's'}`
      : 'No training assignments to clear'
    await refresh()
    emit('assigned')
  }
  catch (e: unknown) {
    errorMsg.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not clear training'
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="training-assign-panel">
    <div class="training-assign-panel__intro">
      <p class="help" style="margin:0;">
        Assign required courses for <b>{{ userName }}</b>. Locked courses restrict the app until finished.
      </p>
      <div v-if="assignments.length" class="training-assign-panel__actions">
        <button
          type="button"
          class="btn sm"
          :disabled="busy || !lockingCount"
          @click="clearLocks"
        >
          Clear locks{{ lockingCount ? ` (${lockingCount})` : '' }}
        </button>
        <button
          type="button"
          class="btn sm danger"
          :disabled="busy"
          @click="confirmClear = !confirmClear"
        >
          Clear all training
        </button>
      </div>
    </div>

    <div v-if="confirmClear" class="training-assign-confirm">
      <p>
        Remove <b>all</b> training assignments and progress for {{ userName }}?
        This also clears any login lock.
      </p>
      <div class="training-assign-confirm__foot">
        <button type="button" class="btn sm" :disabled="busy" @click="confirmClear = false">
          Cancel
        </button>
        <button type="button" class="btn sm danger" :disabled="busy" @click="clearAllTraining">
          {{ busy ? 'Clearing…' : 'Yes, clear training' }}
        </button>
      </div>
    </div>

    <p v-if="assignmentsPending" class="help training-assign-empty">Loading assignments…</p>
    <p v-else-if="assignmentsLoadError" class="help training-assign-error">
      {{ assignmentsLoadError }}
    </p>
    <ul v-else-if="assignments.length" class="training-assign-list">
      <li
        v-for="row in assignments"
        :key="row.id"
        class="training-assign-item"
        :class="{ 'is-locked': row.locksAccess && row.status !== 'completed' }"
      >
        <div class="training-assign-item__main">
          <b>{{ row.module.title }}</b>
          <span class="training-assign-item__meta">
            <span :class="statusPill(row.status)">{{ statusLabel(row.status) }}</span>
            <span v-if="row.locksAccess && row.status !== 'completed'" class="pill warn">Locks access</span>
          </span>
        </div>
        <div class="training-assign-item__ops">
          <button
            v-if="row.locksAccess && row.status !== 'completed'"
            type="button"
            class="btn sm"
            :disabled="busy"
            @click="setLock(row.id, false)"
          >
            Unlock
          </button>
          <button
            v-else-if="row.status !== 'completed'"
            type="button"
            class="btn sm"
            :disabled="busy"
            @click="setLock(row.id, true)"
          >
            Lock
          </button>
          <button
            type="button"
            class="btn sm danger"
            :disabled="busy"
            @click="removeAssignment(row.id)"
          >
            Remove
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="help training-assign-empty">No training assigned yet.</p>

    <div class="training-assign-form">
      <p v-if="modulesLoadError" class="help training-assign-error" style="margin-bottom:10px;">
        {{ modulesLoadError }}
      </p>
      <label class="fld">
        Assign module
        <select v-model="moduleId" :disabled="busy || !availableModules.length">
          <option value="">
            {{ availableModules.length ? 'Select module…' : 'No modules available to assign' }}
          </option>
          <option v-for="m in availableModules" :key="m.id" :value="m.id">
            {{ m.title }} ({{ m.estimatedMinutes }} min)
          </option>
        </select>
      </label>
      <label class="fld">
        Notes for assignee (optional)
        <input v-model="notes" type="text" placeholder="Complete before first solo log" :disabled="busy">
      </label>
      <div class="training-assign-form__foot">
        <label class="tglrow training-assign-lock">
          Lock until complete
          <span class="tgl"><input v-model="locksAccess" type="checkbox" :disabled="busy"><span class="tr" /></span>
        </label>
        <button type="button" class="btn primary" :disabled="busy || !moduleId" @click="assign">
          {{ busy ? 'Saving…' : 'Assign' }}
        </button>
      </div>
    </div>

    <p v-if="notice" class="flash ok" style="margin:0;">{{ notice }}</p>
    <p v-if="errorMsg" class="help training-assign-error" style="margin:0;">{{ errorMsg }}</p>
  </div>
</template>
