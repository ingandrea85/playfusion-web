import { describe, it, expect } from 'vitest'
import { renderDashboard } from '../src/views/dashboard'
import { renderWorkspace } from '../src/views/workspace'

const ev = { sportEventId: 'e1', sport: 'calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-02' }, status: 'Published' as const }

describe('e1 views', () => {
  it('dashboard lists each event with a link to its workspace', () => {
    const html = renderDashboard([ev])
    expect(html).toContain('calcio')
    expect(html).toContain('#/events/e1')
  })
  it('dashboard shows an empty-state when there are no events', () => {
    expect(renderDashboard([])).toMatch(/Nessun torneo/i)
  })
  it('workspace renders the chrome hero + a placeholder tab body', () => {
    const html = renderWorkspace(ev, 'overview')
    expect(html).toContain('pf-whero')
    expect(html).toMatch(/S4/) // "arriving in S4+" placeholder
  })
})
