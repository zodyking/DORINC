import { z } from 'zod'

/** Browser/device signals posted with every security visit beacon. */
export const deviceSignalsSchema = z.object({
  userAgent: z.string().trim().max(500).nullable().optional(),
  os: z.string().trim().max(120).nullable().optional(),
  deviceType: z.enum(['mobile', 'tablet', 'desktop', 'unknown']).nullable().optional(),
  screenResolution: z.string().trim().max(40).nullable().optional(),
  devicePixelRatio: z.number().finite().min(0).max(64).nullable().optional(),
  cpuCores: z.number().int().min(0).max(1024).nullable().optional(),
  deviceMemoryGb: z.number().finite().min(0).max(1024).nullable().optional(),
  gpuRenderer: z.string().trim().max(300).nullable().optional(),
  canvasFingerprint: z.string().trim().max(128).nullable().optional(),
  webglFingerprint: z.string().trim().max(128).nullable().optional(),
  audioFingerprint: z.string().trim().max(128).nullable().optional(),
  timezone: z.string().trim().max(80).nullable().optional(),
  language: z.string().trim().max(80).nullable().optional(),
  maxTouchPoints: z.number().int().min(0).max(64).nullable().optional(),
  deviceId: z.string().trim().max(64).nullable().optional(),
})

export type DeviceSignals = z.infer<typeof deviceSignalsSchema>

export const visitBeaconBodySchema = z.object({
  path: z.string().trim().min(1).max(2000),
  signals: deviceSignalsSchema.default({}),
})

export type VisitBeaconBody = z.infer<typeof visitBeaconBodySchema>
