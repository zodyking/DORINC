import { describe, expect, it } from 'vitest'
import { mapVultrInstanceRow } from '../../server/services/vultr-billing.service'
import {
  formatVultrBandwidth,
  formatVultrFeatureList,
  formatVultrRam,
} from '../../app/utils/billing-ui'

describe('mapVultrInstanceRow', () => {
  it('maps extended Vultr instance fields from API payload', () => {
    const row = mapVultrInstanceRow({
      id: 'abc123',
      label: 'Production API',
      hostname: 'api.example.com',
      os: 'Ubuntu 22.04 LTS',
      region: 'ewr',
      plan: 'vc2-2c-4gb',
      vcpu_count: 2,
      ram: 4096,
      disk: 80,
      allowed_bandwidth: 4096,
      status: 'active',
      power_status: 'running',
      server_status: 'ok',
      main_ip: '203.0.113.10',
      v6_main_ip: '2001:db8::1',
      internal_ip: '10.1.0.4',
      gateway_v4: '203.0.113.1',
      date_created: '2024-06-01T12:00:00+00:00',
      features: ['ipv6', 'auto_backups'],
      tags: ['production', 'api'],
    })

    expect(row.label).toBe('Production API')
    expect(row.hostname).toBe('api.example.com')
    expect(row.os).toBe('Ubuntu 22.04 LTS')
    expect(row.vcpuCount).toBe(2)
    expect(row.ramMb).toBe(4096)
    expect(row.diskGb).toBe(80)
    expect(row.allowedBandwidthGb).toBe(4096)
    expect(row.powerStatus).toBe('running')
    expect(row.features).toEqual(['ipv6', 'auto_backups'])
    expect(row.tags).toEqual(['production', 'api'])
  })
})

describe('Vultr billing formatters', () => {
  it('formats RAM, bandwidth, and features for display', () => {
    expect(formatVultrRam(4096)).toBe('4 GB RAM')
    expect(formatVultrRam(512)).toBe('512 MB RAM')
    expect(formatVultrBandwidth(4096)).toBe('4 TB / month')
    expect(formatVultrFeatureList(['auto_backups', 'ipv6'])).toBe('Auto Backups, Ipv6')
  })
})
