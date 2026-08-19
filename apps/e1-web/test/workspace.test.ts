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

describe('workspace Categorie tab', () => {
  it('lists every category', () => {
    const html = renderCategorie(full)
    expect(html).toContain('U10')
    expect(html).toContain('U12')
  })
})

describe('competition finals editor (S12)', () => {
  it('renders the finals-config editor with the current values', () => {
    const html = renderCompetition({ ...full, finalsType: 'SPLIT_GROUP_FINALS', qualifiersPerGroup: 3 })
    expect(html).toContain('Fase finale')
    expect(html).toContain('SPLIT_GROUP_FINALS')
    expect(html).toContain('value="3"')
    expect(html).toContain('rigenera il calendario')
  })
})
