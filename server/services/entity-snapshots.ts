import type { Db } from '../db/client'
import type { InvoiceCustomerSnapshot, InvoiceVehicleSnapshot } from '../db/schema/invoices'
import type { customers } from '../db/schema/customers'
import type { vehicles } from '../db/schema/vehicles'

type CustomerRow = typeof customers.$inferSelect
type VehicleRow = typeof vehicles.$inferSelect

export function buildCustomerSnapshot(customer: CustomerRow): InvoiceCustomerSnapshot {
  return {
    displayName: customer.displayName,
    email: customer.email,
    phone: customer.phone,
    billingAddress: customer.billingAddress ?? null,
    serviceAddress: customer.serviceAddress ?? null,
    taxExempt: customer.taxExempt,
    paymentTerms: customer.paymentTerms,
  }
}

export function buildVehicleSnapshot(vehicle: VehicleRow): InvoiceVehicleSnapshot {
  return {
    unitType: vehicle.unitType,
    busNumber: vehicle.busNumber,
    unitTag: vehicle.unitTag,
    vin: vehicle.vin,
    plate: vehicle.plate,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    odometer: vehicle.odometer != null ? String(vehicle.odometer) : null,
    odometerUnit: vehicle.odometerUnit,
  }
}

/** Prefer live name, then snapshot, then a safe placeholder. */
export function resolveCustomerDisplayName(
  liveName: string | null | undefined,
  snapshot: InvoiceCustomerSnapshot | null | undefined,
): string {
  return liveName || snapshot?.displayName || 'Deleted customer'
}

export function resolveVehicleDisplay(
  live: Partial<InvoiceVehicleSnapshot> | null | undefined,
  snapshot: InvoiceVehicleSnapshot | null | undefined,
): InvoiceVehicleSnapshot | null {
  if (live?.unitType || live?.busNumber || live?.make) {
    return {
      unitType: live.unitType ?? snapshot?.unitType ?? 'truck',
      busNumber: live.busNumber ?? snapshot?.busNumber ?? null,
      unitTag: live.unitTag ?? snapshot?.unitTag ?? null,
      vin: live.vin ?? snapshot?.vin ?? null,
      plate: live.plate ?? snapshot?.plate ?? null,
      year: live.year ?? snapshot?.year ?? null,
      make: live.make ?? snapshot?.make ?? null,
      model: live.model ?? snapshot?.model ?? null,
      odometer: live.odometer ?? snapshot?.odometer ?? null,
      odometerUnit: live.odometerUnit ?? snapshot?.odometerUnit ?? 'mi',
    }
  }
  return snapshot ?? null
}

export type { Db }
