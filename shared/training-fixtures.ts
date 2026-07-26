/** Sandbox data for hands-on training — never persisted to production tables. */

export interface TrainingCustomerFixture {
  id: string
  displayName: string
  accountKind: 'fleet' | 'individual'
  paymentTerms: string
  taxExempt: boolean
}

export interface TrainingVehicleFixture {
  id: string
  customerId: string
  unitType: string
  busNumber: string | null
  unitTag: string | null
  year: number
  make: string
  model: string
  trim: string | null
  vin: string
  odometer: string
  odometerUnit: string
}

export const TRAINING_CUSTOMERS: TrainingCustomerFixture[] = [
  {
    id: 'train-cust-acme',
    displayName: 'Acme Fleet Services',
    accountKind: 'fleet',
    paymentTerms: 'net_30',
    taxExempt: false,
  },
  {
    id: 'train-cust-metro',
    displayName: 'Metro Transit Co.',
    accountKind: 'fleet',
    paymentTerms: 'net_15',
    taxExempt: true,
  },
  {
    id: 'train-cust-jones',
    displayName: 'Jones Trucking',
    accountKind: 'individual',
    paymentTerms: 'due_on_receipt',
    taxExempt: false,
  },
]

export const TRAINING_VEHICLES: TrainingVehicleFixture[] = [
  {
    id: 'train-veh-606',
    customerId: 'train-cust-acme',
    unitType: 'bus',
    busNumber: '606',
    unitTag: 'ACME-606',
    year: 2019,
    make: 'Freightliner',
    model: 'M2',
    trim: null,
    vin: '1FVHG3DV7KH123456',
    odometer: '412806',
    odometerUnit: 'mi',
  },
  {
    id: 'train-veh-612',
    customerId: 'train-cust-acme',
    unitType: 'bus',
    busNumber: '612',
    unitTag: 'ACME-612',
    year: 2021,
    make: 'International',
    model: 'CE',
    trim: null,
    vin: '1HTMMAAL5MH789012',
    odometer: '198400',
    odometerUnit: 'mi',
  },
  {
    id: 'train-veh-tag12',
    customerId: 'train-cust-metro',
    unitType: 'bus',
    busNumber: null,
    unitTag: 'TAG-12',
    year: 2018,
    make: 'IC',
    model: 'CE',
    trim: 'School',
    vin: '4UZABR7F8JC345678',
    odometer: '2148',
    odometerUnit: 'hr',
  },
]

export const TRAINING_CATALOG_QUICK_ITEMS = [
  { description: 'Labor — diagnostic', lineType: 'labor' as const, unitPrice: '145.00' },
  { description: 'Brake chamber', lineType: 'part' as const, unitPrice: '89.50' },
  { description: 'Shop supplies', lineType: 'fee' as const, unitPrice: '25.00' },
]
