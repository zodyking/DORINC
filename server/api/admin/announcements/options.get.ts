import { useDb } from '../../../db/client'
import { listStaffAccountTypeOptions } from '../../../services/announcements.service'
import { listUsers } from '../../../services/users.service'
import { requirePermission } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const db = useDb()
  const [accountTypes, usersPage] = await Promise.all([
    listStaffAccountTypeOptions(db),
    listUsers(db, { page: 1, pageSize: 200, status: 'active' }),
  ])

  const users = (usersPage.items ?? [])
    .filter(u => u.accountType !== 'customer')
    .map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      accountType: u.accountType,
    }))

  return { accountTypes, users }
})
