import type { Category, Competition, CompetitionConfig, Registration, State, TournamentEvent } from './types'
import { buildSeed } from './seed'

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
