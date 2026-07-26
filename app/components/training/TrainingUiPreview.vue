<script setup lang="ts">
import StaffNavIcon from '~/components/staff/StaffNavIcon.vue'
import type { StaffNavIconName } from '~/components/staff/StaffNavIcon.vue'
import CommonLineItemsTable from '~/components/common/LineItemsTable.vue'
import { PHOTO_UPLOAD_PICK, VOICE_ENTRY_PICK } from '~/utils/entry-mode-labels'
import { INVOICE_WIZARD_STEPS } from '~/utils/invoice-creator-ui'
import { invoiceStatusPill, moneyDisplay } from '~/utils/invoices-ui'
import { serviceLogStatusPill, type ServiceLogStatus } from '~/utils/service-logs-ui'
import { BRAND_ICON, BRAND_NAME } from '~/constants/brand'

defineProps<{
  preview: string
}>()

const navHotspot = ref<string | null>(null)

const workspaceNav: Array<{ id: string, label: string, icon: StaffNavIconName, hint: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', hint: 'Open work overview and quick stats for your role.' },
  { id: 'invoices', label: 'Invoices', icon: 'invoices', hint: 'Create, edit, and send invoices. Use New invoice from the list page.' },
  { id: 'customers', label: 'Customers', icon: 'customers', hint: 'Fleet accounts, contacts, billing preferences, and portal access.' },
  { id: 'vehicles', label: 'Vehicles', icon: 'vehicles', hint: 'Unit tags, bus numbers, VIN, and service history per vehicle.' },
  { id: 'service-logs', label: 'Service Logs', icon: 'service-logs', hint: 'New service log wizard — photo sheet or voice line items.' },
  { id: 'training', label: 'Training', icon: 'training', hint: 'Assigned tutorials and module library (admins).' },
]

const serviceLogSteps = [
  { n: 1, label: 'Customer' },
  { n: 2, label: 'Vehicle' },
  { n: 3, label: 'When' },
  { n: 4, label: 'Work' },
  { n: 5, label: 'Log' },
  { n: 6, label: 'Submit' },
]

const logStatuses: ServiceLogStatus[] = [
  'draft',
  'uploaded',
  'ready_for_review',
  'in_review',
  'converted_to_invoice',
]

const sampleVoiceLines = [
  { lineType: 'labor' as const, description: 'Replaced DPF sensor', qty: '2', rate: '145.00', amount: '290.00' },
  { lineType: 'part' as const, description: 'DPF sensor kit', qty: '1', rate: '312.50', amount: '312.50' },
]

const sampleCustomers = [
  { name: 'Acme Fleet Services', sub: 'Fleet · 24 vehicles · Bus #606' },
  { name: 'Metro Transit Co.', sub: 'Fleet · 8 vehicles · Unit TAG-12' },
]

const searchQuery = ref('606')
</script>

