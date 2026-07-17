import type { PlanKey } from './types'

export const PLANS: Array<{ key: PlanKey; label: string; priceMonthly: number }> = [
  { key: 'FREE', label: 'Free', priceMonthly: 0 },
  { key: 'PRO', label: 'Pro', priceMonthly: 19 },
  { key: 'BUSINESS', label: 'Business', priceMonthly: 29 },
]
export function planLabel(key: PlanKey): string { return PLANS.find(p => p.key === key)?.label ?? key }
export function planPrice(key: PlanKey): number { return PLANS.find(p => p.key === key)?.priceMonthly ?? 0 }
