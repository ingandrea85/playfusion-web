import type { OrgRole } from './types'

// Per-tenant role model. Pure functions — no DOM, no store — so they are unit-testable
// in isolation and shared by the shell (tab filtering) and page guards.

export type TabKey = 'overview' | 'enroll' | 'calendar' | 'standings' | 'bracket' | 'announcements' | 'resources' | 'settings'

const ALL_TABS: TabKey[] = ['overview', 'enroll', 'calendar', 'standings', 'bracket', 'announcements', 'resources', 'settings']
const DIRECTOR_TABS: TabKey[] = ['calendar', 'standings', 'bracket']

// Tabs a role may see in the organizer workspace. DIRECTOR is results-only.
export function allowedTabs(role: OrgRole): TabKey[] {
  return role === 'DIRECTOR' ? DIRECTOR_TABS : ALL_TABS
}

export function canSeeTab(role: OrgRole, key: TabKey): boolean {
  return allowedTabs(role).includes(key)
}

// Owner-only areas.
export function canManageMembers(role: OrgRole): boolean { return role === 'OWNER' }
export function canEditBilling(role: OrgRole): boolean { return role === 'OWNER' }   // subscription + brand

// Setup / registration / announcements / reschedule — everyone except the director.
export function canOperateSetup(role: OrgRole): boolean { return role !== 'DIRECTOR' }

// Recording match/final results is allowed for every role (it is the director's whole job).
export function canRecordResults(_role: OrgRole): boolean { return true }

export function roleLabel(role: OrgRole): string {
  return { OWNER: 'Owner', ORGANIZER: 'Organizer', DIRECTOR: 'Director' }[role]
}
