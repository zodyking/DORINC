<script setup lang="ts">
import type { SecurityEvent } from '~/utils/security-center'
import {
  blockReasonLabel,
  failureReasonLabel,
  formatWhen,
  geoSourceLabel,
  outcomeLabel,
  outcomePillClass,
  passwordSummary,
  shortUserAgent,
} from '~/utils/security-center'

defineProps<{
  events: SecurityEvent[]
  total: number
  loading: boolean
}>()

const emit = defineEmits<{
  'ban-ip': [ip: string]
}>()

const expandedId = ref<string | null>(null)

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}
</script>

<template>
  <div class="card">
    <div class="chead">
      <h3>Access events</h3>
      <div class="right">
        <span class="pill gray">{{ total }} matching</span>
      </div>
    </div>

    <div v-if="events.length" class="tscroll">
      <table class="tbl">
        <thead>
          <tr>
            <th>When</th>
            <th>Outcome</th>
            <th>IP</th>
            <th>Location</th>
            <th>Account / credentials tried</th>
            <th>Where</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <template v-for="event in events" :key="event.id">
            <tr class="click" @click="toggle(event.id)">
              <td>
                <span class="mono se-time">{{ formatWhen(event.createdAt) }}</span>
                <span class="sub">{{ event.eventType === 'login' ? 'Sign-in' : 'Visit' }}</span>
              </td>
              <td>
                <span class="pill" :class="outcomePillClass(event.outcome)">{{ outcomeLabel(event.outcome) }}</span>
                <span v-if="event.blockReason" class="sub">{{ blockReasonLabel(event.blockReason) }}</span>
                <span v-else-if="event.failureReason" class="sub">{{ failureReasonLabel(event.failureReason) }}</span>
              </td>
              <td><span class="mono se-time">{{ event.ipAddress || '—' }}</span></td>
              <td>
                <span>{{ event.locationLabel || '—' }}</span>
                <span class="sub">{{ geoSourceLabel(event.geoSource) }}</span>
              </td>
              <td>
                <span class="lead">{{ event.userName || event.attemptedIdentifier || '—' }}</span>
                <span v-if="event.eventType === 'login'" class="sub">{{ passwordSummary(event) }}</span>
                <span v-else-if="event.userEmail" class="sub">{{ event.userEmail }}</span>
              </td>
              <td><span class="mono se-time">{{ event.path || '—' }}</span></td>
              <td class="se-rowactions" @click.stop>
                <button
                  v-if="event.ipAddress"
                  type="button"
                  class="btn sm danger"
                  @click="emit('ban-ip', event.ipAddress)"
                >
                  Ban IP
                </button>
              </td>
            </tr>
            <tr v-if="expandedId === event.id" class="se-detailrow">
              <td colspan="7">
                <dl class="se-detail">
                  <dt>Stage</dt>
                  <dd>{{ event.stage.replace('_', ' ') }}{{ event.enforced ? ' · enforced' : '' }}</dd>
                  <dt>Username tried</dt>
                  <dd class="mono">
                    {{ event.attemptedIdentifier || '—' }}
                    <span v-if="event.accountExists === false"> (no such account)</span>
                    <span v-else-if="event.accountExists === true"> (account exists)</span>
                  </dd>
                  <dt>Password</dt>
                  <dd class="mono">
                    {{ passwordSummary(event) }}
                    <span class="se-note">Only a keyed fingerprint is stored, never the password.</span>
                  </dd>
                  <dt>Portal</dt>
                  <dd>{{ event.attemptedPortal || '—' }}</dd>
                  <dt>Coordinates</dt>
                  <dd class="mono">
                    <span v-if="event.latitude != null && event.longitude != null">
                      {{ event.latitude.toFixed(4) }}, {{ event.longitude.toFixed(4) }}
                      <span v-if="event.accuracyM != null"> ±{{ Math.round(event.accuracyM) }}m</span>
                    </span>
                    <span v-else>Not resolved</span>
                  </dd>
                  <dt>Matched rule</dt>
                  <dd>
                    <span v-if="event.matchedIpRule" class="mono">{{ event.matchedIpRule }}</span>
                    <span v-else-if="event.matchedGeofenceName">{{ event.matchedGeofenceName }}</span>
                    <span v-else>—</span>
                  </dd>
                  <dt>Device</dt>
                  <dd>{{ shortUserAgent(event.userAgent) }}</dd>
                  <dt>Timezone</dt>
                  <dd>{{ event.timezone || '—' }}</dd>
                </dl>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <p v-else class="cbody se-empty">
      No events match these filters yet.
    </p>
  </div>
</template>

<style scoped>
.se-time { font-size: 12px; }
.se-rowactions { white-space: nowrap; }
.se-detailrow td { background: #fafbfe; }
.se-detail { display: grid; grid-template-columns: 160px 1fr; gap: 6px 14px; margin: 0; }
.se-detail dt { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; }
.se-detail dd { margin: 0; font-size: 13px; color: #334155; }
.se-note { display: block; font-size: 11.5px; color: #94a3b8; font-family: system-ui, sans-serif; }
.se-empty { font-size: 13px; color: #64748b; margin: 0; }
@media (max-width: 900px) {
  .se-detail { grid-template-columns: 1fr; }
}
</style>
