<script setup lang="ts">
import type { SecurityPolicy } from '#shared/validators/security-access'

const props = defineProps<{
  policy: SecurityPolicy
  saving: boolean
  dirty: boolean
}>()

const emit = defineEmits<{
  'update': [patch: Partial<SecurityPolicy>]
  'save': []
  'reset': []
}>()

function set<K extends keyof SecurityPolicy>(key: K, value: SecurityPolicy[K]) {
  emit('update', { [key]: value } as Partial<SecurityPolicy>)
}

function setAutoBan<K extends keyof SecurityPolicy['autoBan']>(key: K, value: SecurityPolicy['autoBan'][K]) {
  emit('update', { autoBan: { ...props.policy.autoBan, [key]: value } })
}

const enforcementSummary = computed(() => {
  if (!props.policy.enabled) return 'Off — nothing is captured or blocked.'
  const parts: string[] = []
  if (props.policy.ipEnforcement === 'enforce') parts.push('IP bans blocking')
  else if (props.policy.ipEnforcement === 'monitor') parts.push('IP bans monitored')
  if (props.policy.geoEnforcement === 'enforce') parts.push('geofence blocking')
  else if (props.policy.geoEnforcement === 'monitor') parts.push('geofence monitored')
  if (!parts.length) return 'Capturing events only — nothing is being blocked.'
  return `Capturing events · ${parts.join(' · ')}.`
})
</script>

