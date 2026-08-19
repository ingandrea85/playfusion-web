import { describe, it, expect } from 'vitest'
import type { EventDetail } from '@playfusion/rest-client'
import { renderWorkspace, renderCompetition, renderCategorie } from '../src/views/workspace'

const full: EventDetail = {
  sportEventId: 'e1', sport: 'Calcio', categorie: ['U10', 'U12'],
  dates: { from: '2026-08-29', to: '2026-08-30' }, status: 'Published',
  name: 'Torneo Estivo', location: 'Rivalta', startTime: '09:00',
  tieBreak: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE'], playbook: 'PB-2',
}
const minimal: EventDetail = {
  sportEventId: 'e2', sport: 'Basket', categorie: ['U14'],
  dates: { from: '2026-09-01', to: '2026-09-02' }, status: 'Published', playbook: 'PB-1',
}

describe('workspace Panoramica', () => {
  it('shows the persisted competition config', () => {
    const html = renderWorkspace(full, 'overview')
    expect(html).toContain('Torneo Estivo')
    expect(html).toContain('Rivalta')
    expect(html).toContain('09:00')
    expect(html).toContain('2026-08-29')
    expect(html).toContain('PB-2')
    expect(html).toContain('Scontri diretti / avulsa') // tie-break label
    expect(html).toContain('Differenza reti')
  })

  it('uses the event name as the hero title when present', () => {
    expect(renderWorkspace(full, 'overview')).toContain('Torneo Estivo')
  })

  it('falls back to sport · categorie in the hero when there is no name', () => {
    const html = renderWorkspace(minimal, 'overview')
    expect(html).toContain('Basket · U14')
  })

  it('renders the competition and categorie tabs in the nav', () => {
    const html = renderWorkspace(full, 'overview')
    expect(html).toContain('/competition')
    expect(html).toContain('/categorie')
  })
})

describe('workspace Competition tab', () => {
  it('renders the tie-break order and playbook', () => {
    const html = renderCompetition(full)
    expect(html).toContain('Differenza reti')
    expect(html).toContain('PB-2')
  })
})

describe('workspace Categorie tab (dashboard)', () => {
  const cfg = { fields: ['A'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE' as const, byCategory: { U10: { fields: ['A'], periods: 2, periodMinutes: 20, breakMinutes: 10, legs: 'SINGLE' as const, finalsType: 'SPLIT_GROUP_FINALS' as const } } }
  const data = {
    event: full,
    confirmed: [
      { registrationId: 'r1', participantRef: 'A', sportEventId: 'e1', categoria: 'U10', status: 'Confirmed' as const },
      { registrationId: 'r2', participantRef: 'B', sportEventId: 'e1', categoria: 'U10', status: 'Confirmed' as const },
    ],
    gironi: { U10: { locked: true, groups: [{ label: 'Girone A', teams: ['A', 'B'] }] } },
    schedule: { sportEventId: 'e1', organizationId: 'o', status: 'GENERATED' as const, config: cfg },
  }
  it('shows per-category teams / gironi / finals format + calendar status', () => {
    const html = renderCategorie(data)
    expect(html).toContain('U10')
    expect(html).toContain('U12')
    expect(html).toContain('Gironi + girone finale') // U10 finals format
    expect(html).toContain('Generato')                // calendar status
  })
})

describe('competition finals editor (S12)', () => {
  it('points finals config to the Calendario tab (no event-level editor)', () => {
    const html = renderCompetition(full)
    expect(html).toContain('fase finale')
    expect(html).toContain('Calendario')
    expect(html).not.toContain('id="fc-type"') // the old event-level editor is gone
  })
})
