<script setup lang="ts">
import { TRAINING_CUSTOMERS, TRAINING_VEHICLES } from '#shared/training-fixtures'
import { useTrainingPracticeSession } from '~/composables/useTrainingPracticeSession'
import { vehicleSub, vehicleTag } from '~/utils/vehicles-ui'
import {
  INVOICE_WIZARD_STEPS,
  LINE_TYPE_OPTIONS,
  createEmptyLine,
  previewDraftTotals,
  previewLineAmount,
  formatInvoiceNumberDisplay,
} from '~/utils/invoice-creator-ui'
import { moneyDisplay, paymentTermsLabel } from '~/utils/invoices-ui'

const props = defineProps<{
  practiceId: string
}>()

const emit = defineEmits<{
  ready: [ready: boolean]
}>()

const { invoice } = useTrainingPracticeSession()

const customers = TRAINING_CUSTOMERS
const vehiclesForCustomer = computed(() =>
  TRAINING_VEHICLES.filter(v => v.customerId === invoice.customerId),
)

const selectedCustomer = computed(() => customers.find(c => c.id === invoice.customerId))
const selectedVehicle = computed(() => TRAINING_VEHICLES.find(v => v.id === invoice.vehicleId))

const activeWizardStep = computed(() => {
  const map: Record<string, number> = {
    'inv-customer': 1,
    'inv-vehicle': 2,
    'inv-dates': 3,
    'inv-lines': 4,
    'inv-review': 5,
    'inv-save': 5,
  }
  return map[props.practiceId] ?? 1
})

function initials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function ensureLine() {
  if (!invoice.lines.length) {
    const line = createEmptyLine()
    line.description = 'Labor — diagnostic'
    line.quantity = '1'
    line.unitPrice = '145.00'
    invoice.lines.push(line)
  }
}

function addLine() {
  invoice.lines.push(createEmptyLine())
}

function removeLine(localId: string) {
  if (invoice.lines.length <= 1) return
  invoice.lines = invoice.lines.filter(l => l.localId !== localId)
}

const previewTotals = computed(() => {
  const customer = selectedCustomer.value
  return previewDraftTotals(invoice.lines, {
    taxRate: '0.08',
    taxExempt: customer?.taxExempt ?? false,
  })
})

const ready = computed(() => {
  switch (props.practiceId) {
    case 'inv-customer':
      return !!invoice.customerId
    case 'inv-vehicle':
      return !!invoice.vehicleId
    case 'inv-dates':
      return !!invoice.invoiceDate && !!invoice.dueDate && !!invoice.paymentTerms
    case 'inv-lines':
      return invoice.lines.length >= 1
        && invoice.lines.every(l => l.description.trim() && Number.parseFloat(l.quantity) > 0)
    case 'inv-review':
      return true
    case 'inv-save':
      return invoice.mockSaved
    default:
      return false
  }
})

watch(ready, (v) => emit('ready', v), { immediate: true })

watch(() => props.practiceId, (id) => {
  if (id === 'inv-lines') ensureLine()
}, { immediate: true })

function mockSave() {
  invoice.mockSaved = true
}
</script>

