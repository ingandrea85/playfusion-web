import { beforeEach, describe, expect, it } from 'vitest'
import {
  resetDemo, listMembers, listInvitations, inviteMember, acceptInvitation, revokeInvitation,
  changeMemberRole, removeMember, isLastOwner, actAs, currentUser, currentRole, getSession,
} from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('seed members', () => {
  it('org-1 ships an owner, an organizer and a director', () => {
    const roles = listMembers('org-1').map(m => m.role).sort()
    expect(roles).toEqual(['DIRECTOR', 'ORGANIZER', 'OWNER'])
  })
  it('currentRole defaults to OWNER with no session', () => {
    expect(getSession()).toBeNull()
    expect(currentUser()).toBeNull()
    expect(currentRole()).toBe('OWNER')
  })
})

describe('invite lifecycle', () => {
  it('inviteMember creates a PENDING invitation', () => {
    const inv = inviteMember('org-1', { name: 'Giulia P.', email: 'giulia@ex.it', role: 'ORGANIZER' })
    expect(inv.status).toBe('PENDING')
    expect(listInvitations('org-1').some(i => i.id === inv.id)).toBe(true)
  })
  it('acceptInvitation creates the member and marks the invite ACCEPTED', () => {
    const before = listMembers('org-1').length
    const inv = inviteMember('org-1', { name: 'Nuovo M.', email: 'nuovo@ex.it', role: 'DIRECTOR' })
    const user = acceptInvitation(inv.id)!
    expect(user.role).toBe('DIRECTOR')
    expect(user.organizationId).toBe('org-1')
    expect(listMembers('org-1').length).toBe(before + 1)
    expect(listInvitations('org-1').find(i => i.id === inv.id)!.status).toBe('ACCEPTED')
  })
  it('acceptInvitation is idempotent (a second accept is a no-op)', () => {
    const inv = inviteMember('org-1', { name: 'X', email: 'x@ex.it', role: 'ORGANIZER' })
    acceptInvitation(inv.id)
    const before = listMembers('org-1').length
    expect(acceptInvitation(inv.id)).toBeNull()
    expect(listMembers('org-1').length).toBe(before)
  })
  it('revokeInvitation drops the pending invite', () => {
    const inv = inviteMember('org-1', { name: 'Y', email: 'y@ex.it', role: 'ORGANIZER' })
    revokeInvitation(inv.id)
    expect(listInvitations('org-1').some(i => i.id === inv.id)).toBe(false)
  })
})

describe('last-owner invariant', () => {
  it('cannot demote or remove the only owner', () => {
    const owner = listMembers('org-1').find(m => m.role === 'OWNER')!
    expect(isLastOwner('org-1', owner.id)).toBe(true)
    expect(changeMemberRole(owner.id, 'ORGANIZER')).toBe(false)
    expect(removeMember(owner.id)).toBe(false)
    expect(listMembers('org-1').find(m => m.id === owner.id)!.role).toBe('OWNER')
  })
  it('allows demotion once a second owner exists', () => {
    const owner = listMembers('org-1').find(m => m.role === 'OWNER')!
    const organizer = listMembers('org-1').find(m => m.role === 'ORGANIZER')!
    expect(changeMemberRole(organizer.id, 'OWNER')).toBe(true)   // now two owners
    expect(isLastOwner('org-1', owner.id)).toBe(false)
    expect(changeMemberRole(owner.id, 'ORGANIZER')).toBe(true)   // demoting the first is fine now
  })
  it('removing a non-owner works', () => {
    const director = listMembers('org-1').find(m => m.role === 'DIRECTOR')!
    expect(removeMember(director.id)).toBe(true)
    expect(listMembers('org-1').some(m => m.id === director.id)).toBe(false)
  })
})

describe('actAs', () => {
  it('sets the session to the chosen member and drives currentRole', () => {
    const director = listMembers('org-1').find(m => m.role === 'DIRECTOR')!
    actAs(director.id)
    expect(getSession()!.userId).toBe(director.id)
    expect(currentRole()).toBe('DIRECTOR')
  })
})
