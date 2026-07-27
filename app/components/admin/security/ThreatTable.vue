<script setup lang="ts">
import type { SecurityThreat } from '~/utils/security-center'
import { failureReasonLabel, formatRelative, shortUserAgent } from '~/utils/security-center'

defineProps<{
  threats: SecurityThreat[]
  loading: boolean
  windowHours: number
}>()

const emit = defineEmits<{
  'ban-ip': [ip: string]
  'update:window-hours': [hours: number]
  'refresh': []
}>()

/** One password across many attempts is stuffing; many is a spray. */
function patternLabel(threat: SecurityThreat): string {
  if (threat.attempts < 2) return 'Single attempt'
  if (threat.repeatedSamePassword) return 'Same password repeated'
  if (threat.distinctPasswords >= threat.attempts) return 'Different password each time'
  return `${threat.distinctPasswords} passwords tried`
}

function severityClass(threat: SecurityThreat): string {
  if (threat.successfulLogins > 0 && threat.failedAttempts >= 3) return 'over'
  if (threat.failedAttempts >= 10) return 'over'
  if (threat.failedAttempts >= 3) return 'warn'
  return 'gray'
}
</script>

<template>
  <div class="card">
    <div class="chead">
      <h3>Repeated sign-in attempts</h3>
      <div class="right">
        <select
          class="st-window"
          :value="windowHours"
          aria-label="Time window"
          @change="emit('update:window-hours', Number(($event.target as HTMLSelectElement).value))"
        >
          <option :value="24">Last 24 hours</option>
          <option :value="168">Last 7 days</option>
          <option :value="720">Last 30 days</option>
        </select>
        <button type="button" class="btn sm" :disabled="loading" @click="emit('refresh')">
          {{ loading ? '…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="threats.length" class="tscroll">
      <table class="tbl">
        <thead>
          <tr>
            <th>Source</th>
            <th>Username tried</th>
            <th class="num">Attempts</th>
            <th class="num">Failed</th>
            <th>Pattern</th>
            <th>Result</th>
            <th>Last seen</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="threat in threats" :key="threat.key">
            <td>
              <span class="lead mono">{{ threat.ipAddress || 'unknown' }}</span>
              <span class="sub">{{ threat.locationLabel || threat.country || 'Location unknown' }}</span>
            </td>
            <td>
              <span class="mono">{{ threat.attemptedIdentifier || '—' }}</span>
              <span class="sub">
                {{ threat.accountExists ? 'Real account' : 'No such account' }}
                <span v-if="threat.portals.length"> · {{ threat.portals.join(', ') }}</span>
              </span>
            </td>
            <td class="num">{{ threat.attempts }}</td>
            <td class="num">
              <span class="pill" :class="severityClass(threat)">{{ threat.failedAttempts }}</span>
            </td>
            <td>
              <span>{{ patternLabel(threat) }}</span>
              <span class="sub">{{ shortUserAgent(threat.userAgent) }}</span>
            </td>
            <td>
              <span v-if="threat.successfulLogins" class="pill over">{{ threat.successfulLogins }} succeeded</span>
              <span v-else-if="threat.blockedAttempts" class="pill warn">{{ threat.blockedAttempts }} blocked</span>
              <span v-else class="pill gray">All rejected</span>
              <span v-if="threat.failureReasons.length" class="sub">
                {{ threat.failureReasons.map(failureReasonLabel).join(', ') }}
              </span>
            </td>
            <td>
              <span class="mono st-time">{{ formatRelative(threat.lastSeenAt) }}</span>
              <span class="sub">first {{ formatRelative(threat.firstSeenAt) }}</span>
            </td>
            <td class="st-rowactions">
              <span v-if="threat.alreadyBanned" class="pill over">Banned</span>
              <button
                v-else-if="threat.ipAddress"
                type="button"
                class="btn sm danger"
                @click="emit('ban-ip', threat.ipAddress)"
              >
                Ban IP
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="cbody st-empty">
      No repeated sign-in attempts in this window.
    </p>
  </div>
</template>

<style scoped>
.st-window { border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 8px; font-size: 12.5px; background: #fff; }
.st-time { font-size: 12px; }
.st-rowactions { white-space: nowrap; }
.st-empty { font-size: 13px; color: #64748b; margin: 0; }
</style>
