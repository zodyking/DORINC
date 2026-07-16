import { z } from 'zod'
import { useDb } from '../../../../db/client'
import {
  approvePortalRequest,
  PortalRequestReviewError,
} from '../../../../services/portal-request-review.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'
import {
  PORTAL_REQUEST_REVIEW_KINDS,
  portalRequestApproveSchema,
} from '../../../../../shared/validators/portal-request-review'

const kindParamSchema = z.object({
  kind: z.enum(PORTAL_REQUEST_REVIEW_KINDS),
  id: idParamSchema.shape.id,
})

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'portal_requests.review.all')
  const { kind, id } = validateParams(event, kindParamSchema)
  const body = await validateBody(event, portalRequestApproveSchema)

  try {
    const result = await approvePortalRequest(useDb(), kind, id, actor.id, body.reason, body.correctionApply)

    const entityType = kind === 'invoice_change'
      ? 'invoice_change_request'
      : kind === 'vehicle_change'
        ? 'vehicle_change_request'
        : kind === 'new_vehicle'
          ? 'new_vehicle_request'
          : kind === 'general'
            ? 'portal_general_request'
            : 'service_request'

    await writeAudit(event, {
      entityType,
      entityId: id,
      action: 'portal_requests.approve',
      afterData: {
        kind,
        status: 'approved',
        reviewReason: body.reason ?? null,
        correctionApply: body.correctionApply ?? null,
        resultInvoiceId: 'invoice' in result ? result.invoice.id : ('revision' in result ? result.revision?.id ?? null : null),
        resultVehicleId: 'vehicle' in result ? result.vehicle.id : null,
        sourceInvoiceId: 'sourceInvoiceId' in result ? result.sourceInvoiceId : null,
      },
      permissionKey: 'portal_requests.review.all',
      riskLevel: 'sensitive',
    })

    if ('revision' in result && result.revision) {
      await writeAudit(event, {
        entityType: 'invoice',
        entityId: result.revision.id,
        action: 'invoices.revision',
        afterData: {
          invoiceNumber: result.revision.invoiceNumber,
          sourceInvoiceId: result.sourceInvoiceId,
          status: result.revision.status,
          creationSource: result.revision.creationSource,
          portalRequestId: id,
        },
        permissionKey: 'portal_requests.review.all',
        riskLevel: 'sensitive',
      })
    }

    if ('invoice' in result && result.invoice) {
      await writeAudit(event, {
        entityType: 'invoice',
        entityId: result.invoice.id,
        action: 'invoices.create',
        afterData: {
          invoiceNumber: result.invoice.invoiceNumber,
          creationSource: result.invoice.creationSource,
          customerId: result.invoice.customerId,
          vehicleId: result.invoice.vehicleId,
          serviceRequestId: result.invoice.serviceRequestId,
          status: result.invoice.status,
        },
        permissionKey: 'portal_requests.review.all',
        riskLevel: 'sensitive',
      })
    }

    if ('vehicle' in result && result.vehicle) {
      await writeAudit(event, {
        entityType: 'vehicle',
        entityId: result.vehicle.id,
        action: 'vehicles.create',
        afterData: {
          customerId: result.vehicle.customerId,
          busNumber: result.vehicle.busNumber,
          portalRequestId: id,
        },
        permissionKey: 'portal_requests.review.all',
        riskLevel: 'normal',
      })
    }

    return result
  }
  catch (err) {
    if (err instanceof PortalRequestReviewError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Portal request not found')
      if (err.code === 'NOT_PENDING') throw apiError(event, 'CONFLICT', 'This request has already been reviewed')
      if (err.code === 'INVALID_INVOICE') {
        throw apiError(event, 'CONFLICT', 'A revision can only be created from a sent or paid invoice')
      }
      if (err.code === 'INVALID_CORRECTION') {
        throw apiError(event, 'VALIDATION_ERROR', 'Correction apply values do not match this request type')
      }
      if (err.code === 'DUPLICATE_BUS_NUMBER') {
        throw apiError(event, 'CONFLICT', 'A vehicle with this fleet tag already exists for this customer')
      }
      if (err.code === 'VEHICLE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
    }
    throw err
  }
})
