// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderResources, resourcesScreen, type ResourcesData } from '../src/views/resources'
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
  it('for a free resource, the organizer sees the check-off state (served/total + ✓), read-only', () => {
    const d: ResourcesData = { ...base,
      plan: { ...plan,
        nodes: [{ nodeId: 'mensa', kind: 'resource', label: 'Mensa', memberIds: ['r'], mode: 'free', topoIndex: 0, predecessorIds: [] }],
        freeLists: [{ nodeId: 'mensa', day: '2026-09-01', teams: [{ team: 'Aquile', categoryId: 'U10', served: true, servedAt: '11:00' }, { team: 'Volpi', categoryId: 'U10' }] }],
        pending: [],
      } as any };
    const html = renderResources(d);
    expect(html).toContain('Serviti 1/2');
    expect(html).toContain('✓ 11:00');            // Aquile already served
    expect(html).toContain('da servire');          // Volpi not yet
    expect(html).not.toContain('js-checkoff');     // organizer view is read-only (no mark button)
  });
  it('shows a top-of-tab per-node progress summary (served/total)', () => {
    const d: ResourcesData = { ...base,
      plan: { ...plan,
        nodes: [
          { nodeId: 'r', kind: 'resource', label: 'Docce', icon: '🚿', memberIds: ['r'], mode: 'scheduled', topoIndex: 0, predecessorIds: [] },
          { nodeId: 'mensa', kind: 'resource', label: 'Mensa', memberIds: ['mensa'], mode: 'free', topoIndex: 1, predecessorIds: ['r'] },
        ],
        // Docce: Aquile served, Volpi not → 1/2
        turns: [{ resourceId: 'r', day: '2026-09-01', nodeId: 'r', topoIndex: 0, slots: [{ time: '10:00', capacity: 16, persons: 16, overflow: false, teams: [{ team: 'Aquile', categoryId: 'U10', size: 8, served: true, servedAt: '10:20' }, { team: 'Volpi', categoryId: 'U10', size: 8 }] }] }],
        freeLists: [{ nodeId: 'mensa', day: '2026-09-01', teams: [{ team: 'Aquile', categoryId: 'U10', served: true, servedAt: '11:00' }, { team: 'Volpi', categoryId: 'U10' }] }],
        pending: [],
      } as any };
    const html = renderResources(d);
    expect(html).toContain('Avanzamento risorse');
    expect(html).toContain('1/2');                 // both Docce and Mensa are 1/2
  });
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
  it('shows a generate-steward-link control', () => {
    expect(renderResources(base as any)).toContain('js-steward-link');
  });
  it('shows a per-node mode toggle (scheduled/free)', () => {
    const d = { ...base, plan: { ...base.plan, nodes: [{ nodeId: 'mensa', kind: 'resource', label: 'Mensa', memberIds: ['mensa'], mode: 'free', topoIndex: 0, predecessorIds: [] }] } };
    const html = renderResources(d as any);
    expect(html).toContain('js-node-mode');
    expect(html).toContain('Libera');
    // the active option must carry the established `.on` class so the selected mode is visible;
    // for a free node the "Libera" button is the one marked on.
    expect(html).toMatch(/<button[^>]*class="pf-segopt on"[^>]*data-mode="free"[^>]*>Libera<\/button>/);
  });
  it('overlays a served tick on a checked-off turn row', () => {
    const d = { ...base, plan: { ...base.plan, turns: [{ resourceId: 'r', day: '2026-09-01', nodeId: 'r', topoIndex: 0, slots: [{ time: '10:00', capacity: 10, persons: 10, overflow: false, teams: [{ team: 'Leoni', categoryId: '1', size: 10, served: true, servedAt: '10:05' }] }] }] } };
    expect(renderResources(d as any)).toContain('✓');
  });
  it('deleting a resource that is a relation endpoint also drops that relation from the saved config', async () => {
    // Mirrors data-delgroup's existing relation pruning: "r" (Docce) -> "mensa" must be dropped
    // when "r" itself is deleted, or the next save 422s with "nodo inesistente" and the organizer
    // can never remove the resource.
    const saveResources = vi.fn().mockResolvedValue({})
    const ctx = { client: { o7: { saveResources } } as any, orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh: vi.fn() }
    const d: ResourcesData = { ...base, config: { ...base.config, relations: [{ from: 'r', to: 'mensa' }] } }
    const root = document.createElement('div')
    root.innerHTML = renderResources(d)
    resourcesScreen.mount!(root, ctx as any, d)
    root.querySelector<HTMLButtonElement>('[data-delres="r"]')!.click()
    await vi.waitFor(() => expect(saveResources).toHaveBeenCalled())
    const saved = saveResources.mock.calls[0]![1]
    expect(saved.resources.find((x: any) => x.resourceId === 'r')).toBeUndefined()
    expect(saved.relations).toEqual([])
  })
})
