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

const { data: modulesData } = useClientFetch<{ items: ModuleRow[] }>('/api/training/modules')
const {
  data: assignmentsData,
  refresh,
  error: assignmentsError,
  pending: assignmentsPending,
} = useClientFetch<{ items: Array<{ id: string, moduleId: string, status: string, locksAccess: boolean, module: { title: string } }> }>(
  '/api/training/assignments',
  { query: { userId: props.userId } },
)

const moduleId = ref('')
const locksAccess = ref(true)
const notes = ref('')
const busy = ref(false)
const errorMsg = ref('')
const notice = ref('')

const modules = computed(() => modulesData.value?.items ?? [])
const assignments = computed(() => assignmentsData.value?.items ?? [])
const assignmentsLoadError = computed(() => {
  if (!assignmentsError.value) return ''
  return (assignmentsError.value as { data?: { message?: string }, message?: string })?.data?.message
    || (assignmentsError.value as { message?: string })?.message
    || 'Could not load training assignments'
})

const availableModules = computed(() => {
  const assigned = new Set(assignments.value.filter(a => a.status !== 'completed').map(a => a.moduleId))
  return modules.value.filter(m => !assigned.has(m.id))
})

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ')
}

async function assign() {
  if (!moduleId.value) return
  busy.value = true
  errorMsg.value = ''
  notice.value = ''
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
    notice.value = 'Training module assigned'
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
  try {
    await $fetch(`/api/training/assignments/${id}`, { method: 'DELETE' })
    await refresh()
    emit('assigned')
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="training-assign-panel">
    <p v-if="assignmentsPending" class="help training-assign-empty">Loading assignments…</p>
    <p v-else-if="assignmentsLoadError" class="help" style="color:#dc2626; margin:0 0 12px;">
      {{ assignmentsLoadError }}
    </p>
    <ul v-else-if="assignments.length" class="training-assign-list">
      <li
        v-for="row in assignments"
        :key="row.id"
        class="training-assign-item"
      >
        <div class="training-assign-item__main">
          <b>{{ row.module.title }}</b>
          <span class="training-assign-item__meta">
            <span class="pill gray">{{ statusLabel(row.status) }}</span>
            <span v-if="row.locksAccess" class="pill warn">Locks access</span>
          </span>
        </div>
        <button
          v-if="row.status !== 'completed'"
          type="button"
          class="btn sm danger"
          :disabled="busy"
          @click="removeAssignment(row.id)"
        >
          Remove
        </button>
      </li>
    </ul>
    <p v-else class="help training-assign-empty">No training assigned yet.</p>

    <div class="training-assign-form">
      <label class="fld">
        Assign module
        <select v-model="moduleId" :disabled="busy || !availableModules.length">
          <option value="">Select module…</option>
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
          Assign
        </button>
      </div>
    </div>

    <p v-if="notice" class="flash ok">{{ notice }}</p>
    <p v-if="errorMsg" class="help" style="color:#dc2626; margin:0;">{{ errorMsg }}</p>
  </div>
</template>
