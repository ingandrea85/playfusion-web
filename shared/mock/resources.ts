import type { State } from './types'
import { addMinutes } from './fixtures'

// Post-match logistics engine — pure (state, …) → data, no DOM, no mutations.
// Generic "resources" (docce, terzo tempo, …): capacity in persons, teams packed by finish time.

export const DEFAULT_TEAM_SIZE = 14
const DEFAULT_SLOT_MIN = 30

export interface ResourceSlot {
  time: string
  teams: Array<{ team: string; categoryId: string; size: number }>
  persons: number
  capacity: number
  overflow: boolean
}

function slotMinutes(state: State, eventId: string, categoryId: string): number {
  const cfg = state.schedules.find(s => s.eventId === eventId)?.config.byCategory[categoryId]
  return cfg ? cfg.periods * cfg.periodMinutes + cfg.breakMinutes : DEFAULT_SLOT_MIN
}

export function matchEnd(m: { time: string }, slotMin: number): string {
  return addMinutes(m.time, slotMin)
}

// Last match end per team for a given day, sorted by finish then team name.
export function teamFinishes(state: State, eventId: string, day: string): Array<{ team: string; categoryId: string; finish: string }> {
  const ms = state.scheduledMatches.filter(m => m.eventId === eventId && m.day === day)
  const map = new Map<string, { categoryId: string; finish: string }>()
  for (const m of ms) {
    const end = matchEnd(m, slotMinutes(state, eventId, m.categoryId))
    for (const team of [m.home, m.away]) {
      const prev = map.get(team)
      if (!prev || end > prev.finish) map.set(team, { categoryId: m.categoryId, finish: end })
    }
  }
  return [...map.entries()].map(([team, v]) => ({ team, categoryId: v.categoryId, finish: v.finish }))
    .sort((a, b) => a.finish.localeCompare(b.finish) || a.team.localeCompare(b.team))
}

export function teamSizeOf(state: State, eventId: string, team: string): number {
  const override = state.teamSizes.find(t => t.eventId === eventId && t.team === team)
  if (override) return override.size
  return state.events.find(e => e.id === eventId)?.defaultTeamSize ?? DEFAULT_TEAM_SIZE
}

// Distinct teams of an event, from the group composition (works for demo + real events).
export function eventTeams(state: State, eventId: string): string[] {
  const teams: string[] = []
  for (const g of state.groupSlots.filter(g => g.eventId === eventId)) if (!teams.includes(g.team)) teams.push(g.team)
  return teams.sort()
}

export function eventDays(state: State, eventId: string): string[] {
  const days: string[] = []
  for (const m of state.scheduledMatches.filter(m => m.eventId === eventId)) if (!days.includes(m.day)) days.push(m.day)
  return days.sort()
}

// Proposed turns for a resource on a day: greedy pack by ready-time (finish+offset),
// respecting person-capacity (small teams share); manual overrides re-group a team.
export function resourceTurns(state: State, eventId: string, resourceId: string, day: string): ResourceSlot[] {
  const res = state.resources.find(r => r.id === resourceId)
  if (!res) return []
  const entries = teamFinishes(state, eventId, day).map(f => ({
    team: f.team, categoryId: f.categoryId, size: teamSizeOf(state, eventId, f.team),
    ready: addMinutes(f.finish, res.offsetMinutes),
  }))
  const overrideMap = new Map(state.resourceAssignments
    .filter(a => a.eventId === eventId && a.resourceId === resourceId && a.day === day)
    .map(a => [a.team, a.slotTime]))

  // Greedy rounds: fill a slot to capacity in arrival order, then start the next round after
  // the current occupancy ends (rounds are serialized so concurrent usage never exceeds capacity).
  const sorted = entries.filter(e => !overrideMap.has(e.team)).sort((a, b) => a.ready.localeCompare(b.ready) || a.team.localeCompare(b.team))
  const slots: ResourceSlot[] = []
  let prevEnd = ''
  let i = 0
  while (i < sorted.length) {
    const first = sorted[i]
    const time = first.ready >= prevEnd ? first.ready : prevEnd
    const slot: ResourceSlot = { time, teams: [{ team: first.team, categoryId: first.categoryId, size: first.size }], persons: first.size, capacity: res.capacityPersons, overflow: false }
    i++
    while (i < sorted.length && slot.persons + sorted[i].size <= res.capacityPersons) {
      slot.teams.push({ team: sorted[i].team, categoryId: sorted[i].categoryId, size: sorted[i].size }); slot.persons += sorted[i].size; i++
    }
    prevEnd = addMinutes(time, res.occupancyMinutes)
    slots.push(slot)
  }
  for (const e of entries.filter(e => overrideMap.has(e.team))) {
    const t = overrideMap.get(e.team)!
    let slot = slots.find(s => s.time === t)
    if (!slot) { slot = { time: t, teams: [], persons: 0, capacity: res.capacityPersons, overflow: false }; slots.push(slot) }
    slot.teams.push({ team: e.team, categoryId: e.categoryId, size: e.size }); slot.persons += e.size
  }
  for (const s of slots) s.overflow = s.persons > s.capacity
  return slots.sort((a, b) => a.time.localeCompare(b.time))
}
