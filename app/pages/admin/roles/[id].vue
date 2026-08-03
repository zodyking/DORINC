<script setup lang="ts">
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

definePageMeta({ layout: 'staff', permission: 'roles.manage.all' })

interface RoleDetail {
  id: string
  key: string
  name: string
  description: string | null
  isSystem: boolean
  permissions: string[]
  userCount: number
  createdAt: string
  updatedAt: string
}

const route = useRoute()
const auth = useAuthStore()

const { data, refresh, error } = useClientFetch<{ role: RoleDetail }>(
  `/api/admin/roles/${route.params.id}`,
)

const role = computed(() => data.value?.role)
const roleGrants = computed(() => role.value?.permissions ?? [])

const editName = ref('')
const editDescription = ref('')
const selectedPermissions = ref<Set<string>>(new Set())

watchEffect(() => {
  if (role.value) {
    editName.value = role.value.name
    editDescription.value = role.value.description ?? ''
    selectedPermissions.value = new Set(role.value.permissions)
  }
})

const isImmutable = computed(() => 
  role.value?.key === 'super_admin' || role.value?.key === 'customer'
)

const canModifySystemRole = computed(() => auth.user?.accountType === 'super_admin')

const canEdit = computed(() => {
  if (!role.value) return false
  if (isImmutable.value) return false
  if (role.value.isSystem && !canModifySystemRole.value) return false
  return true
})

const isDirty = computed(() => {
  if (!role.value) return false
  if (editName.value !== role.value.name) return true
  if (editDescription.value !== (role.value.description ?? '')) return true
  if (selectedPermissions.value.size !== role.value.permissions.length) return true
  for (const p of role.value.permissions) {
    if (!selectedPermissions.value.has(p)) return true
  }
  return false
})

const busy = ref(false)
const notice = ref('')
const errorMsg = ref('')

function togglePermission(key: string) {
  if (!canEdit.value) return
  if (key === 'system.admin.all' && role.value?.key !== 'super_admin') return
  if (selectedPermissions.value.has(key)) {
    selectedPermissions.value.delete(key)
  } else {
    selectedPermissions.value.add(key)
  }
  selectedPermissions.value = new Set(selectedPermissions.value)
}

async function saveChanges() {
  if (!canEdit.value || !isDirty.value) return
  busy.value = true
  errorMsg.value = ''
  notice.value = ''
  try {
    await $fetch(`/api/admin/roles/${route.params.id}`, {
      method: 'PATCH',
      body: {
        name: editName.value,
        description: editDescription.value || undefined,
        permissions: [...selectedPermissions.value],
      },
    })
    await refresh()
    notice.value = 'Role updated successfully'
  }
  catch (err) {
    errorMsg.value = syncFetchErrorMessage(err, 'Failed to update role')
  }
  finally {
    busy.value = false
  }
}

const showDeleteModal = ref(false)
const deleteBusy = ref(false)

