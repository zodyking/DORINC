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
const { data: assignmentsData, refresh } = useClientFetch<{ items: Array<{ id: string, moduleId: string, status: string, locksAccess: boolean, module: { title: string } }> }>(
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

const availableModules = computed(() => {
  const assigned = new Set(assignments.value.filter(a => a.status !== 'completed').map(a => a.moduleId))
  return modules.value.filter(m => !assigned.has(m.id))
})

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
    <div v-if="assignments.length" class="stack" style="gap:8px;">
      <div
        v-for="row in assignments"
        :key="row.id"
        class="card"
        style="padding:12px 14px;"
      >
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;">
          <div>
            <b style="display:block;font-size:0.92rem;">{{ row.module.title }}</b>
            <span class="help">
              {{ row.status.replace('_', ' ') }}
              <template v-if="row.locksAccess"> · locks login</template>
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
        </div>
      </div>
    </div>
    <p v-else class="help" style="margin:0;">No training assigned yet.</p>

    <div class="training-assign-row">
      <label class="fld">
        Assign module
        <select v-model="moduleId" :disabled="busy || !availableModules.length">
          <option value="">Select module…</option>
          <option v-for="m in availableModules" :key="m.id" :value="m.id">
            {{ m.title }} ({{ m.estimatedMinutes }} min)
          </option>
        </select>
      </label>
      <label class="tglrow" style="margin:0;align-self:center;">
        Lock until complete
        <span class="tgl"><input v-model="locksAccess" type="checkbox"><span class="tr" /></span>
      </label>
      <button type="button" class="btn primary" :disabled="busy || !moduleId" @click="assign">
        Assign
      </button>
    </div>
    <label class="fld">
      Notes for assignee (optional)
      <input v-model="notes" type="text" placeholder="Complete before first solo log">
    </label>
    <p v-if="notice" class="flash ok">{{ notice }}</p>
    <p v-if="errorMsg" class="help" style="color:#dc2626;">{{ errorMsg }}</p>
  </div>
</template>
