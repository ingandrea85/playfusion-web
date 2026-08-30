// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderOrganization, wireOrganization, type OrgDetailData } from '../src/views/organization'
import type { AdminOrgDetail, Subscription, Member } from '@playfusion/rest-client'

const member = (id: string, role: Member['role']): Member => ({ memberId: id, organizationId: 'o1', name: `Nome ${id}`, email: `${id}@x.io`, role, createdAt: '' })
const detail: AdminOrgDetail = { id: 'org_a', name: 'Acme', members: [member('a', 'OWNER'), member('b', 'ORGANIZER')] }
const sub: Subscription = { organizationId: 'org_a', plan: 'PRO', status: 'ACTIVE', renewsOn: '2026-10-01', trialDaysLeft: 0 }
const data: OrgDetailData = { detail, sub, events: [{ sportEventId: 'e1', sport: 'Calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-02' }, status: 'Published', playbook: 'PB-1', name: 'Torneo' }] }

describe('renderOrganization', () => {
  it('shows members, events, subscription and plan actions', () => {
    const html = renderOrganization(data)
    expect(html).toContain('Acme')
    expect(html).toContain('Nome a')
    expect(html).toContain('Torneo')
    expect(html).toContain('data-plan="BUSINESS"')
    expect(html).toContain('data-trial="1"')
  })
  it('handles a missing subscription', () => {
    expect(renderOrganization({ ...data, sub: null })).toContain('mai provisionata')
  })
})

describe('wireOrganization', () => {
  it('a plan button calls setPlan then onDone', async () => {
    const root = document.createElement('div'); root.innerHTML = renderOrganization(data)
    const setPlan = vi.fn().mockResolvedValue({})
    const onDone = vi.fn()
    wireOrganization(root, 'org_a', { setPlan, fail: () => {}, onDone })
    root.querySelector<HTMLButtonElement>('[data-plan="BUSINESS"]')!.click()
    await vi.waitFor(() => expect(setPlan).toHaveBeenCalledWith('org_a', { plan: 'BUSINESS' }))
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
  })
  it('the trial button grants a PRO trial', async () => {
    const root = document.createElement('div'); root.innerHTML = renderOrganization(data)
    const setPlan = vi.fn().mockResolvedValue({})
    wireOrganization(root, 'org_a', { setPlan, fail: () => {}, onDone: () => {} })
    root.querySelector<HTMLButtonElement>('[data-trial="1"]')!.click()
    await vi.waitFor(() => expect(setPlan).toHaveBeenCalledWith('org_a', { plan: 'PRO', trial: true }))
  })
})
