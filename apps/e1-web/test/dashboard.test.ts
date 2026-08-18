import { describe, it, expect } from 'vitest'
import { renderDashboard } from '../src/views/dashboard'
import { renderWorkspace } from '../src/views/workspace'

const ev = { sportEventId: 'e1', sport: 'calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-02' }, status: 'Published' as const, playbook: 'PB-1' as const }

describe('e1 views', () => {
  it('dashboard lists each event with a link to its workspace', () => {
    const html = renderDashboard([ev])
    expect(html).toContain('calcio')
    expect(html).toContain('#/events/e1')
  })
  it('dashboard shows an empty-state when there are no events', () => {
    expect(renderDashboard([])).toMatch(/Nessun torneo/i)
  })
  it('dashboard shows a create-event CTA', () => {
    expect(renderDashboard([])).toContain('#/events/new')
  })
  it('workspace renders the chrome hero + the competition config (S6)', () => {
    const html = renderWorkspace(ev, 'overview')
    expect(html).toContain('pf-whero')
    expect(html).toContain('PB-1') // persisted playbook, no longer a placeholder
  })
})
