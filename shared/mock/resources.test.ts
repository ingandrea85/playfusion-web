import { describe, expect, it } from 'vitest'
import type { State, ScheduledMatch, Schedule, Resource, ResourceAssignment, TournamentEvent } from './types'
import { matchEnd, teamFinishes, teamSizeOf, resourceTurns } from './resources'
import { buildSeed } from './seed'

function mkState(p: Partial<State>): State {
  return {
    events: [], categories: [], registrations: [], competitions: [], schedules: [],
    scheduledMatches: [], standings: [], finals: [], groupSlots: [], tieOverrides: [],
    organizations: [], subscriptions: [], announcements: [], users: [], invitations: [],
    resources: [], resourceAssignments: [], teamSizes: [], session: null, ...p,
  }
}
const size = (team: string, n: number) => ({ eventId: 'e1', team, size: n })
const DAY = '2026-09-01'
const sched = (byCat: Record<string, { periods: number; periodMinutes: number; breakMinutes: number }>): Schedule => ({
  eventId: 'e1', status: 'PUBLISHED',
  config: { dailyStart: '09:00', slotsPerDay: 8, finalsDate: DAY, byCategory: Object.fromEntries(Object.entries(byCat).map(([k, v]) => [k, { fields: ['A'], ...v }])) },
})
const m = (o: Partial<ScheduledMatch> & { id: string; home: string; away: string; time: string }): ScheduledMatch => ({
  eventId: 'e1', categoryId: 'c1', groupLabel: 'A', day: DAY, field: 'A', homeScore: null, awayScore: null, ...o,
})
const evt = (o?: Partial<TournamentEvent>): TournamentEvent => ({
  id: 'e1', organizationId: 'org-1', name: 'E', sport: 'Calcio', location: 'L', startDate: DAY, startTime: '09:00',
  endDate: DAY, template: 'PB-1', registrationsOpen: true, tieBreak: [], playbook: 'PB-1', ...o,
})
const docce = (o?: Partial<Resource>): Resource => ({ id: 'res-1', eventId: 'e1', name: 'Docce', occupancyMinutes: 30, capacityPersons: 16, offsetMinutes: 0, ...o })

describe('matchEnd', () => {
  it('adds the category slot length to the start time', () => {
    expect(matchEnd({ time: '10:00' }, 50)).toBe('10:50')
  })
})

describe('teamFinishes', () => {
  it('is the last match end per team, sorted by finish then name', () => {
    // slotMin c1 = 1*20+0 = 20
    const state = mkState({
      schedules: [sched({ c1: { periods: 1, periodMinutes: 20, breakMinutes: 0 } })],
      scheduledMatches: [
        m({ id: 'm1', home: 'A', away: 'Z', time: '12:00' }), // A,Z end 12:20
        m({ id: 'm2', home: 'A', away: 'W', time: '13:00' }), // A,W end 13:20 → A's last
      ],
    })
    const f = teamFinishes(state, 'e1', DAY)
    expect(f.find(x => x.team === 'A')!.finish).toBe('13:20')
    expect(f.find(x => x.team === 'Z')!.finish).toBe('12:20')
    expect(f.map(x => x.team)).toEqual(['Z', 'A', 'W']) // 12:20 Z, 13:20 A, 13:20 W (name order)
  })
})

describe('teamSizeOf', () => {
  it('uses the per-team size, else the event default, else 14', () => {
    const state = mkState({ events: [evt({ defaultTeamSize: 12 })], teamSizes: [size('Small', 8)] })
    expect(teamSizeOf(state, 'e1', 'Small')).toBe(8)
    expect(teamSizeOf(state, 'e1', 'Plain')).toBe(12)
    expect(teamSizeOf(state, 'e1', 'Unknown')).toBe(12)
    expect(teamSizeOf(mkState({}), 'e1', 'X')).toBe(14)
  })
})

describe('resourceTurns', () => {
  const base = () => mkState({
    events: [evt()],
    schedules: [sched({ c1: { periods: 1, periodMinutes: 20, breakMinutes: 0 } })],
    scheduledMatches: [
      m({ id: 'm1', home: 'A', away: 'B', time: '12:00' }), // A,B end 12:20
      m({ id: 'm2', home: 'C', away: 'D', time: '12:15' }), // C,D end 12:35
    ],
    teamSizes: [size('A', 8), size('B', 8), size('C', 10), size('D', 10)],
    resources: [docce()],
  })

  it('two small teams ready together share a slot; capacity serializes the rest', () => {
    const slots = resourceTurns(base(), 'e1', 'res-1', DAY)
    expect(slots[0].time).toBe('12:20')
    expect(slots[0].teams.map(t => t.team)).toEqual(['A', 'B'])
    expect(slots[0].persons).toBe(16)
    expect(slots[0].overflow).toBe(false)
    // C and D (10 each) can't share 16 → serialized into later rounds after 30' occupancy
    expect(slots.map(s => s.time)).toEqual(['12:20', '12:50', '13:20'])
    expect(slots[1].teams.map(t => t.team)).toEqual(['C'])
    expect(slots[2].teams.map(t => t.team)).toEqual(['D'])
  })

  it('a lone team bigger than capacity is flagged overflow', () => {
    const state = base()
    state.teamSizes = [size('Giganti', 20)]
    state.scheduledMatches = [m({ id: 'm1', home: 'Giganti', away: 'A', time: '12:00' })]
    const slots = resourceTurns(state, 'e1', 'res-1', DAY)
    const g = slots.find(s => s.teams.some(t => t.team === 'Giganti'))!
    expect(g.persons).toBeGreaterThan(g.capacity)
    expect(g.overflow).toBe(true)
  })

  it('offset shifts the slot start time', () => {
    const state = base()
    state.resources = [docce({ offsetMinutes: 40 })]
    const slots = resourceTurns(state, 'e1', 'res-1', DAY)
    expect(slots[0].time).toBe('13:00') // 12:20 + 40
  })

  it('works end-to-end on the seeded evt-finals (Docce): the two size-8 teams share a slot', () => {
    const state = buildSeed()
    const slots = resourceTurns(state, 'evt-finals', 'res-1', '2026-09-01')
    expect(slots.length).toBeGreaterThan(0)
    const shared = slots.find(s => s.teams.length > 1)!
    expect(shared.teams.map(t => t.team).sort()).toEqual(['Alfa', 'Bravo'])
    expect(shared.persons).toBe(16)
    expect(slots.every(s => !s.overflow)).toBe(true)
  })

  it('a manual override re-groups a team into its chosen slot time', () => {
    const state = base()
    const ov: ResourceAssignment = { eventId: 'e1', resourceId: 'res-1', day: DAY, team: 'B', slotTime: '09:00' }
    state.resourceAssignments = [ov]
    const slots = resourceTurns(state, 'e1', 'res-1', DAY)
    const nine = slots.find(s => s.time === '09:00')!
    expect(nine.teams.map(t => t.team)).toEqual(['B'])
    // B is no longer packed with A at 12:20
    const noon = slots.find(s => s.time === '12:20')!
    expect(noon.teams.some(t => t.team === 'B')).toBe(false)
  })
})
