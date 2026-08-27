// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import type { Invitation, Member } from '@playfusion/rest-client'
import { renderMembers, lastOwnerId, membersScreen, type MembersData } from '../src/views/members'

const member = (memberId: string, role: Member['role']): Member => ({ memberId, organizationId: 'org-1', name: memberId, email: `${memberId}@x.io`, role, createdAt: 't' })
const inv: Invitation = { invitationId: 'i1', organizationId: 'org-1', name: 'Giulia', email: 'g@x.io', role: 'ORGANIZER', status: 'PENDING', createdAt: 't' }
const data = (over: Partial<MembersData> = {}): MembersData => ({ members: [], invitations: [], ...over })

describe('lastOwnerId', () => {
  it('is the sole owner, else null', () => {
    expect(lastOwnerId([member('a', 'OWNER'), member('b', 'ORGANIZER')])).toBe('a')
    expect(lastOwnerId([member('a', 'OWNER'), member('b', 'OWNER')])).toBeNull()
  })
})

describe('renderMembers', () => {
  it('lists members with role badges and controls; empty invite section when none pending', () => {
    const html = renderMembers(data({ members: [member('a', 'OWNER'), member('b', 'ORGANIZER')] }))
    expect(html).toContain('Membri attivi')
    expect(html).toContain('pf-role--owner')
    expect(html).toContain('pf-role--organizer')
    expect(html).toContain('data-remove="b"')
    expect(html).not.toContain('Inviti in sospeso')
  })
  it('locks the sole owner row (no role change / removal)', () => {
    const html = renderMembers(data({ members: [member('a', 'OWNER')] }))
    // the select + remove for the sole owner are disabled
    expect(html).toMatch(/data-id="a"[^>]*disabled/)
    expect(html).toMatch(/data-remove="a"[^>]*disabled/)
  })
  it('shows pending invitations with revoke (no simulate-accept; Auth0 hosts acceptance)', () => {
    const html = renderMembers(data({ members: [member('a', 'OWNER')], invitations: [inv] }))
    expect(html).toContain('Inviti in sospeso')
    expect(html).not.toContain('data-accept')
    expect(html).toContain('data-revoke="i1"')
  })
})

describe('members mount', () => {
  const mountWith = (over: Partial<MembersData> = {}) => {
    const o2 = {
      inviteMember: vi.fn().mockResolvedValue({}),
      revokeInvitation: vi.fn().mockResolvedValue(undefined),
      changeMemberRole: vi.fn().mockResolvedValue({}),
      removeMember: vi.fn().mockResolvedValue(undefined),
    }
    const refresh = vi.fn()
    const ctx = { client: { o2 } as any, orgId: 'org-1', e3BaseUrl: '', navigate: () => {}, refresh }
    const d = data(over)
    const root = document.createElement('div'); root.innerHTML = renderMembers(d)
    membersScreen.mount!(root, ctx as any, d)
    return { root, o2, refresh }
  }

  it('invite sends the form and refreshes', async () => {
    const { root, o2 } = mountWith()
    ;(root.querySelector('#i-name') as HTMLInputElement).value = 'Marco'
    ;(root.querySelector('#i-email') as HTMLInputElement).value = 'm@x.io'
    ;(root.querySelector('#i-role') as HTMLSelectElement).value = 'ORGANIZER'
    root.querySelector<HTMLButtonElement>('#i-invite')!.click()
    await vi.waitFor(() => expect(o2.inviteMember).toHaveBeenCalledWith('org-1', { name: 'Marco', email: 'm@x.io', role: 'ORGANIZER' }))
  })

  it('changing a member role calls the org-scoped API', async () => {
    const { root, o2 } = mountWith({ members: [member('a', 'OWNER'), member('b', 'ORGANIZER')] })
    const sel = root.querySelector<HTMLSelectElement>('.js-role[data-id="b"]')!
    sel.value = 'OWNER'; sel.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(o2.changeMemberRole).toHaveBeenCalledWith('org-1', 'b', 'OWNER'))
  })

  it('invite is blocked with empty fields', () => {
    const { root, o2 } = mountWith()
    root.querySelector<HTMLButtonElement>('#i-invite')!.click()
    expect(o2.inviteMember).not.toHaveBeenCalled()
  })
})
