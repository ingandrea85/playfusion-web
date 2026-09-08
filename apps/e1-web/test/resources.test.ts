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
  nodes: [],
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
  it('surfaces residual people the pool could not seat', () => {
    const d: ResourcesData = { ...base, plan: { ...plan, unassignable: [{ day: '2026-09-01', team: 'Giganti', categoryId: 'U10', size: 25 }] } }
    const html = renderResources(d)
    expect(html).toContain('Posti non assegnati')
    expect(html).toContain('Giganti')
    expect(html).toContain('25 posti non assegnati')
  })
  it('flags a partial portion when a team is split across rooms ("10p di 14")', () => {
    const d: ResourcesData = { ...base,
      plan: { ...plan,
        teams: [{ team: 'Leoni', categoryId: 'U10', size: 14 }],
        turns: [{ resourceId: 'r', day: '2026-09-01', slots: [{ time: '10:00', teams: [{ team: 'Leoni', categoryId: 'U10', size: 10 }], persons: 10, capacity: 10, overflow: false }] }] } }
    expect(renderResources(d)).toContain('10p di 14')
  })
  it('renders a group card with members and pool capacity', () => {
    const d = { ...base, config: { ...base.config, resources: [{ resourceId: 's1', name: 'Spogliatoio 1', occupancyMinutes: 30, capacityPersons: 10, offsetMinutes: 0 }, { resourceId: 's2', name: 'Spogliatoio 2', occupancyMinutes: 30, capacityPersons: 10, offsetMinutes: 0 }], groups: [{ groupId: 'docce', name: 'Docce', memberIds: ['s1', 's2'] }] } };
    const html = renderResources(d as any);
    expect(html).toContain('Docce');
    expect(html).toContain('Spogliatoio 1');
    expect(html).toContain('pool 20');
  })
  it('renders relation chips and a pipeline map in topo order', () => {
    const d = { ...base, config: { ...base.config, relations: [{ from: 'docce', to: 'mensa' }] },
      plan: { ...base.plan, nodes: [{ nodeId: 'docce', kind: 'group', label: 'Docce', memberIds: ['s1'], mode: 'scheduled', topoIndex: 0, predecessorIds: [] }, { nodeId: 'mensa', kind: 'resource', label: 'Mensa', memberIds: ['mensa'], mode: 'scheduled', topoIndex: 1, predecessorIds: ['docce'] }] } };
    const html = renderResources(d as any);
    expect(html).toContain('js-rel-chip');
    expect(html).toContain('pf-pipe');            // the pipeline map container
    expect(html.indexOf('Docce')).toBeLessThan(html.indexOf('Mensa')); // topo order
  })
  it('groups the turns resource selector by node', () => {
    const d = { ...base, plan: { ...base.plan, nodes: [{ nodeId: 'docce', kind: 'group', label: 'Docce', memberIds: ['s1', 's2'], mode: 'scheduled', topoIndex: 0, predecessorIds: [] }],
      turns: [{ resourceId: 's1', day: '2026-09-01', nodeId: 'docce', topoIndex: 0, slots: [] }] } };
    expect(renderResources(d as any)).toContain('<optgroup label="Docce">');
  })
})
