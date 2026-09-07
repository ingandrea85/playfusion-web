// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderOrganization, wireOrganization, type OrgDetailData } from '../src/views/organization'
import type { AdminOrgDetail, Subscription, Member } from '@playfusion/rest-client'

const member = (id: string, role: Member['role']): Member => ({ memberId: id, organizationId: 'o1', name: `Nome ${id}`, email: `${id}@x.io`, role, createdAt: '' })
const detail: AdminOrgDetail = { id: 'org_a', name: 'Acme', members: [member('a', 'OWNER'), member('b', 'ORGANIZER')] }
const sub: Subscription = { organizationId: 'org_a', plan: 'CLUB', status: 'ACTIVE', renewsOn: '2026-10-01', trialDaysLeft: 0 }
const data: OrgDetailData = { detail, sub, events: [{ sportEventId: 'e1', sport: 'Calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-02' }, status: 'Published', playbook: 'PB-1', name: 'Torneo' }] }

describe('renderOrganization', () => {
  it('shows members, events and subscription', () => {
    const html = renderOrganization(data)
    expect(html).toContain('Acme')
    expect(html).toContain('Nome a')
    expect(html).toContain('Torneo')
  })
  it('handles a missing subscription', () => {
    expect(renderOrganization({ ...data, sub: null })).toContain('mai provisionata')
  })
  it('shows Free (not an empty "rinnovo ") for an unprovisioned FREE org with no renewsOn', () => {
    const freeSub: Subscription = { organizationId: 'org_a', plan: 'FREE', status: 'ACTIVE', renewsOn: '', trialDaysLeft: 0 }
    const html = renderOrganization({ ...data, sub: freeSub })
    expect(html).toContain('Free')
    expect(html).not.toContain('rinnovo ')
  })
  it('shows a resync action', () => { expect(renderOrganization(data)).toContain('data-resync="1"') })
})

describe('wireOrganization', () => {
  it('resync calls api.resync then onDone', async () => {
    const root = document.createElement('div'); root.innerHTML = renderOrganization(data)
    const resync = vi.fn().mockResolvedValue({}); const onDone = vi.fn()
    wireOrganization(root, 'org_a', { resync, fail: () => {}, onDone })
    root.querySelector<HTMLButtonElement>('[data-resync]')!.click()
    await vi.waitFor(() => expect(resync).toHaveBeenCalledWith('org_a'))
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
  })
})
