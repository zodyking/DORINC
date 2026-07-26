<script setup lang="ts">
import StaffNavIcon from '~/components/staff/StaffNavIcon.vue'
import type { StaffNavIconName } from '~/components/staff/StaffNavIcon.vue'
import CommonLineItemsTable from '~/components/common/LineItemsTable.vue'
import { PHOTO_UPLOAD_PICK, VOICE_ENTRY_PICK } from '~/utils/entry-mode-labels'
import { INVOICE_WIZARD_STEPS } from '~/utils/invoice-creator-ui'
import { serviceLogStatusPill, type ServiceLogStatus } from '~/utils/service-logs-ui'
import { BRAND_ICON, BRAND_NAME } from '~/constants/brand'

const props = defineProps<{
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

    <p v-else class="help" style="margin:0;text-align:center;">
      UI preview for this step.
    </p>
  </div>
</template>
