import type { GroupStanding, StandingRow } from './domain.js';

// The format model + validate + compile now live in the shared @playfusion/finals-format lib
// (used by both o7 and the E1 editor). Re-export them so existing o7 imports keep working.
export * from '@playfusion/finals-format';

/**
 * Cross-group seeding: all group winners ranked among themselves, then all runners-up, etc. Within a
 * finishing position, teams are ordered by performance (points → goal difference → goals for → name).
 * `groups` are one category's GROUP standings (rows already ranked within each group). Returns the
 * ordered team list where `Seed k` = index `k-1`. Lives here (not in the lib) because it needs o7's
 * standings types; it is used only by the on-read resolver.
 */
export function seedRanking(groups: GroupStanding[]): string[] {
  if (!groups.length) return [];
  const maxPos = Math.max(...groups.map((g) => g.rows.length));
  const cmp = (a: StandingRow, b: StandingRow): number =>
    b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team);
  const out: string[] = [];
  for (let pos = 0; pos < maxPos; pos++) {
    const atPos = groups.map((g) => g.rows[pos]).filter((r): r is StandingRow => !!r).sort(cmp);
    for (const r of atPos) out.push(r.team);
  }
  return out;
}
