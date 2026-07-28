import type { State } from './types'
import { decideMatch } from './derive'

// Pure derivations for the Panoramica dashboard — like overview.ts, (state, eventId) → data,
// no DOM. Everything is computed from existing state; no schema change, no mutations.

const played = (m: { homeScore: number | null; awayScore: number | null }) => m.homeScore !== null && m.awayScore !== null

export function matchProgress(state: State, eventId: string): { played: number; total: number; pct: number } {
  const ms = state.scheduledMatches.filter(m => m.eventId === eventId)
  const p = ms.filter(played).length
  return { played: p, total: ms.length, pct: ms.length ? Math.round((p / ms.length) * 100) : 0 }
}

export function progressByDay(state: State, eventId: string): Array<{ day: string; played: number; total: number }> {
  const ms = state.scheduledMatches.filter(m => m.eventId === eventId)
  const days: string[] = []
  for (const m of ms) if (!days.includes(m.day)) days.push(m.day)
  days.sort()
  return days.map(day => {
    const dm = ms.filter(m => m.day === day)
    return { day, played: dm.filter(played).length, total: dm.length }
  })
}

export function progressByField(state: State, eventId: string): Array<{ field: string; played: number; total: number; behind: boolean }> {
  const ms = state.scheduledMatches.filter(m => m.eventId === eventId)
  const overallPct = matchProgress(state, eventId).pct
  const fields: string[] = []
  for (const m of ms) if (!fields.includes(m.field)) fields.push(m.field)
  fields.sort()
  return fields.map(field => {
    const fm = ms.filter(m => m.field === field)
    const total = fm.length
    const p = fm.filter(played).length
    const pct = total ? (p / total) * 100 : 0
    return { field, played: p, total, behind: total > 0 && pct <= overallPct - 15 }
  })
}

export function paymentSplit(state: State, eventId: string): { paid: number; unpaid: number } | null {
  const ev = state.events.find(e => e.id === eventId)
  if (ev?.playbook === 'PB-2') return null
  const confirmed = state.registrations.filter(r => r.eventId === eventId && r.status === 'CONFIRMED')
  return {
    paid: confirmed.filter(r => r.paymentStatus === 'PAID').length,
    unpaid: confirmed.filter(r => r.paymentStatus !== 'PAID').length,
  }
}

export function enrollmentByCategory(state: State, eventId: string): Array<{ categoryId: string; count: number; max: number }> {
  return state.categories.filter(c => c.eventId === eventId).map(c => ({
    categoryId: c.id,
    count: state.registrations.filter(r => r.eventId === eventId && r.categoryId === c.id).length,
    max: c.maxTeams,
  }))
}

export function eventSummary(state: State, eventId: string): { matches: number; goals: number; champions: Array<{ categoryId: string; bracketLabel: string; team: string }> } {
  const playedMs = state.scheduledMatches.filter(m => m.eventId === eventId && played(m))
  const goals = playedMs.reduce((sum, m) => sum + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0)
  const champions: Array<{ categoryId: string; bracketLabel: string; team: string }> = []
  for (const f of state.finals.filter(f => f.eventId === eventId && f.round === 'Finale')) {
    const d = decideMatch(f)
    if (d?.winner) champions.push({ categoryId: f.categoryId, bracketLabel: f.bracketLabel, team: d.winner })
  }
  return { matches: playedMs.length, goals, champions }
}
