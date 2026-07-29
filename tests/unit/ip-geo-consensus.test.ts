import { describe, expect, it } from 'vitest'
import { pickConsensusGeo } from '../../server/services/ip-geolocation.service'

describe('pickConsensusGeo', () => {
  it('averages providers that agree within the consensus radius', () => {
    const result = pickConsensusGeo([
      {
        source: 'ip-api',
        label: 'Philadelphia, PA',
        latitude: 39.95,
        longitude: -75.16,
        country: 'United States',
        weight: 3,
      },
      {
        source: 'ipapi.co',
        label: 'Philadelphia, PA',
        latitude: 39.96,
        longitude: -75.15,
        country: 'United States',
        weight: 4,
      },
    ])
    expect(result).not.toBeNull()
    expect(result!.latitude).toBeGreaterThan(39.94)
    expect(result!.latitude).toBeLessThan(39.97)
    expect(result!.sources).toEqual(expect.arrayContaining(['ip-api', 'ipapi.co']))
  })

  it('prefers a high-weight Cloudflare point when APIs disagree widely', () => {
    const result = pickConsensusGeo([
      {
        source: 'cloudflare',
        label: 'Cinnaminson, NJ',
        latitude: 40.0,
        longitude: -74.95,
        country: 'US',
        weight: 6,
      },
      {
        source: 'ip-api',
        label: 'Philadelphia, PA',
        latitude: 39.95,
        longitude: -75.25,
        country: 'United States',
        mobile: true,
        weight: 2,
      },
    ])
    expect(result?.sources).toEqual(['cloudflare'])
    expect(result?.latitude).toBeCloseTo(40.0, 2)
    expect(result?.longitude).toBeCloseTo(-74.95, 2)
  })
})
