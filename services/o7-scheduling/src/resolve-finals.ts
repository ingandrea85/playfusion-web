import { countsForStandings, type GroupStanding, type ScheduledMatch } from './domain.js';

/** S12/S13: resolve finals placeholders to real teams, on read.
 *
 *  - Qualifier seed `Nª Girone X` → the ranked team of that group, **iff** the group is complete
 *    (every GROUP fixture counted — S26) **and** position N is not inside an S11 `unresolved` tie.
 *  - Winner link `Vincente <slot>` / loser link `Perdente <slot>` (S13) → the winner (resp. loser) of
 *    the FINISHED FINAL match with that `slot`. A drawn match resolves via the organizer/director
 *    `decidedWinner`; an unfinished/undecided match leaves the placeholder (blocks the classification).
 *
 *  Resolution is a fixpoint (earlier rounds resolve first, then their winners propagate). Pure and
 *  idempotent: correcting a result that "uncompletes" a group or unfinishes a match reverts the slots.
 *  `standings` are the GROUP standings (ranked, with `unresolved`). */
const SEED_RE = /^(\d+)ª (Girone .+)$/;
const WIN_RE = /^Vincente (.+)$/;
const LOSE_RE = /^Perdente (.+)$/;

export function resolvePlaceholders(matches: ScheduledMatch[], standings: GroupStanding[]): ScheduledMatch[] {
  const byGroup = new Map<string, GroupStanding>();
  for (const g of standings) byGroup.set(`${g.categoryId}||${g.groupLabel}`, g);

  // A group is complete when it has ≥1 GROUP fixture and all of them count for the standings.
  const groupTotal = new Map<string, number>();
  const groupCounted = new Map<string, number>();
  for (const m of matches) {
    if (m.phase === 'FINAL' || m.phase === 'FINAL_GROUP') continue; // only real group fixtures gate completeness
    const key = `${m.categoryId}||${m.groupLabel}`;
    groupTotal.set(key, (groupTotal.get(key) ?? 0) + 1);
    if (countsForStandings(m)) groupCounted.set(key, (groupCounted.get(key) ?? 0) + 1);
  }
  const isComplete = (key: string): boolean => (groupTotal.get(key) ?? 0) > 0 && groupCounted.get(key) === groupTotal.get(key);

  const resolveSeed = (label: string, categoryId: string): string | undefined => {
    const m = SEED_RE.exec(label);
    if (!m) return undefined;
    const key = `${categoryId}||${m[2]}`;
    if (!isComplete(key)) return undefined;
    const team = byGroup.get(key)?.rows[Number(m[1]) - 1]?.team;
    if (!team) return undefined;
    if (byGroup.get(key)!.unresolved.some((set) => set.includes(team))) return undefined; // position ambiguous (S11)
    return team;
  };

  // Work on a shallow copy; homeResolved/awayResolved accumulate across fixpoint passes.
  const out = matches.map((m) => ({ ...m }));
  const finals = out.filter((m) => m.phase === 'FINAL' || m.phase === 'FINAL_GROUP');
  const bySlot = new Map<string, ScheduledMatch>();
  for (const m of finals) if (m.slot) bySlot.set(`${m.categoryId}||${m.slot}`, m);

  const nameOf = (m: ScheduledMatch, side: 'home' | 'away'): string | undefined => {
    const resolved = side === 'home' ? m.homeResolved : m.awayResolved;
    if (resolved) return resolved;
    const raw = side === 'home' ? m.home : m.away;
    return SEED_RE.test(raw) || WIN_RE.test(raw) || LOSE_RE.test(raw) ? undefined : raw; // a literal team name resolves to itself
  };
  // The decided side of a finished match: `want='WIN'` returns the winner, `'LOSE'` the loser. A draw
  // uses the organizer/director `decidedWinner` (the other side is the loser); undecided ⇒ blocked.
  const sideOf = (m: ScheduledMatch, want: 'WIN' | 'LOSE'): string | undefined => {
    if (m.status !== 'FINISHED') return undefined;
    const hs = m.homeScore, as = m.awayScore;
    if (hs == null || as == null) return undefined;
    let winner: 'home' | 'away' | undefined;
    if (hs !== as) winner = hs > as ? 'home' : 'away';
    else if (m.decidedWinner) winner = m.decidedWinner === 'HOME' ? 'home' : 'away';
    if (!winner) return undefined;
    return nameOf(m, want === 'WIN' ? winner : winner === 'home' ? 'away' : 'home');
  };
  const resolveOne = (label: string, categoryId: string): string | undefined => {
    const w = WIN_RE.exec(label);
    if (w) { const t = bySlot.get(`${categoryId}||${w[1]}`); return t ? sideOf(t, 'WIN') : undefined; }
    const l = LOSE_RE.exec(label);
    if (l) { const t = bySlot.get(`${categoryId}||${l[1]}`); return t ? sideOf(t, 'LOSE') : undefined; }
    return resolveSeed(label, categoryId);
  };

  for (let pass = 0; pass < finals.length + 1; pass++) {
    let changed = false;
    for (const m of finals) {
      if (m.homeResolved === undefined) { const r = resolveOne(m.home, m.categoryId); if (r !== undefined) { m.homeResolved = r; changed = true; } }
      if (m.awayResolved === undefined) { const r = resolveOne(m.away, m.categoryId); if (r !== undefined) { m.awayResolved = r; changed = true; } }
    }
    if (!changed) break;
  }
  return out;
}
