import type { H3Event } from 'h3'
import type { Db } from '../db/client'
import type { FileOwnerEntityType } from '../db/schema/files'
import { getCustomer } from './customers.service'
import { getVehicle } from './vehicles.service'
import { apiError } from '../utils/api-error'
import { hasPermission, type AuthContext } from '../utils/require-permission'

interface FileOwnerRef {
  ownerEntityType: FileOwnerEntityType
  ownerEntityId: string
}

/**
 * Staff may read file bytes when they have files.read.all, or when the file
 * belongs to an entity they can already read (e.g. own service log uploads).
 */
export async function assertCanReadFile(event: H3Event, db: Db, file: FileOwnerRef) {
  if (hasPermission(event, 'files.read.all')) return

  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  if (file.ownerEntityType === 'service_log') {
    const { getServiceLog } = await import('./service-logs.service')
    const log = await getServiceLog(db, file.ownerEntityId)
    const allowed = hasPermission(event, 'service_logs.read.all')
      || hasPermission(event, 'service_logs.read.own', { ownsRecord: log.submittedBy === auth.user.id })
    if (allowed) return
  }

  if (file.ownerEntityType === 'invoice') {
    const { getInvoice } = await import('./invoices.service')
    const invoice = await getInvoice(db, file.ownerEntityId)
    if (hasPermission(event, 'invoices.read.all')) return
    if (invoice.serviceLogId) {
      const { getServiceLog } = await import('./service-logs.service')
      const log = await getServiceLog(db, invoice.serviceLogId)
      const allowed = hasPermission(event, 'service_logs.read.all')
        || hasPermission(event, 'service_logs.read.own', { ownsRecord: log.submittedBy === auth.user.id })
      if (allowed) return
    }
  }

  if (file.ownerEntityType === 'customer') {
    if (hasPermission(event, 'customers.read.all')) return
    if (auth.user.accountType === 'customer') {
      const portalCustomerId = auth.user.customerId
      if (portalCustomerId && portalCustomerId === file.ownerEntityId) return
    }
  }

  if (file.ownerEntityType === 'vehicle') {
    if (hasPermission(event, 'vehicles.read.all')) return
    if (auth.user.accountType === 'customer') {
      const portalCustomerId = auth.user.customerId
      if (!portalCustomerId) throw apiError(event, 'FORBIDDEN', 'You do not have permission to view this file')
      const vehicle = await getVehicle(db, file.ownerEntityId)
      if (vehicle.customerId === portalCustomerId) return
    }
  }

  throw apiError(event, 'FORBIDDEN', 'You do not have permission to view this file')
}

export async function assertCanUploadCustomerDocument(event: H3Event, db: Db, customerId: string) {
  if (hasPermission(event, 'files.upload.all') && hasPermission(event, 'customers.update.all')) return

  const auth = event.context.auth as AuthContext | undefined
  if (auth?.user.accountType === 'customer' && auth.user.customerId === customerId) return

  throw apiError(event, 'FORBIDDEN', 'You do not have permission to upload this document')
}

export async function assertCanUploadVehicleDocument(event: H3Event, db: Db, vehicleId: string) {
  if (hasPermission(event, 'files.upload.all') && hasPermission(event, 'vehicles.update.all')) return

  const auth = event.context.auth as AuthContext | undefined
  if (auth?.user.accountType === 'customer' && auth.user.customerId) {
    const vehicle = await getVehicle(db, vehicleId)
    if (vehicle.customerId === auth.user.customerId) return
  }

  throw apiError(event, 'FORBIDDEN', 'You do not have permission to upload this document')
}

export async function assertCustomerInScope(event: H3Event, db: Db, customerId: string) {
  try {
    await getCustomer(db, customerId)
  }
  catch {
    throw apiError(event, 'NOT_FOUND', 'Customer not found')
  }
}

export async function assertVehicleInScope(event: H3Event, db: Db, vehicleId: string) {
  try {
    await getVehicle(db, vehicleId)
  }
  catch {
    throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
  }
}
