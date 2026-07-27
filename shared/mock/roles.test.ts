import { describe, expect, it } from 'vitest'
import { allowedTabs, canSeeTab, canManageMembers, canEditBilling, canOperateSetup, canRecordResults, roleLabel } from './roles'

describe('allowedTabs', () => {
  it('owner and organizer see every tab', () => {
    expect(allowedTabs('OWNER')).toHaveLength(8)
    expect(allowedTabs('ORGANIZER')).toHaveLength(8)
    expect(allowedTabs('OWNER')).toContain('settings')
    expect(allowedTabs('OWNER')).toContain('resources')
    expect(allowedTabs('DIRECTOR')).not.toContain('resources')
  })
  it('director is results-only: calendar/standings/bracket', () => {
    expect(allowedTabs('DIRECTOR')).toEqual(['calendar', 'standings', 'bracket'])
    expect(canSeeTab('DIRECTOR', 'settings')).toBe(false)
    expect(canSeeTab('DIRECTOR', 'enroll')).toBe(false)
    expect(canSeeTab('DIRECTOR', 'calendar')).toBe(true)
  })
})

describe('owner-only areas', () => {
  it('only the owner manages members and billing/brand', () => {
    expect(canManageMembers('OWNER')).toBe(true)
    expect(canManageMembers('ORGANIZER')).toBe(false)
    expect(canManageMembers('DIRECTOR')).toBe(false)
    expect(canEditBilling('OWNER')).toBe(true)
    expect(canEditBilling('ORGANIZER')).toBe(false)
  })
})

describe('setup vs results', () => {
  it('everyone but the director can operate setup', () => {
    expect(canOperateSetup('OWNER')).toBe(true)
    expect(canOperateSetup('ORGANIZER')).toBe(true)
    expect(canOperateSetup('DIRECTOR')).toBe(false)
  })
  it('every role can record results', () => {
    expect(canRecordResults('DIRECTOR')).toBe(true)
    expect(canRecordResults('ORGANIZER')).toBe(true)
  })
})

describe('roleLabel', () => {
  it('renders human labels', () => {
    expect(roleLabel('OWNER')).toBe('Owner')
    expect(roleLabel('DIRECTOR')).toBe('Director')
  })
})
