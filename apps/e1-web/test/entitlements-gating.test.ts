// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import type { EventDetail } from '@playfusion/rest-client'
import { renderBrand } from '../src/views/brand'
import { renderAnnouncements } from '../src/views/announcements'
import { renderMembers } from '../src/views/members'

const event: EventDetail = {
  sportEventId: 'e1', organizationId: 'org-1', sport: 'Calcio', categorie: ['U10'],
  dates: { from: '2026-09-01', to: '2026-09-02' }, status: 'Published', playbook: 'PB-1', name: 'Torneo',
}

describe('plan gating (T1)', () => {
  it('Brand shows a "requires Pro" lock when the plan does not include it', () => {
    const html = renderBrand({ event, brand: null, locked: true })
    expect(html).toMatch(/richiede Pro/i)
    expect(html).toContain('#/account/subscription')
    expect(html).not.toContain('id="b-save"') // the editor is not rendered
  })
  it('Brand renders the editor when unlocked', () => {
    expect(renderBrand({ event, brand: null, locked: false })).toContain('id="b-save"')
  })
  it('Avvisi shows the lock when the plan does not include announcements', () => {
    const html = renderAnnouncements({ event, announcements: [], confirmed: [], locked: true })
    expect(html).toMatch(/richiede Pro/i)
    expect(html).not.toContain('id="a-pub"')
  })
  it('Membri shows the lock when the plan cannot invite members', () => {
    const html = renderMembers({ event, members: [], invitations: [], locked: true })
    expect(html).toMatch(/richiede Pro/i)
    expect(html).not.toContain('id="i-invite"')
  })
})