<template>
  <div class="training-ui-preview">
    <!-- Real staff sidebar chrome -->
    <div v-if="preview === 'staff-sidebar'" class="training-ui-chrome">
      <div class="training-ui-chrome-row">
        <nav class="side training-ui-side open" aria-label="Sidebar preview">
          <div class="logo">
            <img class="sq" :src="BRAND_ICON" alt="" width="32" height="32"> {{ BRAND_NAME }}
          </div>
          <div class="label">Workspace</div>
          <button
            v-for="item in workspaceNav"
            :key="item.id"
            type="button"
            class="nav-item training-ui-nav-btn"
            :class="{ on: navHotspot === item.id }"
            @click="navHotspot = item.id"
          >
            <span class="ico" aria-hidden="true"><StaffNavIcon :name="item.icon" /></span>
            <span class="nav-label">{{ item.label }}</span>
          </button>
        </nav>
        <div class="training-ui-chrome-main">
          <header class="topbar training-ui-topbar">
            <button type="button" class="burger" tabindex="-1" aria-hidden="true">☰</button>
            <span class="crumb">Workspace / <b>{{ navHotspot ? workspaceNav.find(i => i.id === navHotspot)?.label : '…' }}</b></span>
          </header>
          <div class="training-ui-chrome-body">
            <p v-if="navHotspot" class="training-ui-hint">
              <b>{{ workspaceNav.find(i => i.id === navHotspot)?.label }}</b>
              — {{ workspaceNav.find(i => i.id === navHotspot)?.hint }}
            </p>
            <p v-else class="training-ui-hint muted">
              Tap a sidebar item — this is the same navigation you see when signed in.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Real top bar: messages -->
    <div v-else-if="preview === 'staff-messages'" class="training-ui-chrome">
      <header class="topbar training-ui-topbar standalone">
        <button type="button" class="burger" tabindex="-1" aria-hidden="true">☰</button>
        <span class="crumb">Workspace / <b>Messages</b></span>
        <span class="spacer" />
        <button type="button" class="iconbtn dm-header-btn on" tabindex="-1">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span class="dm-header-badge">3</span>
        </button>
        <button type="button" class="iconbtn" tabindex="-1" aria-hidden="true">🔔</button>
        <button type="button" class="avbtn" tabindex="-1">
          <span class="av indigo">DK</span>
        </button>
      </header>
      <p class="training-ui-hint" style="padding:12px 14px 0;">
        Tap the message bubble in the top bar to open staff direct messages. Unread counts show on the badge.
      </p>
    </div>

    <!-- Service log wizard — step bar + log mode picker -->
    <div v-else-if="preview === 'service-log-wizard'" class="training-ui-sl">
      <div class="sl-progress" aria-label="Service log steps">
        <div
          v-for="s in serviceLogSteps"
          :key="s.n"
          class="sl-step"
          :class="{ on: s.n === 5, done: s.n < 5 }"
        >
          <div class="dot">{{ s.n }}</div>{{ s.label }}
        </div>
      </div>
      <h3 style="margin:14px 0 6px;font-size:1rem;">Service log</h3>
      <p class="sl-hint">How did you record the work?</p>
      <div class="sl-picks sl-log-modes">
        <div class="sl-pick sl-log-mode on">
          <span class="av indigo" aria-hidden="true">📷</span>
          <span class="nm">
            <b>{{ PHOTO_UPLOAD_PICK.title }}</b>
            <small>{{ PHOTO_UPLOAD_PICK.serviceLogDescription }}</small>
          </span>
          <span class="chk" />
        </div>
        <div class="sl-pick sl-log-mode">
          <span class="av teal" aria-hidden="true">🎙️</span>
          <span class="nm">
            <b>{{ VOICE_ENTRY_PICK.title }}</b>
            <small>{{ VOICE_ENTRY_PICK.serviceLogDescription }}</small>
          </span>
          <span class="chk" />
        </div>
      </div>
    </div>

    <!-- Voice line wizard result -->
    <div v-else-if="preview === 'service-log-voice'" class="training-ui-sl">
      <div class="sl-progress" aria-label="Service log steps">
        <div
          v-for="s in serviceLogSteps"
          :key="s.n"
          class="sl-step"
          :class="{ on: s.n === 5, done: s.n < 5 }"
        >
          <div class="dot">{{ s.n }}</div>{{ s.label }}
        </div>
      </div>
      <p class="sl-hint" style="margin-top:12px;">
        After choosing <strong>Use your voice</strong>, tap the microphone on each line. The wizard asks for type, description, quantity, and rate.
      </p>
      <CommonLineItemsTable :lines="sampleVoiceLines" title="Line items (example)" />
    </div>

    <!-- Photo upload zone -->
    <div v-else-if="preview === 'service-log-photos'" class="training-ui-sl">
      <div class="sl-progress" aria-label="Service log steps">
        <div
          v-for="s in serviceLogSteps"
          :key="s.n"
          class="sl-step"
          :class="{ on: s.n === 5, done: s.n < 5 }"
        >
          <div class="dot">{{ s.n }}</div>{{ s.label }}
        </div>
      </div>
      <p class="sl-hint" style="margin-top:12px;">
        Photograph the paper service log sheet only — the form where the mechanic wrote down the work.
      </p>
      <div class="sl-photo-zone training-ui-readonly">
        <div class="sl-photo-inner">
          <span class="ico" aria-hidden="true">📄</span>
          <b>Tap to photograph the sheet</b>
          <span>JPG, PNG · multiple pages OK</span>
        </div>
      </div>
    </div>

    <!-- Accurate status pills -->
    <div v-else-if="preview === 'service-log-status'" class="training-ui-status-list">
      <div v-for="status in logStatuses" :key="status" class="training-ui-status-row">
        <span :class="serviceLogStatusPill(status).cls">{{ serviceLogStatusPill(status).label }}</span>
        <span class="training-ui-status-code">{{ status }}</span>
      </div>
    </div>

    <!-- Customer search list -->
    <div v-else-if="preview === 'customer-search'" class="training-ui-list">
      <label class="fld">
        <span>Search</span>
        <input v-model="searchQuery" type="search" class="fld" placeholder="Customer, bus #, or unit tag">
      </label>
      <div
        v-for="row in sampleCustomers.filter(r =>
          !searchQuery
          || r.name.toLowerCase().includes(searchQuery.toLowerCase())
          || r.sub.toLowerCase().includes(searchQuery.toLowerCase()))"
        :key="row.name"
        class="card"
        style="padding:12px 14px;margin-top:8px;"
      >
        <b style="display:block;font-size:0.92rem;">{{ row.name }}</b>
        <span class="help" style="margin:4px 0 0;">{{ row.sub }}</span>
      </div>
    </div>

    <!-- Invoice wizard step bar -->
    <div v-else-if="preview === 'invoice-wizard'" class="training-ui-sl">
      <div class="sl-progress" aria-label="Invoice steps">
        <div
          v-for="s in INVOICE_WIZARD_STEPS"
          :key="s.n"
          class="sl-step"
          :class="{ on: s.n === 4, done: s.n < 4 }"
        >
          <div class="dot">{{ s.n }}</div>{{ s.label }}
        </div>
      </div>
      <p class="sl-hint" style="margin-top:12px;">
        Line items step — use catalog quick-add or type rows manually. Totals and tax exempt display update live.
      </p>
      <div class="card" style="padding:12px;">
        <div class="r" style="display:flex;justify-content:space-between;font-size:0.88rem;">
          <span class="help">Subtotal</span><span>$580.00</span>
        </div>
        <div class="r" style="display:flex;justify-content:space-between;font-size:0.88rem;margin-top:6px;">
          <span class="help">Tax</span><span>$0.00 <small class="help">tax exempt</small></span>
        </div>
      </div>
    </div>

    <!-- Assign training panel -->
    <div v-else-if="preview === 'assign-training'" class="training-assign-panel card" style="padding:14px;">
      <label class="fld">
        Module
        <select disabled>
          <option>Platform navigation</option>
        </select>
      </label>
      <label class="tglrow" style="margin:0;">
        Lock access until complete
        <span class="tgl"><input type="checkbox" checked disabled><span class="tr" /></span>
      </label>
      <p class="help" style="margin:0;">
        Found on <strong>Users → select person → Training</strong>. Locked users only see Training until the module is completed.
      </p>
    </div>

    <!-- Send the reviewed log to an invoice (the accountant hand-off) -->
    <div v-else-if="preview === 'send-to-invoice'" class="training-handoff">
      <div class="training-handoff-row card">
        <div>
          <b>SL-1042</b>
          <span class="help">Acme Fleet Services · Truck #HL-114</span>
        </div>
        <span :class="serviceLogStatusPill('in_review' as ServiceLogStatus).cls">
          {{ serviceLogStatusPill('in_review' as ServiceLogStatus).label }}
        </span>
      </div>
      <p class="training-handoff-arrow" aria-hidden="true">↓</p>
      <div class="training-handoff-row card">
        <div>
          <b>INV-000318</b>
          <span class="help">6 line items carried over from SL-1042</span>
        </div>
        <span :class="invoiceStatusPill('draft').cls">{{ invoiceStatusPill('draft').label }}</span>
      </div>
      <p class="help" style="margin:0;">
        Found on the service log detail page as <strong>Send to invoice</strong>.
      </p>
    </div>

    <!-- Server-computed totals, including waived tax for exempt customers -->
    <div v-else-if="preview === 'invoice-totals'" class="card" style="padding:14px;">
      <div class="ed-sums" style="width:100%;margin:0;padding:0;">
        <div class="row"><span>Parts</span><span>{{ moneyDisplay('212.40') }}</span></div>
        <div class="row"><span>Labor</span><span>{{ moneyDisplay('290.00') }}</span></div>
        <div class="row"><span>Fees</span><span>{{ moneyDisplay('17.58') }}</span></div>
        <div class="row"><span>Subtotal</span><span>{{ moneyDisplay('519.98') }}</span></div>
        <div class="row">
          <span>Tax<span class="sum-note">(tax exempt)</span></span>
          <span class="sum-strike">{{ moneyDisplay('41.60') }}</span>
        </div>
        <div class="row grand"><span>Balance due</span><span>{{ moneyDisplay('519.98') }}</span></div>
      </div>
      <p class="help" style="margin:10px 0 0;">
        Totals always recalculate from the line items — you never type a total.
      </p>
    </div>

    <!-- Sending emails the PDF and moves the invoice to Sent -->
    <div v-else-if="preview === 'invoice-send'" class="card" style="padding:14px;">
      <label class="fld">
        To
        <input type="text" value="billing@acmefleet.com" disabled>
      </label>
      <label class="fld">
        Attachment
        <input type="text" value="INV-000318.pdf" disabled>
      </label>
      <div style="display:flex;align-items:center;gap:10px;">
        <button type="button" class="btn primary sm" disabled>Send invoice</button>
        <span :class="invoiceStatusPill('sent').cls">{{ invoiceStatusPill('sent').label }}</span>
      </div>
    </div>

    <!-- What the customer sees in their portal -->
    <div v-else-if="preview === 'portal-invoice'" class="card" style="padding:14px;">
      <p class="help" style="margin:0 0 10px;">Signed in as <strong>Acme Fleet Services</strong></p>
      <div class="tscroll">
        <table class="tbl">
          <thead>
            <tr><th>Invoice</th><th>Vehicle</th><th class="num">Balance</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>INV-000318</td>
              <td>Truck #HL-114</td>
              <td class="num">{{ moneyDisplay('519.98') }}</td>
            </tr>
            <tr>
              <td>INV-000301</td>
              <td>Truck #HL-108</td>
              <td class="num">{{ moneyDisplay('0.00') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <button type="button" class="btn sm" style="margin-top:10px;" disabled>Request a correction</button>
    </div>

    <!-- The staff queue for anything a customer submits -->
    <div v-else-if="preview === 'portal-requests'" class="training-handoff">
      <div class="training-handoff-row card">
        <div>
          <b>Invoice correction · INV-000318</b>
          <span class="help">“Labor hours look high” — Acme Fleet Services</span>
        </div>
        <span class="pill warn">Pending</span>
      </div>
      <div class="training-handoff-row card">
        <div>
          <b>New vehicle · Unit HL-120</b>
          <span class="help">Requested by Acme Fleet Services</span>
        </div>
        <span class="pill warn">Pending</span>
      </div>
      <p class="help" style="margin:0;">
        Found under <strong>Portal Requests</strong>. Approving applies the change and notifies the customer.
      </p>
    </div>

    <p v-else class="help" style="margin:0;text-align:center;">
      UI preview for this step.
    </p>
  </div>
</template>
