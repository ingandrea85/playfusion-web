import type { StandingRow } from './types'

// Single source of the classifica order: points → goal difference → goals for → team name.
// Used by the standings view and by finals qualifier resolution.
export function rankStanding(rows: StandingRow[]): StandingRow[] {
  return [...rows].sort((a, b) =>
    b.points - a.points
    || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
    || b.goalsFor - a.goalsFor
    || a.team.localeCompare(b.team))
}
