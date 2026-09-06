// Plan → capabilities. The single place that decides what a subscription unlocks (T1). Pure, so it
// is shared by the FE (show/lock) and, later, backend enforcement. A TRIAL is plan CLUB (S20), so a
// tenant in trial gets the full Club entitlements automatically.
//
// Tiers: FREE (1 event, public bracket only) · STARTER (unlimited events + core tournament, no
// differentiators) · CLUB (adds payments, brand, event site, resources/post-match logistics) ·
// ENTERPRISE (Club + multi-society / SSO business features). The rare differentiators live in CLUB,
// which is what justifies its price step over STARTER.

export type Plan = 'FREE' | 'STARTER' | 'CLUB' | 'ENTERPRISE'

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
  /** Public event website (org site-defaults + per-event site) — Pro+. */
  hasEventSite: boolean
  /** Custom finals-format editor (org-scoped, reusable formats) — Pro+. */
  hasFinalsFormats: boolean
  /** Event resources & post-match logistics (docce, terzo tempo) — Pro+. */
  hasResources: boolean
  /** Business-only killer feature (sub-teams / multi-venue / SSO — scoped later). */
  hasBusinessFeatures: boolean
}

const TABLE: Record<Plan, Entitlements> = {
  FREE: { maxSeats: 1, canInviteMembers: false, maxActiveEvents: 1, hasBrand: false, hasAnnouncements: false, hasPayments: false, hasEventSite: false, hasFinalsFormats: false, hasResources: false, hasBusinessFeatures: false },
  // STARTER — core tournament: unlimited events, custom finals formats, basic announcements. The
  // differentiators (payments, brand, event site, post-match resources) stay off; they're the CLUB step-up.
  STARTER: { maxSeats: 3, canInviteMembers: true, maxActiveEvents: null, hasBrand: false, hasAnnouncements: true, hasPayments: false, hasEventSite: false, hasFinalsFormats: true, hasResources: false, hasBusinessFeatures: false },
  CLUB: { maxSeats: 5, canInviteMembers: true, maxActiveEvents: null, hasBrand: true, hasAnnouncements: true, hasPayments: true, hasEventSite: true, hasFinalsFormats: true, hasResources: true, hasBusinessFeatures: false },
  ENTERPRISE: { maxSeats: 20, canInviteMembers: true, maxActiveEvents: null, hasBrand: true, hasAnnouncements: true, hasPayments: true, hasEventSite: true, hasFinalsFormats: true, hasResources: true, hasBusinessFeatures: true },
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
