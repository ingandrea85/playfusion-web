import { describe, it, expect } from 'vitest';
import { renderResourceSteward } from '../src/views/resource-steward';
const ev = { sportEventId: 'e', name: 'Test', sport: 'calcio' } as any;
const plan = {
  days: ['2026-09-10'], defaultTeamSize: 14, teams: [], unassignable: [], finishesByDay: {},
  nodes: [
    { nodeId: 'docce', kind: 'group', label: 'Docce', memberIds: ['s1'], mode: 'scheduled', topoIndex: 0, predecessorIds: [] },
    { nodeId: 'mensa', kind: 'resource', label: 'Mensa', memberIds: ['mensa'], mode: 'free', topoIndex: 1, predecessorIds: ['docce'] },
  ],
  turns: [{ resourceId: 's1', day: '2026-09-10', nodeId: 'docce', topoIndex: 0, slots: [{ time: '10:30', capacity: 10, persons: 10, overflow: false, teams: [{ team: 'Leoni', categoryId: '1', size: 10 }] }] }],
  freeLists: [{ nodeId: 'mensa', day: '2026-09-10', teams: [{ team: 'Leoni', categoryId: '1', served: true, servedAt: '11:00' }, { team: 'Aquile', categoryId: '1' }] }],
  pending: [{ nodeId: 'mensa', day: '2026-09-10', team: 'Aquile', categoryId: '1', waitingFor: 'Docce' }],
} as any;

describe('e3 resource steward', () => {
  it('renders nodes in pipeline order with a check-off toggle on scheduled slots', () => {
    const html = renderResourceSteward(ev, plan, '2026-09-10');
    expect(html.indexOf('Docce')).toBeLessThan(html.indexOf('Mensa'));
    expect(html).toContain('js-checkoff');            // toggle control
    expect(html).toContain('Leoni');
  });
  it('renders a free node as a flat list with a served/total counter', () => {
    const html = renderResourceSteward(ev, plan, '2026-09-10');
    expect(html).toContain('1/2');                    // Leoni served of 2
  });
  it('greys out a pending team', () => {
    expect(renderResourceSteward(ev, plan, '2026-09-10')).toContain('in attesa');
  });
});