<template>
  <div class="card">
    <div class="chead">
      <h3>Policy</h3>
      <div class="right">
        <span class="pill" :class="policy.enabled ? 'warn' : 'gray'">{{ policy.enabled ? 'Enabled' : 'Off' }}</span>
      </div>
    </div>

    <div class="cbody sp-body">
      <p class="sp-summary">
        {{ enforcementSummary }}
        Super Admins are always exempt, so a rule can never lock you out of your own install.
      </p>

      <div class="tglrow sp-toggle">
        <div>
          <div class="sp-label">Enable security checks</div>
          <div class="sp-desc">
            Turns on visit and sign-in capture. Blocking still requires an enforcement level below.
          </div>
        </div>
        <span class="tgl">
          <input
            :checked="policy.enabled"
            type="checkbox"
            aria-label="Enable security checks"
            @change="set('enabled', ($event.target as HTMLInputElement).checked)"
          >
          <span class="tr" />
        </span>
      </div>

      <div class="sp-grid">
        <label class="fld">
          IP ban enforcement
          <select :value="policy.ipEnforcement" @change="set('ipEnforcement', ($event.target as HTMLSelectElement).value as SecurityPolicy['ipEnforcement'])">
            <option value="off">Off</option>
            <option value="monitor">Monitor — log matches, allow through</option>
            <option value="enforce">Enforce — block banned addresses</option>
          </select>
          <span class="help">Start on monitor to confirm the list is right before it denies anyone.</span>
        </label>

        <label class="fld">
          Geofence enforcement
          <select :value="policy.geoEnforcement" @change="set('geoEnforcement', ($event.target as HTMLSelectElement).value as SecurityPolicy['geoEnforcement'])">
            <option value="off">Off</option>
            <option value="monitor">Monitor — log matches, allow through</option>
            <option value="enforce">Enforce — block outside allowed zones</option>
          </select>
          <span class="help">Only applies while at least one zone is enabled.</span>
        </label>

        <label class="fld">
          When location cannot be determined
          <select :value="policy.geoUnknownAction" @change="set('geoUnknownAction', ($event.target as HTMLSelectElement).value as SecurityPolicy['geoUnknownAction'])">
            <option value="allow">Allow (recommended)</option>
            <option value="block">Block</option>
          </select>
          <span class="help">Blocking here also denies anyone whose address no lookup provider recognises.</span>
        </label>

        <label class="fld">
          Boundary tolerance (metres)
          <input
            :value="policy.geoAccuracyBufferM"
            type="number"
            min="0"
            max="50000"
            @change="set('geoAccuracyBufferM', Number(($event.target as HTMLInputElement).value))"
          >
          <span class="help">Added to the device's reported GPS accuracy before deciding "outside".</span>
        </label>

        <label class="fld">
          Ignore device location less accurate than (metres)
          <input
            :value="policy.maxDeviceAccuracyM"
            type="number"
            min="0"
            max="200000"
            @change="set('maxDeviceAccuracyM', Number(($event.target as HTMLInputElement).value))"
          >
        </label>

        <label class="fld">
          Keep events for (days)
          <input
            :value="policy.retentionDays"
            type="number"
            min="1"
            max="3650"
            @change="set('retentionDays', Number(($event.target as HTMLInputElement).value))"
          >
        </label>

        <label class="fld">
          Redirect blocked visitors to
          <input
            :value="policy.redirectUrl"
            type="url"
            placeholder="Leave empty for the built-in denied screen"
            @change="set('redirectUrl', ($event.target as HTMLInputElement).value)"
          >
        </label>

        <label class="fld">
          Message shown when blocked
          <input
            :value="policy.blockMessage"
            type="text"
            maxlength="500"
            @change="set('blockMessage', ($event.target as HTMLInputElement).value)"
          >
        </label>
      </div>

      <div class="tglrow sp-toggle">
        <div>
          <div class="sp-label">Enforce IP bans on API requests</div>
          <div class="sp-desc">Blocks a banned address at the API as well as page loads.</div>
        </div>
        <span class="tgl">
          <input
            :checked="policy.enforceOnApi"
            type="checkbox"
            aria-label="Enforce IP bans on API requests"
            @change="set('enforceOnApi', ($event.target as HTMLInputElement).checked)"
          >
          <span class="tr" />
        </span>
      </div>

      <div class="tglrow sp-toggle">
        <div>
          <div class="sp-label">Record attempted credentials</div>
          <div class="sp-desc">
            Stores the username tried on every rejected sign-in, plus the password's length and a keyed
            fingerprint so repeat attempts can be correlated. The password itself is never stored.
          </div>
        </div>
        <span class="tgl">
          <input
            :checked="policy.recordCredentials"
            type="checkbox"
            aria-label="Record attempted credentials"
            @change="set('recordCredentials', ($event.target as HTMLInputElement).checked)"
          >
          <span class="tr" />
        </span>
      </div>

      <div class="tglrow sp-toggle">
        <div>
          <div class="sp-label">Automatically ban repeat offenders</div>
          <div class="sp-desc">Bans an address after too many failed sign-ins in a short window.</div>
        </div>
        <span class="tgl">
          <input
            :checked="policy.autoBan.enabled"
            type="checkbox"
            aria-label="Automatically ban repeat offenders"
            @change="setAutoBan('enabled', ($event.target as HTMLInputElement).checked)"
          >
          <span class="tr" />
        </span>
      </div>

      <div v-if="policy.autoBan.enabled" class="sp-grid sp-grid--nested">
        <label class="fld">
          Failed attempts
          <input
            :value="policy.autoBan.failedAttempts"
            type="number"
            min="3"
            max="500"
            @change="setAutoBan('failedAttempts', Number(($event.target as HTMLInputElement).value))"
          >
        </label>
        <label class="fld">
          Within (minutes)
          <input
            :value="policy.autoBan.windowMinutes"
            type="number"
            min="1"
            max="1440"
            @change="setAutoBan('windowMinutes', Number(($event.target as HTMLInputElement).value))"
          >
        </label>
        <label class="fld">
          Ban lasts (minutes, 0 = permanent)
          <input
            :value="policy.autoBan.durationMinutes"
            type="number"
            min="0"
            max="525600"
            @change="setAutoBan('durationMinutes', Number(($event.target as HTMLInputElement).value))"
          >
        </label>
      </div>

      <div class="sp-actions">
        <button type="button" class="btn primary" :disabled="saving || !dirty" @click="emit('save')">
          {{ saving ? 'Saving…' : 'Save policy' }}
        </button>
        <button type="button" class="btn" :disabled="saving || !dirty" @click="emit('reset')">
          Discard changes
        </button>
        <span v-if="dirty" class="sp-dirty">Unsaved changes</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sp-body { display: flex; flex-direction: column; gap: 4px; }
.sp-summary { margin: 0 0 8px; font-size: 13px; line-height: 1.55; color: #475569; }
.sp-toggle { align-items: flex-start; }
.sp-label { font-size: 13.5px; font-weight: 600; color: #0f172a; }
.sp-desc { margin-top: 2px; font-size: 12.5px; color: #64748b; line-height: 1.45; max-width: 62ch; }
.sp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 4px 14px; margin-top: 14px; }
.sp-grid--nested {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 14px 14px 0;
  margin-top: 4px;
}
.sp-actions { display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.sp-dirty { font-size: 12.5px; color: #d97706; font-weight: 600; }
</style>