async function deleteRole() {
  deleteBusy.value = true
  errorMsg.value = ''
  try {
    await $fetch(`/api/admin/roles/${route.params.id}`, { method: 'DELETE' })
    await navigateTo('/admin/roles')
  }
  catch (err) {
    errorMsg.value = syncFetchErrorMessage(err, 'Failed to delete role')
    showDeleteModal.value = false
  }
  finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <section class="page active">
    <div v-if="error" class="card" style="padding:32px; text-align:center; color:#64748b;">
      Role not found. <NuxtLink to="/admin/roles">Back to roles</NuxtLink>
    </div>

    <template v-else-if="role">
      <StaffPageHead>
        <template #title>
          {{ role.name }}
          <span :class="role.isSystem ? 'pill info' : 'pill'" style="vertical-align:3px">
            {{ role.isSystem ? 'System' : 'Custom' }}
          </span>
        </template>
        <template #subtitle>
          <NuxtLink to="/admin/roles">Roles</NuxtLink> / <code>{{ role.key }}</code> · {{ role.userCount }} user{{ role.userCount === 1 ? '' : 's' }} assigned
        </template>
        <template #actions>
          <button
            v-if="!role.isSystem"
            class="btn"
            :disabled="busy"
            @click="showDeleteModal = true"
          >
            Delete
          </button>
          <button
            class="btn primary"
            :disabled="busy || !isDirty || !canEdit"
            @click="saveChanges"
          >
            {{ busy ? 'Saving...' : 'Save changes' }}
          </button>
        </template>
      </StaffPageHead>

      <p v-if="errorMsg" class="flash err">{{ errorMsg }}</p>
      <p v-if="notice" class="flash ok">{{ notice }}</p>

      <div v-if="isImmutable" class="card" style="margin-bottom:16px; background:#fef3c7;">
        <div class="cbody" style="padding:12px 16px; color:#92400e;">
          This role cannot be modified. {{ role.key === 'super_admin' ? 'Super Admin always has all permissions.' : 'Customer accounts use the portal.' }}
        </div>
      </div>

      <div v-else-if="role.isSystem && !canModifySystemRole" class="card" style="margin-bottom:16px; background:#fef3c7;">
        <div class="cbody" style="padding:12px 16px; color:#92400e;">
          Only Super Admins can modify system roles.
        </div>
      </div>

      <div class="cols">
        <div class="stack" style="flex: 0 0 320px;">
          <div class="card">
            <div class="chead"><h3>Role details</h3></div>
            <div class="cbody">
              <label class="fld">
                Display name
                <input
                  v-model="editName"
                  type="text"
                  :disabled="!canEdit"
                  maxlength="100"
                >
              </label>
              <label class="fld">
                Description
                <textarea
                  v-model="editDescription"
                  rows="3"
                  :disabled="!canEdit"
                  maxlength="500"
                />
              </label>
              <div class="fld">
                <span style="font-weight:500;">Key</span>
                <div><code>{{ role.key }}</code></div>
              </div>
            </div>
          </div>
        </div>

        <div class="stack" style="flex: 1; min-width: 0;">
          <div class="card">
            <div class="chead">
              <h3>Permissions</h3>
              <div class="right">
                <span class="pill">{{ selectedPermissions.size }} selected</span>
              </div>
            </div>
            <div class="cbody perm-matrix-body">
              <PermissionMatrixTable
                :role-grants="roleGrants"
                :selected-keys="selectedPermissions"
                mode="checkbox"
                :show-nav-hint="canEdit"
                @toggle="togglePermission"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Delete Confirmation Modal -->
    <Teleport to="body">
      <div v-if="showDeleteModal" class="modal-backdrop" @click.self="showDeleteModal = false">
        <div class="modal" role="dialog" aria-labelledby="delete-role-title">
          <div class="modal-header">
            <h2 id="delete-role-title">Delete role</h2>
            <button class="close-btn" aria-label="Close" @click="showDeleteModal = false">&times;</button>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to delete <b>{{ role?.name }}</b>?</p>
            <p v-if="role?.userCount" style="color:#dc2626;">
              This role has {{ role.userCount }} user{{ role.userCount === 1 ? '' : 's' }} assigned. You must reassign them first.
            </p>
            <p v-else style="color:#64748b;">
              This action cannot be undone.
            </p>
          </div>
          <div class="modal-footer">
            <button class="btn" :disabled="deleteBusy" @click="showDeleteModal = false">Cancel</button>
            <button
              class="btn danger"
              :disabled="deleteBusy || (role?.userCount ?? 0) > 0"
              @click="deleteRole"
            >
              {{ deleteBusy ? 'Deleting...' : 'Delete role' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
code {
  font-size: 11px;
  background: #f1f5f9;
  padding: 2px 5px;
  border-radius: 4px;
  color: #475569;
}

.flash {
  margin: -8px 0 14px;
  font-size: 13px;
  font-weight: 500;
}
.flash.err { color: #dc2626; }
.flash.ok { color: #059669; }

.perm-matrix-body {
  padding: 12px 16px !important;
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
  max-width: 400px;
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

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid #e2e8f0;
}

.btn.danger {
  background: #dc2626;
  color: #fff;
  border-color: #dc2626;
}

.btn.danger:hover:not(:disabled) {
  background: #b91c1c;
  border-color: #b91c1c;
}

.btn.danger:disabled {
  opacity: 0.5;
}

@media (max-width: 720px) {
  .cols {
    flex-direction: column;
  }
  .cols .stack {
    flex: 1 !important;
  }
}
</style>
