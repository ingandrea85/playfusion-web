import type { Category, Competition, CompetitionConfig, Registration, Schedule, ScheduleConfig, ScheduledMatch, StandingRow, FinalMatch, FixtureCategory, State, TournamentEvent } from './types'
import { buildSeed } from './seed'
import { buildFixtures, buildGroups, addMinutes } from './fixtures'
import { buildFinals } from './finals'

const KEY = 'playfusion-mock-v1'

function load(): State {
  const raw = localStorage.getItem(KEY)
  if (!raw) { const seed = buildSeed(); localStorage.setItem(KEY, JSON.stringify(seed)); return seed }
  return JSON.parse(raw) as State
}
function save(state: State): void { localStorage.setItem(KEY, JSON.stringify(state)) }

export function resetDemo(): void { save(buildSeed()) }

export function getEvents(): TournamentEvent[] { return load().events }
export function getEvent(id: string): TournamentEvent | undefined { return load().events.find(e => e.id === id) }

export function createEvent(input: { name: string; sport: string; location: string; startDate: string; startTime: string; endDate: string }): TournamentEvent {
  const state = load()
  const event: TournamentEvent = {
    id: `evt-${state.events.length + 1}`, name: input.name, sport: input.sport, location: input.location,
    startDate: input.startDate, startTime: input.startTime, endDate: input.endDate, template: 'PB-1', registrationsOpen: false,
  }
  state.events.push(event); save(state); return event
}

export function getCategories(eventId: string): Category[] {
  return load().categories.filter(c => c.eventId === eventId)
}
export function addCategory(eventId: string, name: string, maxTeams: number): Category {
  const state = load()
  const category: Category = { id: `cat-${state.categories.length + 1}`, eventId, name, maxTeams }
  state.categories.push(category); save(state); return category
}

export function setRegistrationsOpen(eventId: string, open: boolean): void {
  const state = load()
  const e = state.events.find(x => x.id === eventId); if (e) e.registrationsOpen = open
  save(state)
}

export function getRegistrations(eventId: string): Registration[] {
  return load().registrations.filter(r => r.eventId === eventId)
}
export function addRegistration(input: {
  eventId: string; categoryId: string; teamName: string; contactName: string; contactPhone: string; contactEmail: string
}): Registration {
  const state = load()
  const reg: Registration = {
    id: `reg-${state.registrations.length + 1}`, ...input,
    status: 'PENDING', paymentStatus: 'UNPAID', createdAt: new Date().toISOString(),
  }
  state.registrations.push(reg); save(state); return reg
}
export function confirmTeam(regId: string): void {
  const state = load()
  const r = state.registrations.find(x => x.id === regId); if (r) r.status = 'CONFIRMED'
  save(state)
}
export function markPaid(regId: string): void {
  const state = load()
  const r = state.registrations.find(x => x.id === regId); if (r) r.paymentStatus = 'PAID'
  save(state)
}

export function getCompetitions(eventId: string): Competition[] {
  return load().competitions.filter(c => c.eventId === eventId)
}
export function getCompetition(categoryId: string): Competition | undefined {
  return load().competitions.find(c => c.categoryId === categoryId)
}
export function upsertCompetition(input: { eventId: string; categoryId: string } & CompetitionConfig): Competition {
  const state = load()
  const existing = state.competitions.find(c => c.categoryId === input.categoryId)
  if (existing) { Object.assign(existing, input); save(state); return existing }
  const comp: Competition = { id: `comp-${state.competitions.length + 1}`, ...input }
  state.competitions.push(comp); save(state); return comp
}
export function applyToAllCategories(eventId: string, config: CompetitionConfig): void {
  const state = load()
  for (const cat of state.categories.filter(c => c.eventId === eventId)) {
    const existing = state.competitions.find(c => c.categoryId === cat.id)
    if (existing) Object.assign(existing, config)
    else state.competitions.push({ id: `comp-${state.competitions.length + 1}`, eventId, categoryId: cat.id, ...config })
  }
  save(state)
}

