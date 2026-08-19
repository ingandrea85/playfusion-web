import { countsForStandings, isPlayed, type GroupStanding, type ScheduledMatch, type StandingRow } from './domain.js';

function emptyRow(team: string): StandingRow {
  return { team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 };
}

/** Pure standings engine (S10). Groups matches by (categoryId, groupLabel); every team seen
 *  in a group (home or away, any status) gets a row; only matches that `countsForStandings`
 *  (FINISHED — S26; or legacy played) are aggregated with 3/1/0. LIVE/SCHEDULED/CANCELLED do
 *  not move the table. Rows sorted points → goal-difference → goals-for → team name (asc).
 *  Deterministic. The configurable tie-break policy (S6 tieBreak) is applied in S11. */
export function computeStandings(matches: ScheduledMatch[]): GroupStanding[] {
  const groups = new Map<string, { categoryId: string; groupLabel: string; rows: Map<string, StandingRow> }>();
  const groupOf = (m: ScheduledMatch) => {
    const key = `${m.categoryId}||${m.groupLabel}`;
    let g = groups.get(key);
    if (!g) { g = { categoryId: m.categoryId, groupLabel: m.groupLabel, rows: new Map() }; groups.set(key, g); }
    return g;
  };
  const rowOf = (g: { rows: Map<string, StandingRow> }, team: string) => {
    let r = g.rows.get(team);
    if (!r) { r = emptyRow(team); g.rows.set(team, r); }
    return r;
  };

  for (const m of matches) {
    const g = groupOf(m);
    const home = rowOf(g, m.home);
    const away = rowOf(g, m.away);
    if (!countsForStandings(m) || !isPlayed(m)) continue;
    const hs = m.homeScore as number;
    const as = m.awayScore as number;
    home.played++; away.played++;
    home.goalsFor += hs; home.goalsAgainst += as;
    away.goalsFor += as; away.goalsAgainst += hs;
    if (hs > as) { home.won++; home.points += 3; away.lost++; }
    else if (hs < as) { away.won++; away.points += 3; home.lost++; }
    else { home.drawn++; away.drawn++; home.points += 1; away.points += 1; }
  }

  return [...groups.values()].map((g) => {
    const rows = [...g.rows.values()].map((r) => ({ ...r, goalDiff: r.goalsFor - r.goalsAgainst }));
    rows.sort((a, b) =>
      b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team));
    return { categoryId: g.categoryId, groupLabel: g.groupLabel, rows, unresolved: [] };
  });
}
