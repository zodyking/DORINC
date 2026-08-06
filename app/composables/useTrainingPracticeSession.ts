import type { WizardLineDraft } from '~/utils/line-item-wizard-ui'
import type { DraftLine } from '~/utils/invoice-creator-ui'

export interface ServiceLogPracticeState {
  customerId: string
  vehicleId: string
  serviceDate: string
  dueDate: string
  complaint: string
  logMode: 'upload' | null
  photoAdded: boolean
  digitalLines: WizardLineDraft[]
  mockSubmitted: boolean
}

export interface InvoicePracticeState {
  customerId: string
  vehicleId: string
  invoiceDate: string
  dueDate: string
  paymentTerms: string
  poNumber: string
  complaint: string
  lines: DraftLine[]
  mockSaved: boolean
}

export interface TrainingPracticeSession {
  serviceLog: ServiceLogPracticeState
  invoice: InvoicePracticeState
  resetServiceLog: () => void
  resetInvoice: () => void
}

const TRAINING_PRACTICE_KEY: InjectionKey<TrainingPracticeSession> = Symbol('training-practice')

function defaultServiceLogState(): ServiceLogPracticeState {
  const today = new Date().toISOString().slice(0, 10)
  const due = new Date()
  due.setDate(due.getDate() + 30)
  return {
    customerId: '',
    vehicleId: '',
    serviceDate: today,
    dueDate: due.toISOString().slice(0, 10),
    complaint: '',
    logMode: null,
    photoAdded: false,
    digitalLines: [],
    mockSubmitted: false,
  }
}

function defaultInvoiceState(): InvoicePracticeState {
  const today = new Date().toISOString().slice(0, 10)
  return {
    customerId: '',
    vehicleId: '',
    invoiceDate: today,
    dueDate: today,
    paymentTerms: 'net_30',
    poNumber: '',
    complaint: '',
    lines: [],
    mockSaved: false,
  }
}

export function provideTrainingPracticeSession(): TrainingPracticeSession {
  const serviceLog = reactive(defaultServiceLogState())
  const invoice = reactive(defaultInvoiceState())

  const session: TrainingPracticeSession = {
    serviceLog,
    invoice,
    resetServiceLog() {
      Object.assign(serviceLog, defaultServiceLogState())
    },
    resetInvoice() {
      Object.assign(invoice, defaultInvoiceState())
    },
  }

  provide(TRAINING_PRACTICE_KEY, session)
  return session
}

export function useTrainingPracticeSession(): TrainingPracticeSession {
  const session = inject(TRAINING_PRACTICE_KEY)
  if (!session) throw new Error('Training practice session missing')
  return session
}
