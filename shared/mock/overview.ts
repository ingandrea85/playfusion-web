import type { State, ScheduledMatch, EventPhase } from './types'
import { rankStanding } from './ranking'

export function eventPhase(state: State, eventId: string): EventPhase {
  const sched = state.schedules.find(s => s.eventId === eventId)
  if (!sched || sched.status !== 'PUBLISHED') return 'PREP'
  const groupDone = state.scheduledMatches.filter(m => m.eventId === eventId).every(m => m.homeScore !== null && m.awayScore !== null)
  const finalsDone = state.finals.filter(f => f.eventId === eventId).every(f => f.homeScore !== null && f.awayScore !== null)
  return groupDone && finalsDone ? 'DONE' : 'LIVE'
}

function distinctGroups(state: State, eventId: string): Array<{ categoryId: string; groupLabel: string }> {
  const out: Array<{ categoryId: string; groupLabel: string }> = []
  for (const s of state.standings) {
    if (s.eventId !== eventId) continue
    if (!out.some(x => x.categoryId === s.categoryId && x.groupLabel === s.groupLabel)) out.push({ categoryId: s.categoryId, groupLabel: s.groupLabel })
  }
  return out
}
function rankGroup(state: State, eventId: string, categoryId: string, groupLabel: string) {
  const rows = state.standings.filter(s => s.eventId === eventId && s.categoryId === categoryId && s.groupLabel === groupLabel)
  const matches = state.scheduledMatches.filter(m => m.eventId === eventId && m.categoryId === categoryId && m.groupLabel === groupLabel)
  const policy = state.events.find(e => e.id === eventId)?.tieBreak ?? []
  const overrides = state.tieOverrides.filter(o => o.eventId === eventId && o.categoryId === categoryId && o.groupLabel === groupLabel).map(o => o.order)
  return rankStanding(rows, matches, policy, overrides)
}

export function pendingActions(state: State, eventId: string) {
  const sched = state.schedules.find(s => s.eventId === eventId)
  const notPublished = !sched || sched.status !== 'PUBLISHED'
  const missingResults = state.scheduledMatches.filter(m => m.eventId === eventId && (m.homeScore === null || m.awayScore === null)).length
  let unresolvedTies = 0
  for (const g of distinctGroups(state, eventId)) if (rankGroup(state, eventId, g.categoryId, g.groupLabel).unresolved.length) unresolvedTies++
  const ev = state.events.find(e => e.id === eventId)
  const unpaid = ev?.playbook === 'PB-2' ? 0 : state.registrations.filter(r => r.eventId === eventId && r.status === 'CONFIRMED' && r.paymentStatus === 'UNPAID').length
  return { missingResults, unresolvedTies, unpaid, notPublished }
}

export function nextMatches(state: State, eventId: string, n: number): ScheduledMatch[] {
  return state.scheduledMatches.filter(m => m.eventId === eventId && (m.homeScore === null || m.awayScore === null))
    .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time)).slice(0, n)
}
export function lastResults(state: State, eventId: string, n: number): ScheduledMatch[] {
  return state.scheduledMatches.filter(m => m.eventId === eventId && m.homeScore !== null && m.awayScore !== null)
    .sort((a, b) => (b.day + b.time).localeCompare(a.day + a.time)).slice(0, n)
}
export function groupLeaders(state: State, eventId: string): Array<{ categoryId: string; groupLabel: string; team: string }> {
  const out: Array<{ categoryId: string; groupLabel: string; team: string }> = []
  for (const g of distinctGroups(state, eventId)) {
    const top = rankGroup(state, eventId, g.categoryId, g.groupLabel).rows[0]
    if (top) out.push({ categoryId: g.categoryId, groupLabel: g.groupLabel, team: top.team })
  }
  return out
}
