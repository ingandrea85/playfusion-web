import type { CategoryFinalStanding, RegistrationWindowView, ScheduledMatchView } from '@playfusion/rest-client'

// S16: pure derivations for the Panoramica dashboard band — (DTOs) → chart data, no DOM.
// Everything is computed from data already exposed by existing endpoints (o7 matches,
// o5 registration-window, o7 final-standings). No schema change, no new store mutation.

export type EventPhase = 'PREP' | 'LIVE' | 'DONE'

const isCancelled = (m: ScheduledMatchView): boolean => m.status === 'CANCELLED'
const isFinal = (m: ScheduledMatchView): boolean => m.phase === 'FINAL' || m.phase === 'FINAL_GROUP'
const isPlayed = (m: ScheduledMatchView): boolean => m.homeScore != null && m.awayScore != null

/** Group-stage fixtures only (phase absent ⇒ GROUP), cancelled matches excluded. */
export function groupMatches(matches: ScheduledMatchView[]): ScheduledMatchView[] {
  return matches.filter((m) => !isFinal(m) && !isCancelled(m))
}

/**
 * Coarse event phase, derived from progress (no dedicated backend field):
 * - PREP  — no group match has a result yet (or none scheduled);
 * - LIVE  — some group matches played, or group done but finals still pending;
 * - DONE  — every group match and every final has a result.
 */
export function derivePhase(matches: ScheduledMatchView[]): EventPhase {
  const group = groupMatches(matches)
  if (group.length === 0) return 'PREP'
  const gp = group.filter(isPlayed).length
  if (gp === 0) return 'PREP'
  if (gp < group.length) return 'LIVE'
  const finals = matches.filter((m) => isFinal(m) && !isCancelled(m))
  return finals.every(isPlayed) ? 'DONE' : 'LIVE'
}

export function matchProgress(matches: ScheduledMatchView[]): { played: number; total: number; pct: number } {
  const g = groupMatches(matches)
  const p = g.filter(isPlayed).length
  return { played: p, total: g.length, pct: g.length ? Math.round((p / g.length) * 100) : 0 }
}

export function progressByDay(matches: ScheduledMatchView[]): Array<{ day: string; played: number; total: number }> {
  const g = groupMatches(matches)
  const days: string[] = []
  for (const m of g) if (!days.includes(m.day)) days.push(m.day)
  days.sort()
  return days.map((day) => {
    const dm = g.filter((m) => m.day === day)
    return { day, played: dm.filter(isPlayed).length, total: dm.length }
  })
}

export function progressByField(matches: ScheduledMatchView[]): Array<{ field: string; played: number; total: number; behind: boolean }> {
  const g = groupMatches(matches)
  const overallPct = matchProgress(matches).pct
  const fields: string[] = []
  for (const m of g) if (!fields.includes(m.field)) fields.push(m.field)
  fields.sort()
  return fields.map((field) => {
    const fm = g.filter((m) => m.field === field)
    const total = fm.length
    const p = fm.filter(isPlayed).length
    const pct = total ? (p / total) * 100 : 0
    return { field, played: p, total, behind: total > 0 && pct <= overallPct - 15 }
  })
}

/** Capacity rows from the registration window (cap/count per category); [] when unavailable. */
export function enrollmentByCategory(window: RegistrationWindowView | null): Array<{ categoria: string; count: number; cap: number }> {
  return (window?.categories ?? []).map((c) => ({ categoria: c.categoria, count: c.count, cap: c.cap }))
}

/** DONE summary: played group matches, total goals in those, and category champions (podium 1º). */
export function eventSummary(matches: ScheduledMatchView[], finalStandings: CategoryFinalStanding[]): { matches: number; goals: number; champions: Array<{ categoryId: string; team: string }> } {
  const playedGroup = groupMatches(matches).filter(isPlayed)
  const goals = playedGroup.reduce((sum, m) => sum + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0)
  const champions: Array<{ categoryId: string; team: string }> = []
  for (const cat of finalStandings) {
    const first = cat.rows.find((r) => r.position === 1 && r.team)
    if (first?.team) champions.push({ categoryId: cat.categoryId, team: first.team })
  }
  return { matches: playedGroup.length, goals, champions }
}
