import { useDb } from '../../db/client'
import { isBootstrapped } from '../../services/setup.service'

export default defineEventHandler(async () => {
  const bootstrapped = await isBootstrapped(useDb())
  return { needsBootstrap: !bootstrapped }
})
