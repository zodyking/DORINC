import { useDb } from '../../../db/client'
import { approveInvoice, InvoicesServiceError } from '../../../services/invoices.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.approve.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    const { invoice, before } = await approveInvoice(useDb(), id, actor.id, actor.accountType)

    const auditAction = 'invoices.submit_for_manager_approval'

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: id,
      action: auditAction,
      beforeData: { status: before.status, total: before.total },
      afterData: {
        status: invoice.status,
        total: invoice.total,
        approvedAt: invoice.approvedAt,
        submittedForApprovalAt: invoice.submittedForApprovalAt,
      },
      changedFields: ['status'],
      permissionKey: 'invoices.approve.all',
      riskLevel: 'sensitive',
    })

    return { invoice }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
      if (err.code === 'MANAGER_APPROVAL_REQUIRED') {
        throw apiError(event, 'FORBIDDEN', 'Manager approval is required for this invoice')
      }
      if (err.code === 'INVALID_TRANSITION') {
        throw apiError(event, 'CONFLICT', 'This invoice cannot be submitted for manager approval from its current status')
      }
    }
    throw err
  }
})
