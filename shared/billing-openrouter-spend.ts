/**
 * Monthly AI spend for billing totals.
 * OpenRouter /key often returns usage_monthly: 0 for limited keys even when
 * local ai_usage_logs have real costs — take the larger of provider vs internal.
 */
export function resolveOpenRouterMonthlySpend(
  usageMonthly: number | null | undefined,
  internalMonthlyUsd: number | null | undefined,
): number {
  const provider = Number(usageMonthly)
  const internal = Number(internalMonthlyUsd)
  const providerOk = Number.isFinite(provider) ? Math.max(0, provider) : 0
  const internalOk = Number.isFinite(internal) ? Math.max(0, internal) : 0
  return Math.max(providerOk, internalOk)
}
