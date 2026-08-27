// Plan → capabilities. The single place that decides what a subscription unlocks (T1). Pure, so it
// is shared by the FE (show/lock) and, later, backend enforcement. A TRIAL is plan PRO (S20), so a
// tenant in trial gets the full Pro entitlements automatically.

export type Plan = 'FREE' | 'PRO' | 'BUSINESS'

export interface Entitlements {
  /** Members the org may have, including the owner. */
  maxSeats: number
  /** Whether the org can invite members + assign roles (Pro+). */
  canInviteMembers: boolean
  /** Active events allowed; `null` = unlimited. */
  maxActiveEvents: number | null
  hasBrand: boolean
  hasAnnouncements: boolean
  hasPayments: boolean
  /** Business-only killer feature (sub-teams / multi-venue / SSO — scoped later). */
  hasBusinessFeatures: boolean
}

const TABLE: Record<Plan, Entitlements> = {
  FREE: { maxSeats: 1, canInviteMembers: false, maxActiveEvents: 1, hasBrand: false, hasAnnouncements: false, hasPayments: false, hasBusinessFeatures: false },
  PRO: { maxSeats: 5, canInviteMembers: true, maxActiveEvents: null, hasBrand: true, hasAnnouncements: true, hasPayments: true, hasBusinessFeatures: false },
  BUSINESS: { maxSeats: 20, canInviteMembers: true, maxActiveEvents: null, hasBrand: true, hasAnnouncements: true, hasPayments: true, hasBusinessFeatures: true },
}

/** Entitlements for a plan. Unknown/missing plan falls back to the most restrictive (FREE). */
export function entitlements(plan: Plan | string | undefined | null): Entitlements {
  return TABLE[(plan as Plan)] ?? TABLE.FREE
}

/** True when creating one more event would exceed the plan's active-event cap. */
export function atEventCap(plan: Plan | string | undefined | null, activeEvents: number): boolean {
  const max = entitlements(plan).maxActiveEvents
  return max !== null && activeEvents >= max
}