<template>
  <div class="training-practice-wizard">
    <div class="training-practice-badge">Practice mode — draft invoice is not saved</div>

    <div class="sl-progress" aria-label="Invoice wizard progress">
      <div
        v-for="s in INVOICE_WIZARD_STEPS"
        :key="s.n"
        class="sl-step"
        :class="{ on: activeWizardStep === s.n, done: activeWizardStep > s.n }"
      >
        <div class="dot">{{ s.n }}</div>{{ s.label }}
      </div>
    </div>

    <div v-if="practiceId === 'inv-customer'" class="sl-panel active">
      <h3>Which customer?</h3>
      <p class="sl-hint">Pick the billing account for this practice invoice.</p>
      <div class="sl-picks">
        <button
          v-for="c in customers"
          :key="c.id"
          type="button"
          class="sl-pick"
          :class="{ on: invoice.customerId === c.id }"
          @click="invoice.customerId = c.id; invoice.vehicleId = ''"
        >
          <span class="av teal">{{ initials(c.displayName) }}</span>
          <span class="nm">
            <b>{{ c.displayName }}</b>
            <small>{{ c.taxExempt ? 'Tax exempt' : paymentTermsLabel(c.paymentTerms) }}</small>
          </span>
          <span class="chk" />
        </button>
      </div>
    </div>

    <div v-else-if="practiceId === 'inv-vehicle'" class="sl-panel active">
      <h3>Which vehicle?</h3>
      <p class="sl-hint">Customer: <strong>{{ selectedCustomer?.displayName ?? '—' }}</strong></p>
      <div v-if="vehiclesForCustomer.length" class="sl-picks">
        <button
          v-for="v in vehiclesForCustomer"
          :key="v.id"
          type="button"
          class="sl-pick"
          :class="{ on: invoice.vehicleId === v.id }"
          @click="invoice.vehicleId = v.id"
        >
          <span class="av indigo">{{ (v.busNumber ?? v.unitTag ?? 'U').slice(0, 2) }}</span>
          <span class="nm">
            <b>{{ vehicleTag(v) }}</b>
            <small>{{ vehicleSub(v) }}</small>
          </span>
          <span class="chk" />
        </button>
      </div>
    </div>

    <div v-else-if="practiceId === 'inv-dates'" class="sl-panel active">
      <h3>Dates &amp; terms</h3>
      <p class="sl-hint">Invoice date, due date, and payment terms.</p>
      <label class="fld"><span>Invoice date</span><input v-model="invoice.invoiceDate" type="date"></label>
      <label class="fld"><span>Due date</span><input v-model="invoice.dueDate" type="date"></label>
      <label class="fld"><span>Payment terms</span>
        <select v-model="invoice.paymentTerms">
          <option value="due_on_receipt">Due on receipt</option>
          <option value="net_15">Net 15</option>
          <option value="net_30">Net 30</option>
          <option value="net_45">Net 45</option>
          <option value="net_60">Net 60</option>
        </select>
      </label>
      <label class="fld"><span>PO / reference</span>
        <input v-model="invoice.poNumber" type="text" placeholder="Optional customer PO">
      </label>
    </div>

    <div v-else-if="practiceId === 'inv-lines'" class="sl-panel active">
      <h3>Line items</h3>
      <p class="sl-hint">Add at least one line. Use the table exactly like New invoice → Line items.</p>
      <label class="fld inv-wizard-complaint">
        <span>Customer complaint / symptoms</span>
        <textarea v-model="invoice.complaint" rows="2" placeholder="Optional — prints on PDF" />
      </label>
      <div class="card inv-line-editor" style="margin-top:12px;">
        <div class="chead inv-line-editor-head">
          <div class="right inv-line-actions">
            <button type="button" class="btn sm primary" @click="addLine">+ Add line</button>
          </div>
        </div>
        <div class="cbody">
          <div class="tscroll inv-line-table inv-line-table--desktop">
            <table class="ed-lines">
              <thead>
                <tr>
                  <th style="width:110px">Type</th>
                  <th>Description</th>
                  <th style="width:110px">Qty / Hrs</th>
                  <th style="width:150px">Rate</th>
                  <th style="width:130px; text-align:right">Amount</th>
                  <th style="width:36px" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in invoice.lines" :key="line.localId">
                  <td>
                    <select v-model="line.lineType">
                      <option v-for="opt in LINE_TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </td>
                  <td><input v-model="line.description" type="text" placeholder="Description"></td>
                  <td><input v-model="line.quantity" type="text" inputmode="decimal"></td>
                  <td><input v-model="line.unitPrice" type="text" inputmode="decimal"></td>
                  <td class="amt">{{ moneyDisplay(previewLineAmount(line.quantity, line.unitPrice) || '0') }}</td>
                  <td>
                    <button type="button" class="rm" aria-label="Remove" :disabled="invoice.lines.length <= 1" @click="removeLine(line.localId)">✕</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="practiceId === 'inv-review'" class="sl-panel active">
      <h3>Review draft</h3>
      <p class="sl-hint">Check customer, vehicle, dates, and totals before saving.</p>
      <div class="sl-review">
        <div class="r"><span class="k">Customer</span><span class="v">{{ selectedCustomer?.displayName ?? '—' }}</span></div>
        <div class="r"><span class="k">Vehicle</span><span class="v">{{ selectedVehicle ? vehicleTag(selectedVehicle) : '—' }}</span></div>
        <div class="r"><span class="k">Invoice date</span><span class="v">{{ invoice.invoiceDate }}</span></div>
        <div class="r"><span class="k">Due date</span><span class="v">{{ invoice.dueDate }}</span></div>
        <div class="r"><span class="k">Terms</span><span class="v">{{ paymentTermsLabel(invoice.paymentTerms) }}</span></div>
        <div class="r"><span class="k">Lines</span><span class="v">{{ invoice.lines.length }} item(s)</span></div>
        <div class="r"><span class="k">Subtotal</span><span class="v">{{ moneyDisplay(previewTotals.subtotal) }}</span></div>
        <div class="r"><span class="k">Tax</span>
          <span class="v">
            <template v-if="selectedCustomer?.taxExempt">
              <s>{{ moneyDisplay(previewTotals.waivedTaxAmount) }}</s> tax exempt
            </template>
            <template v-else>{{ moneyDisplay(previewTotals.taxAmount) }}</template>
          </span>
        </div>
        <div class="r"><span class="k">Total</span><span class="v"><strong>{{ moneyDisplay(previewTotals.total) }}</strong></span></div>
      </div>
    </div>

    <div v-else-if="practiceId === 'inv-save'" class="sl-panel active">
      <h3>Save practice draft</h3>
      <p class="sl-hint">Tap save to complete the practice invoice. Nothing is written to the database.</p>
      <div v-if="!invoice.mockSaved" class="training-practice-submit-box">
        <p>Save <strong>{{ formatInvoiceNumberDisplay(9999) }}</strong> as draft?</p>
        <button type="button" class="btn primary" @click="mockSave">Save draft (practice)</button>
      </div>
      <div v-else class="training-practice-success">
        <span class="training-card-icon" style="width:48px;height:48px;font-size:1.5rem;">✓</span>
        <p><strong>Practice invoice saved!</strong> In production you can preview PDF and send from the invoice detail page.</p>
      </div>
    </div>

    <p v-if="!ready" class="training-practice-hint help">
      Complete the fields above to unlock Continue.
    </p>
  </div>
</template>
