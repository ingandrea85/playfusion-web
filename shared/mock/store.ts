import type { Category, Registration, State, TournamentEvent } from './types'
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

export function createEvent(input: { name: string; sport: string; startDate: string; endDate: string }): TournamentEvent {
  const state = load()
  const event: TournamentEvent = {
    id: `evt-${state.events.length + 1}`, name: input.name, sport: input.sport,
    startDate: input.startDate, endDate: input.endDate, template: 'PB-1', registrationsOpen: false,
  }
  state.events.push(event); save(state); return event
}

export function getCategories(eventId: string): Category[] {
  return load().categories.filter(c => c.eventId === eventId)
}
export function addCategory(eventId: string, name: string): Category {
  const state = load()
  const category: Category = { id: `cat-${state.categories.length + 1}`, eventId, name }
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
  eventId: string; categoryId: string; teamName: string; coachName: string; contactPhone: string
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
