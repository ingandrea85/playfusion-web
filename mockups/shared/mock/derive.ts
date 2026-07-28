import type { State, FinalMatch } from './types'
import { rankStanding } from './ranking'
import { roundShort } from './finals'

export function decideMatch(m: FinalMatch): { winner: string; loser: string } | null {
  if (m.homeResolved === null || m.awayResolved === null) return null
  if (m.homeScore === null || m.awayScore === null) return null
  let homeWins: boolean
  if (m.homeScore !== m.awayScore) homeWins = m.homeScore > m.awayScore
  else if (m.homeShootout !== null && m.awayShootout !== null && m.homeShootout !== m.awayShootout) homeWins = m.homeShootout > m.awayShootout
  else return null
  return homeWins ? { winner: m.homeResolved, loser: m.awayResolved } : { winner: m.awayResolved, loser: m.homeResolved }
}

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

function resolveSlot(state: State, eventId: string, categoryId: string, bracketLabel: string, placeholder: string): string | null {
  const mt = /^(\d+)ª (Girone .+)$/.exec(placeholder)
  if (mt) {
    const pos = Number(mt[1])
    const group = mt[2]
    if (!groupComplete(state, eventId, categoryId, group)) return null
    const policy = state.events.find(e => e.id === eventId)?.tieBreak ?? []
    const rows = state.standings.filter(s => s.eventId === eventId && s.categoryId === categoryId && s.groupLabel === group)
    const matches = state.scheduledMatches.filter(m => m.eventId === eventId && m.categoryId === categoryId && m.groupLabel === group)
    const overrides = state.tieOverrides.filter(o => o.eventId === eventId && o.categoryId === categoryId && o.groupLabel === group).map(o => o.order)
    const res = rankStanding(rows, matches, policy, overrides)
    const team = res.rows[pos - 1]?.team ?? null
    if (team === null) return null
    if (res.unresolved.some(g => g.includes(team))) return null
    return team
  }
  const w = /^(Vincente|Perdente) (SF|QF|OF|F|T)(\d+)$/.exec(placeholder)
  if (w) {
    const src = state.finals.find(f => f.eventId === eventId && f.categoryId === categoryId && f.bracketLabel === bracketLabel && roundShort(f.round) === w[2] && f.order === Number(w[3]))
    if (!src) return null
    const d = decideMatch(src)
    if (!d) return null
    return w[1] === 'Vincente' ? d.winner : d.loser
  }
  return null
}

// Re-derive every finals slot for the event from current standings + recorded
// bracket results. Iterative: a decided match feeds the next round's winner slot.
export function resolveFinals(state: State, eventId: string): void {
  const evFinals = state.finals.filter(f => f.eventId === eventId)
  for (let pass = 0; pass < 8; pass++) { // fixpoint; cap well above any bracket depth
    let changed = false
    for (const f of evFinals) {
      const h = resolveSlot(state, eventId, f.categoryId, f.bracketLabel, f.home)
      const a = resolveSlot(state, eventId, f.categoryId, f.bracketLabel, f.away)
      if (h !== f.homeResolved) { f.homeResolved = h; changed = true }
      if (a !== f.awayResolved) { f.awayResolved = a; changed = true }
    }
    if (!changed) break
  }
}
