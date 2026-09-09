// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderResourceSteward, wireResourceSteward } from '../src/views/resource-steward';
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
  it('greys out a pending team on a SCHEDULED node (predecessor not yet done) — REAL engine shape', () => {
    // The pure engine (computeResourcePlan in o7) NEVER puts a pending team inside a slot: when a
    // node has a predecessor and that predecessor's completion is missing for a team, no `Arrival`
    // is built for it at all, so the team is in NO turn/slot — only in `plan.pending`. "Docce" here
    // is a scheduled node gated behind a free "Riscaldamento" predecessor that hasn't been checked
    // off; "Orsi" is stuck waiting and must still render (greyed / "in attesa"), even though its
    // slots are otherwise empty for the day.
    const p = {
      ...plan,
      turns: [{ resourceId: 's1', day: '2026-09-10', nodeId: 'docce', topoIndex: 0, slots: [] }],
      pending: [{ nodeId: 'docce', day: '2026-09-10', team: 'Orsi', categoryId: '1', waitingFor: 'Riscaldamento' }],
    } as any;
    const html = renderResourceSteward(ev, p, '2026-09-10');
    expect(html).toContain('pf-checkoff-row--pending');
    expect(html).toContain('in attesa · Riscaldamento');
    expect(html).toContain('Orsi');
    // A pending team that is in no slot has no active toggle button.
    expect(html).not.toContain('data-team="Orsi"');
  });

  it('marking a team sends only {nodeId,day,team} — never a full-ISO servedAt (handler zod is HH:MM)', async () => {
    // Regression: the handler validates an optional servedAt as /^\d{2}:\d{2}$/. The wiring used to
    // send `servedAt: new Date().toISOString()` (full ISO) → zod rejected the whole body → 400 on
    // every "Segna fatto". The client must NOT send servedAt; the server stamps it (event-local).
    const root = document.createElement('div');
    root.innerHTML = renderResourceSteward(ev, plan, '2026-09-10');
    const o7 = {
      markCheckoff: vi.fn(async () => undefined),
      unmarkCheckoff: vi.fn(async () => undefined),
      getResourcePlan: vi.fn(async () => plan),
    } as any;
    wireResourceSteward(root, o7, 'e', '2026-09-10', plan);
    const btn = root.querySelector<HTMLButtonElement>('.js-checkoff[data-served="0"]')!;
    expect(btn).toBeTruthy();
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(o7.markCheckoff).toHaveBeenCalledTimes(1);
    const [evId, body] = o7.markCheckoff.mock.calls[0];
    expect(evId).toBe('e');
    expect(body).toEqual({ nodeId: btn.dataset.node, day: '2026-09-10', team: btn.dataset.team });
    expect(body).not.toHaveProperty('servedAt'); // no full-ISO servedAt → no 400
  });
});
