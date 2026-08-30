// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderOrganizations, planLabel, type OrgRow } from '../src/views/organizations'
import type { Subscription } from '@playfusion/rest-client'

const sub = (over: Partial<Subscription> = {}): Subscription =>
  ({ organizationId: 'o1', plan: 'PRO', status: 'ACTIVE', renewsOn: '2026-10-01', trialDaysLeft: 0, ...over })

describe('planLabel', () => {
  it('maps plan/status to a label', () => {
    expect(planLabel(null)).toBe('—')
    expect(planLabel(sub({ plan: 'FREE', status: 'ACTIVE' }))).toBe('Free')
    expect(planLabel(sub({ plan: 'PRO', status: 'ACTIVE' }))).toBe('Pro')
    expect(planLabel(sub({ plan: 'BUSINESS', status: 'ACTIVE' }))).toBe('Business')
    expect(planLabel(sub({ plan: 'PRO', status: 'TRIAL', trialDaysLeft: 7 }))).toBe('Prova Pro · 7g')
  })
})

describe('renderOrganizations', () => {
  it('lists orgs with plan + member count + a link to detail', () => {
    const rows: OrgRow[] = [
      { id: 'org_a', name: 'Acme', memberCount: 3, sub: sub({ plan: 'BUSINESS' }) },
      { id: 'org_b', name: 'Beta', memberCount: 1, sub: null },
    ]
    const html = renderOrganizations(rows)
    expect(html).toContain('Acme')
    expect(html).toContain('Business')
    expect(html).toContain('#/organizations/org_a')
    expect(html).toContain('—') // unknown plan for Beta
  })
  it('shows an empty state', () => {
    expect(renderOrganizations([])).toContain('Nessuna organizzazione')
  })
})
