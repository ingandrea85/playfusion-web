import type { State } from './types'
import { rankStanding } from './ranking'

export function recomputeStandings(state: State, eventId: string): void {
  for (const s of state.standings) {
    if (s.eventId !== eventId) continue
    s.played = 0; s.won = 0; s.drawn = 0; s.lost = 0; s.goalsFor = 0; s.goalsAgainst = 0; s.points = 0
  }
  for (const m of state.scheduledMatches) {
    if (m.eventId !== eventId || m.homeScore === null || m.awayScore === null) continue
    const h = state.standings.find(s => s.eventId === eventId && s.categoryId === m.categoryId && s.team === m.home)
    const a = state.standings.find(s => s.eventId === eventId && s.categoryId === m.categoryId && s.team === m.away)
    if (!h || !a) continue
    h.played++; a.played++
    h.goalsFor += m.homeScore; h.goalsAgainst += m.awayScore
    a.goalsFor += m.awayScore; a.goalsAgainst += m.homeScore
    if (m.homeScore > m.awayScore) { h.won++; h.points += 3; a.lost++ }
    else if (m.homeScore < m.awayScore) { a.won++; a.points += 3; h.lost++ }
    else { h.drawn++; a.drawn++; h.points++; a.points++ }
  }
}

function groupComplete(state: State, eventId: string, categoryId: string, groupLabel: string): boolean {
  const ms = state.scheduledMatches.filter(m => m.eventId === eventId && m.categoryId === categoryId && m.groupLabel === groupLabel)
  return ms.length > 0 && ms.every(m => m.homeScore !== null && m.awayScore !== null)
}

function resolveSlot(state: State, eventId: string, categoryId: string, placeholder: string): string | null {
  const mt = /^(\d+)ª (Girone .+)$/.exec(placeholder)
  if (!mt) return null
  const pos = Number(mt[1])
  const group = mt[2]
  if (!groupComplete(state, eventId, categoryId, group)) return null
  const policy = state.events.find(e => e.id === eventId)?.tieBreak ?? []
  const rows = state.standings.filter(s => s.eventId === eventId && s.categoryId === categoryId && s.groupLabel === group)
  const matches = state.scheduledMatches.filter(m => m.eventId === eventId && m.categoryId === categoryId && m.groupLabel === group)
  const res = rankStanding(rows, matches, policy)
  const team = res.rows[pos - 1]?.team ?? null
  if (team === null) return null
  // Do not qualify a team whose exact position is still undecided.
  if (res.unresolved.some(g => g.includes(team))) return null
  return team
}

// Re-derive every finals slot for the event from current standings. Idempotent.
export function resolveFinals(state: State, eventId: string): void {
  for (const f of state.finals) {
    if (f.eventId !== eventId) continue
    f.homeResolved = resolveSlot(state, eventId, f.categoryId, f.home)
    f.awayResolved = resolveSlot(state, eventId, f.categoryId, f.away)
  }
}