export function getSchedule(eventId: string): Schedule | undefined {
  return load().schedules.find(s => s.eventId === eventId)
}
export function getScheduledMatches(eventId: string): ScheduledMatch[] {
  return load().scheduledMatches.filter(m => m.eventId === eventId)
}
function ensureSchedule(state: State, eventId: string): Schedule {
  let s = state.schedules.find(x => x.eventId === eventId)
  if (!s) {
    s = { eventId, status: 'NONE', config: { dailyStart: '09:00', slotsPerDay: 8, finalsDate: '', byCategory: {} } }
    state.schedules.push(s)
  }
  return s
}
export function generateSchedule(eventId: string, config: ScheduleConfig): void {
  const state = load()
  const sched = ensureSchedule(state, eventId)
  if (sched.status === 'APPROVED' || sched.status === 'PUBLISHED') { save(state); return }
  const event = state.events.find(e => e.id === eventId)
  if (!event) { save(state); return }
  sched.config = config
  const DEF = { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 }
  const cats: FixtureCategory[] = state.categories.filter(c => c.eventId === eventId).map(c => {
    const comp = state.competitions.find(k => k.categoryId === c.id)
    const teams = state.registrations
      .filter(r => r.eventId === eventId && r.categoryId === c.id && r.status === 'CONFIRMED')
      .map(r => r.teamName)
    const cs = config.byCategory[c.id] ?? DEF
    return {
      id: c.id, name: c.name, format: comp?.format ?? 'ROUND_ROBIN', groupsCount: comp?.groupsCount ?? 1, legs: comp?.legs ?? 'SINGLE', teams,
      fields: cs.fields, periods: cs.periods, periodMinutes: cs.periodMinutes, breakMinutes: cs.breakMinutes,
    }
  })
  const matches = buildFixtures(eventId, event.startDate, event.endDate, config.dailyStart, config.slotsPerDay, cats)
  state.scheduledMatches = state.scheduledMatches.filter(m => m.eventId !== eventId).concat(matches)
  const groups = buildGroups(cats)
  state.standings = state.standings.filter(s => s.eventId !== eventId)
  for (const g of groups) for (const team of g.teams) {
    state.standings.push({ eventId, categoryId: g.categoryId, groupLabel: g.groupLabel, team,
      played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 })
  }
  const finalsOut: FinalMatch[] = []
  let fseq = 0
  for (const cat of cats) {
    const comp = state.competitions.find(k => k.categoryId === cat.id)
    if (!comp) continue
    const gironi = buildGroups([cat]).map(g => g.groupLabel)
    const draws = buildFinals(gironi, comp.qualifiersPerGroup, comp.finalsType)
    if (!draws.length) continue
    const fields = cat.fields.length ? cat.fields : ['Campo 1']
    const slotMinutes = cat.periods * cat.periodMinutes + cat.breakMinutes
    let fi = 0, si = 0
    for (const d of draws) {
      finalsOut.push({ id: `fm-${++fseq}`, eventId, categoryId: cat.id, bracketLabel: d.bracketLabel, round: d.round, order: d.order, home: d.home, away: d.away, day: config.finalsDate, time: addMinutes(config.dailyStart, si * slotMinutes), field: fields[fi] })
      fi++; if (fi >= fields.length) { fi = 0; si++ }
    }
  }
  state.finals = state.finals.filter(f => f.eventId !== eventId).concat(finalsOut)
  sched.status = 'GENERATED'
  save(state)
}
export function approveSchedule(eventId: string): void {
  const state = load()
  const s = state.schedules.find(x => x.eventId === eventId)
  if (s && s.status === 'GENERATED') s.status = 'APPROVED'
  save(state)
}
export function publishSchedule(eventId: string): void {
  const state = load()
  const s = state.schedules.find(x => x.eventId === eventId)
  if (s && s.status === 'APPROVED') s.status = 'PUBLISHED'
  save(state)
}
export function getStandings(eventId: string): StandingRow[] {
  return load().standings.filter(s => s.eventId === eventId)
}
export function getFinals(eventId: string): FinalMatch[] {
  return load().finals.filter(f => f.eventId === eventId)
}
