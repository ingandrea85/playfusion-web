import { describe, it, expect } from 'vitest'
import type { EventDetail } from '@playfusion/rest-client'
import { renderWorkspace, renderCategorie } from '../src/views/workspace'

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

  it('has no separate Competizione tab (merged into Panoramica)', () => {
    const html = renderWorkspace(full, 'overview')
    expect(html).not.toContain('/competition')
    expect(html).toContain('/categorie')
  })

  it('folds the competition config into Panoramica (playbook, tie-break, finals note)', () => {
    const html = renderWorkspace(full, 'overview')
    expect(html).toContain('PB-2')
    expect(html).toContain('Differenza reti')
    expect(html).toContain('fase finale')
    expect(html).toContain('Calendario')
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

describe('format bracket (S4): solo tabellone hides gironi + classifiche tabs', () => {
  const bracketEv: EventDetail = { ...minimal, sportEventId: 'eb', format: 'bracket' }
  it('hides Gironi and Classifiche for a bracket event', () => {
    const html = renderWorkspace(bracketEv, 'overview')
    expect(html).not.toContain(`/eb/gironi`)
    expect(html).not.toContain(`/eb/standings`)
    expect(html).toContain(`/eb/finals`)   // finals/bracket stays
    expect(html).toContain(`/eb/schedule`) // calendar stays
  })
  it('keeps Gironi and Classifiche for a groups+bracket (default) event', () => {
    const html = renderWorkspace(full, 'overview')
    expect(html).toContain(`/e1/gironi`)
    expect(html).toContain(`/e1/standings`)
  })
})

describe('finals config (S12)', () => {
  it('Panoramica points finals config to the Calendario tab (no event-level editor)', () => {
    const html = renderWorkspace(full, 'overview')
    expect(html).toContain('fase finale')
    expect(html).toContain('Calendario')
    expect(html).not.toContain('id="fc-type"') // the old event-level editor is gone
  })
})
