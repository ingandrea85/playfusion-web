import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getOrganizations, getOrganization, setOrgStatus, setOrgModule, getEvents } from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('organizations', () => {
  it('seeds four organizations with statuses and modules', () => {
    expect(getOrganizations()).toHaveLength(4)
    expect(getOrganization('org-3')?.status).toBe('SUSPENDED')
    expect(getOrganization('org-1')?.modules).toContain('M-Payments')
  })

  it('setOrgStatus toggles the tenant status', () => {
    setOrgStatus('org-3', 'ACTIVE')
    expect(getOrganization('org-3')?.status).toBe('ACTIVE')
  })

  it('setOrgModule adds/removes a module but never touches M-Core', () => {
    setOrgModule('org-2', 'M-Broadcast', true)
    expect(getOrganization('org-2')?.modules).toContain('M-Broadcast')
    setOrgModule('org-2', 'M-Broadcast', false)
    expect(getOrganization('org-2')?.modules).not.toContain('M-Broadcast')
    setOrgModule('org-2', 'M-Core', false)
    expect(getOrganization('org-2')?.modules).toContain('M-Core')
  })

  it('the seed event belongs to org-1 (others have no events)', () => {
    expect(getEvents().filter(e => e.organizationId === 'org-1')).toHaveLength(1)
    expect(getEvents().filter(e => e.organizationId === 'org-2')).toHaveLength(0)
  })
})
