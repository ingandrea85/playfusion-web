import { describe, it, expect } from 'vitest'
import { renderResources, type ResourcesData } from '../src/views/resources'
import type { ResourcePlan } from '@playfusion/rest-client'

const event = { sportEventId: 'e1', sport: 'calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-01' }, status: 'Published' as const, playbook: 'PB-2' as const }
const shower = { resourceId: 'r', name: 'Docce', icon: '🚿', occupancyMinutes: 30, capacityPersons: 16, offsetMinutes: 0 }
const plan: ResourcePlan = {
  days: ['2026-09-01'], defaultTeamSize: 14,
  teams: [{ team: 'Aquile', categoryId: 'U10', size: 8 }, { team: 'Volpi', categoryId: 'U10', size: 8 }],
  turns: [{ resourceId: 'r', day: '2026-09-01', slots: [{ time: '10:00', teams: [{ team: 'Aquile', categoryId: 'U10', size: 8 }, { team: 'Volpi', categoryId: 'U10', size: 8 }], persons: 16, capacity: 16, overflow: false }] }],
  unassignable: [],
  finishesByDay: {},
}
const base: ResourcesData = { event, config: { resources: [shower], teamSizes: {} }, plan }

describe('S17 resources view', () => {
  it('renders the resource config table with the resource + an add form', () => {
    const html = renderResources(base)
    expect(html).toContain('🚿 Docce')
    expect(html).toContain('data-addres')
    expect(html).toContain('data-delres="r"')
  })
  it('renders the team-size editor with default + per-team inputs', () => {
    const html = renderResources(base)
    expect(html).toContain('data-teamsize="Aquile"')
    expect(html).toContain('id="r-default"')
  })
  it('renders the proposed turns with a person gauge and per-team move select', () => {
    const html = renderResources(base)
    expect(html).toContain('pf-res-slot')
    expect(html).toContain('16/16')
    expect(html).toContain('pf-res-move')       // "sposta" control
    expect(html).toContain('Aquile')
  })
  it('flags an overflow slot', () => {
    const over: ResourcesData = { ...base, plan: { ...plan, turns: [{ resourceId: 'r', day: '2026-09-01', slots: [{ time: '10:00', teams: [{ team: 'X', categoryId: 'U10', size: 20 }], persons: 20, capacity: 16, overflow: true }] }] } }
    expect(renderResources(over)).toContain('pf-res-slot--over')
  })
  it('surfaces teams that fit no resource', () => {
    const d: ResourcesData = { ...base, plan: { ...plan, unassignable: [{ day: '2026-09-01', team: 'Giganti', categoryId: 'U10', size: 25 }] } }
    const html = renderResources(d)
    expect(html).toContain('Squadre senza risorsa')
    expect(html).toContain('Giganti')
  })
})
