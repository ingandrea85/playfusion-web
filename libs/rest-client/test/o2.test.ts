import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'

const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
const member = { memberId: 'm1', organizationId: 'org-pilot', name: 'Marco', email: 'm@x.io', role: 'ORGANIZER', createdAt: 't' }
const inv = { invitationId: 'i1', organizationId: 'org-pilot', name: 'Giulia', email: 'g@x.io', role: 'ORGANIZER', status: 'PENDING', createdAt: 't' }

describe('o2 membership api (T3 — Auth0 Organizations, org-scoped)', () => {
  it('listMembers / listInvitations GET the org collections', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(res([member])).mockResolvedValueOnce(res([inv]))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    expect((await c.o2.listMembers('org-pilot'))[0].memberId).toBe('m1')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o2/organizations/org-pilot/members')
    await c.o2.listInvitations('org-pilot')
    expect(fetchMock.mock.calls[1][0]).toBe('https://api/prod/o2/organizations/org-pilot/invitations')
  })

  it('inviteMember POSTs the invitation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(inv, 201))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o2.inviteMember('org-pilot', { name: 'Giulia', email: 'g@x.io', role: 'ORGANIZER' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o2/organizations/org-pilot/invitations')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ name: 'Giulia', email: 'g@x.io', role: 'ORGANIZER' })
  })

  it('changeMemberRole PUTs the org-scoped role and surfaces a 409 last-owner error', async () => {
    const ok = vi.fn().mockResolvedValue(res({ ...member, role: 'OWNER' }))
    const c1 = createClient({ baseUrl: 'https://api/prod', fetch: ok })
    await c1.o2.changeMemberRole('org-pilot', 'm1', 'OWNER')
    const [url, init] = ok.mock.calls[0]
    expect(url).toBe('https://api/prod/o2/organizations/org-pilot/members/m1/role')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ role: 'OWNER' })

    const bad = vi.fn().mockResolvedValue(res({ code: 'LAST_OWNER', message: 'keep one owner' }, 409))
    const c2 = createClient({ baseUrl: 'https://api/prod', fetch: bad })
    await expect(c2.o2.changeMemberRole('org-pilot', 'm1', 'ORGANIZER')).rejects.toMatchObject({ status: 409, code: 'LAST_OWNER' })
  })

  it('removeMember / revokeInvitation DELETE their org-scoped resources', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o2.removeMember('org-pilot', 'm1')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o2/organizations/org-pilot/members/m1')
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
    await c.o2.revokeInvitation('org-pilot', 'i1')
    expect(fetchMock.mock.calls[1][0]).toBe('https://api/prod/o2/organizations/org-pilot/invitations/i1')
  })
})
