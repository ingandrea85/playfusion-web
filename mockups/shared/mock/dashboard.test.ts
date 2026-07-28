import { describe, expect, it } from 'vitest'
import type { State, ScheduledMatch, Registration, Category, FinalMatch, TournamentEvent } from './types'
import { matchProgress, progressByDay, progressByField, paymentSplit, enrollmentByCategory, eventSummary } from './dashboard'

function mkState(p: Partial<State>): State {
  return {
    events: [], categories: [], registrations: [], competitions: [], schedules: [],
    scheduledMatches: [], standings: [], finals: [], groupSlots: [], tieOverrides: [],
    organizations: [], subscriptions: [], announcements: [], users: [], invitations: [],
    resources: [], resourceAssignments: [], teamSizes: [], session: null,
    ...p,
  }
}
const match = (o: Partial<ScheduledMatch> & { id: string }): ScheduledMatch => ({
  eventId: 'e1', categoryId: 'c1', groupLabel: 'A', day: '2026-09-01', time: '10:00', field: 'Campo A',
  home: 'X', away: 'Y', homeScore: null, awayScore: null, ...o,
})
const ev = (o: Partial<TournamentEvent> & { id: string }): TournamentEvent => ({
  organizationId: 'org-1', name: 'E', sport: 'Calcio', location: 'L', startDate: '2026-09-01', startTime: '09:00',
  endDate: '2026-09-01', template: 'PB-1', registrationsOpen: true, tieBreak: [], playbook: 'PB-1', ...o,
})

describe('matchProgress', () => {
  it('counts only fully-scored matches and rounds the pct', () => {
    const state = mkState({ scheduledMatches: [
      match({ id: 'm1', homeScore: 1, awayScore: 0 }),
      match({ id: 'm2', homeScore: 0, awayScore: 0 }),
      match({ id: 'm3' }),
    ] })
    expect(matchProgress(state, 'e1')).toEqual({ played: 2, total: 3, pct: 67 })
  })
  it('is 0% for an event with no matches', () => {
    expect(matchProgress(mkState({}), 'e1')).toEqual({ played: 0, total: 0, pct: 0 })
  })
})

describe('progressByDay', () => {
  it('groups by day, sorted, played vs total', () => {
    const state = mkState({ scheduledMatches: [
      match({ id: 'm1', day: '2026-09-02', homeScore: 1, awayScore: 1 }),
      match({ id: 'm2', day: '2026-09-01', homeScore: 1, awayScore: 0 }),
      match({ id: 'm3', day: '2026-09-01' }),
    ] })
    expect(progressByDay(state, 'e1')).toEqual([
      { day: '2026-09-01', played: 1, total: 2 },
      { day: '2026-09-02', played: 1, total: 1 },
    ])
  })
})

describe('progressByField', () => {
  it('flags a field behind when ≥15 points below overall completion', () => {
    // Campo A 2/2 = 100%, Campo B 0/4 = 0%; overall = 2/6 = 33%. B: 0 <= 18 → behind. A: no.
    const state = mkState({ scheduledMatches: [
      match({ id: 'a1', field: 'Campo A', homeScore: 1, awayScore: 0 }),
      match({ id: 'a2', field: 'Campo A', homeScore: 2, awayScore: 2 }),
      match({ id: 'b1', field: 'Campo B' }),
      match({ id: 'b2', field: 'Campo B' }),
      match({ id: 'b3', field: 'Campo B' }),
      match({ id: 'b4', field: 'Campo B' }),
    ] })
    const r = progressByField(state, 'e1')
    expect(r).toEqual([
      { field: 'Campo A', played: 2, total: 2, behind: false },
      { field: 'Campo B', played: 0, total: 4, behind: true },
    ])
  })
})

describe('paymentSplit', () => {
  const reg = (o: Partial<Registration> & { id: string }): Registration => ({
    eventId: 'e1', categoryId: 'c1', teamName: 'T', contactName: 'N', contactPhone: '', contactEmail: '',
    status: 'CONFIRMED', paymentStatus: 'UNPAID', createdAt: '', ...o,
  })
  it('splits paid vs unpaid over CONFIRMED registrations (PB-1)', () => {
    const state = mkState({
      events: [ev({ id: 'e1' })],
      registrations: [
        reg({ id: 'r1', paymentStatus: 'PAID' }),
        reg({ id: 'r2', paymentStatus: 'UNPAID' }),
        reg({ id: 'r3', paymentStatus: 'PAID' }),
        reg({ id: 'r4', status: 'PENDING', paymentStatus: 'PAID' }), // not counted
      ],
    })
    expect(paymentSplit(state, 'e1')).toEqual({ paid: 2, unpaid: 1 })
  })
  it('is null for PB-2 (no fees)', () => {
    const state = mkState({ events: [ev({ id: 'e1', playbook: 'PB-2' })] })
    expect(paymentSplit(state, 'e1')).toBeNull()
  })
})

describe('enrollmentByCategory', () => {
  it('counts registrations per category against maxTeams', () => {
    const cats: Category[] = [
      { id: 'c1', eventId: 'e1', name: 'U10', maxTeams: 16 },
      { id: 'c2', eventId: 'e1', name: 'U12', maxTeams: 12 },
    ]
    const regs = (id: string, catId: string): Registration => ({
      id, eventId: 'e1', categoryId: catId, teamName: 'T', contactName: '', contactPhone: '', contactEmail: '',
      status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '',
    })
    const state = mkState({ categories: cats, registrations: [regs('r1', 'c1'), regs('r2', 'c1'), regs('r3', 'c2')] })
    expect(enrollmentByCategory(state, 'e1')).toEqual([
      { categoryId: 'c1', count: 2, max: 16 },
      { categoryId: 'c2', count: 1, max: 12 },
    ])
  })
})

describe('eventSummary', () => {
  it('sums goals over played matches and resolves the champion', () => {
    const final: FinalMatch = {
      id: 'f1', eventId: 'e1', categoryId: 'c1', bracketLabel: 'U10', round: 'Finale', order: 1,
      home: 'A', away: 'B', day: '', time: '', field: '',
      homeResolved: 'Aquile', awayResolved: 'Falchi', homeScore: 3, awayScore: 1,
      homeShootout: null, awayShootout: null,
    }
    const state = mkState({
      scheduledMatches: [
        match({ id: 'm1', homeScore: 2, awayScore: 1 }),
        match({ id: 'm2', homeScore: 0, awayScore: 0 }),
        match({ id: 'm3' }), // unplayed, excluded
      ],
      finals: [final],
    })
    const s = eventSummary(state, 'e1')
    expect(s.matches).toBe(2)
    expect(s.goals).toBe(3) // 2+1+0+0
    expect(s.champions).toEqual([{ categoryId: 'c1', bracketLabel: 'U10', team: 'Aquile' }])
  })
})
