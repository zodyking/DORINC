<script setup lang="ts">
definePageMeta({ layout: 'staff', permission: 'roles.manage.all' })

interface RoleRow {
  id: string
  key: string
  name: string
  description: string | null
  isSystem: boolean
  permissionCount: number
  userCount: number
  createdAt: string
}

const { data, refresh } = useClientFetch<{ roles: RoleRow[] }>('/api/admin/roles')

const roles = computed(() => data.value?.roles ?? [])
const systemRoles = computed(() => roles.value.filter(r => r.isSystem))
const customRoles = computed(() => roles.value.filter(r => !r.isSystem))

const showCreateModal = ref(false)
const createForm = reactive({
  key: '',
  name: '',
  description: '',
})
const createBusy = ref(false)
const createError = ref('')

function resetCreateForm() {
  createForm.key = ''
  createForm.name = ''
  createForm.description = ''
  createError.value = ''
}

async function createRole() {
  if (!createForm.key.trim() || !createForm.name.trim()) {
    createError.value = 'Key and name are required'
    return
  }
  createBusy.value = true
  createError.value = ''
  try {
    await $fetch('/api/admin/roles', {
      method: 'POST',
      body: {
        key: createForm.key,
        name: createForm.name,
        description: createForm.description || undefined,
        permissions: [],
      },
    })
    showCreateModal.value = false
    resetCreateForm()
    await refresh()
  }
  catch (err) {
    const fe = err as { data?: { data?: { message?: string } } }
    createError.value = fe.data?.data?.message ?? 'Failed to create role'
  }
  finally {
    createBusy.value = false
  }
}

function roleTypePill(isSystem: boolean) {
  return isSystem ? 'pill info' : 'pill'
}
</script>

<template>
  <section class="page active">
    <StaffPageHead subtitle="Manage roles and their permission bundles">
      <template #title>Roles &amp; Permissions</template>
      <template #actions>
        <button class="btn primary" @click="showCreateModal = true">+ Create custom role</button>
      </template>
    </StaffPageHead>

    <div class="card">
      <div class="chead">
        <h3>System roles</h3>
        <div class="right">
          <span class="pill info">{{ systemRoles.length }} roles</span>
        </div>
      </div>
      <div class="tscroll">
        <table class="tbl">
          <thead>
            <tr>
              <th>Role</th>
              <th>Key</th>
              <th>Permissions</th>
              <th>Users</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="role in systemRoles" :key="role.id">
              <td>
                <b>{{ role.name }}</b>
                <div v-if="role.description" class="role-desc">{{ role.description }}</div>
              </td>
              <td><code>{{ role.key }}</code></td>
              <td>{{ role.permissionCount }}</td>
              <td>{{ role.userCount }}</td>
              <td style="text-align:right;">
                <NuxtLink :to="`/admin/roles/${role.id}`" class="btn sm">View</NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="chead">
        <h3>Custom roles</h3>
        <div class="right">
          <span class="pill">{{ customRoles.length }} roles</span>
        </div>
      </div>
      <div v-if="customRoles.length" class="tscroll">
        <table class="tbl">
          <thead>
            <tr>
              <th>Role</th>
              <th>Key</th>
              <th>Permissions</th>
              <th>Users</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="role in customRoles" :key="role.id">
              <td>
                <b>{{ role.name }}</b>
                <div v-if="role.description" class="role-desc">{{ role.description }}</div>
              </td>
              <td><code>{{ role.key }}</code></td>
              <td>{{ role.permissionCount }}</td>
              <td>{{ role.userCount }}</td>
              <td style="text-align:right;">
                <NuxtLink :to="`/admin/roles/${role.id}`" class="btn sm">Edit</NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty" style="display:block;">
        No custom roles yet. Create one to assign tailored permissions to specific users.
      </div>
    </div>

    <!-- Create Role Modal -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="modal-backdrop" @click.self="showCreateModal = false">
        <div class="modal" role="dialog" aria-labelledby="create-role-title">
          <div class="modal-header">
            <h2 id="create-role-title">Create custom role</h2>
            <button class="close-btn" aria-label="Close" @click="showCreateModal = false">&times;</button>
          </div>
          <div class="modal-body">
            <p v-if="createError" class="flash err">{{ createError }}</p>
            <label class="fld">
              Key
              <input
                v-model="createForm.key"
                type="text"
                placeholder="e.g. service_writer"
                pattern="^[a-z][a-z0-9_]*$"
                maxlength="50"
              >
              <small>Lowercase letters, numbers, and underscores only. Cannot be changed later.</small>
            </label>
            <label class="fld">
              Display name
              <input
                v-model="createForm.name"
                type="text"
                placeholder="e.g. Service Writer"
                maxlength="100"
              >
            </label>
            <label class="fld">
              Description (optional)
              <textarea
                v-model="createForm.description"
                rows="2"
                placeholder="Brief description of this role's purpose"
                maxlength="500"
              />
            </label>
          </div>
          <div class="modal-footer">
            <button class="btn" :disabled="createBusy" @click="showCreateModal = false">Cancel</button>
            <button class="btn primary" :disabled="createBusy" @click="createRole">
              {{ createBusy ? 'Creating...' : 'Create role' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.role-desc {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

code {
  font-size: 12px;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  color: #475569;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #fff;
  border-radius: 12px;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
}

.modal-header h2 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #64748b;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: #0f172a;
}

.modal-body {
  padding: 20px;
}

.modal-body small {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  margin-top: 4px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid #e2e8f0;
}

.flash.err {
  color: #dc2626;
  font-size: 13px;
  margin-bottom: 12px;
}
</style>
