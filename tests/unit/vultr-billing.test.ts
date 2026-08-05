import { describe, expect, it } from 'vitest'
import {
  attachVultrInstancePlanCosts,
  buildVultrPlanPriceMap,
  mapVultrInstanceRow,
  mapVultrPlanPriceRow,
  sumVultrMonthlyPlanCost,
} from '../../server/services/vultr-billing.service'
import {
  formatVultrBandwidth,
  formatVultrFeatureList,
  formatVultrMonthlyCost,
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

describe('Vultr plan pricing helpers', () => {
  it('maps plan prices and attaches monthly cost to instances', () => {
    const plan = mapVultrPlanPriceRow({ id: 'vc2-2c-4gb', monthly_cost: 20 })
    expect(plan).toEqual({ id: 'vc2-2c-4gb', monthlyCost: 20 })

    const prices = buildVultrPlanPriceMap([plan!])
    const instance = mapVultrInstanceRow({ id: '1', label: 'Web', plan: 'vc2-2c-4gb' })
    const enriched = attachVultrInstancePlanCosts([instance], prices)

    expect(enriched[0]?.monthlyPlanCost).toBe(20)
    expect(sumVultrMonthlyPlanCost(enriched)).toBe(20)
  })
})

describe('Vultr billing formatters', () => {
  it('formats RAM, bandwidth, features, and monthly cost for display', () => {
    expect(formatVultrRam(4096)).toBe('4 GB RAM')
    expect(formatVultrRam(512)).toBe('512 MB RAM')
    expect(formatVultrBandwidth(4096)).toBe('4 TB / month')
    expect(formatVultrFeatureList(['auto_backups', 'ipv6'])).toBe('Auto Backups, Ipv6')
    expect(formatVultrMonthlyCost(20)).toBe('$20.00/month')
  })
})
