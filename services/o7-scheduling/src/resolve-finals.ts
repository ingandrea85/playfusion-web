import { countsForStandings, type GroupStanding, type ScheduledMatch } from './domain.js';

/** S12: resolve finals qualifier placeholders (`Nª Girone X`) to the real ranked team, on read.
 *
 *  For each FINAL match, a `Nª Girone X` placeholder becomes `standings[cat,X].rows[N-1].team`
 *  **iff** that group is complete (every one of its GROUP fixtures counts — S26) **and** position N
 *  is not inside an S11 `unresolved` tie (an ambiguous position stays a placeholder until the
 *  organizer resolves it). `Vincente <round><n>` is never resolved here — winner propagation is S13.
 *  Pure and idempotent: correcting a result that "uncompletes" a group reverts the slot. */
const SLOT_RE = /^(\d+)ª (Girone .+)$/;

export function resolvePlaceholders(matches: ScheduledMatch[], standings: GroupStanding[]): ScheduledMatch[] {
  const byGroup = new Map<string, GroupStanding>();
  for (const g of standings) byGroup.set(`${g.categoryId}||${g.groupLabel}`, g);

  // A group is complete when it has ≥1 GROUP fixture and all of them count for the standings.
  const groupTotal = new Map<string, number>();
  const groupCounted = new Map<string, number>();
  for (const m of matches) {
    if (m.phase === 'FINAL') continue;
    const key = `${m.categoryId}||${m.groupLabel}`;
    groupTotal.set(key, (groupTotal.get(key) ?? 0) + 1);
    if (countsForStandings(m)) groupCounted.set(key, (groupCounted.get(key) ?? 0) + 1);
  }
  const isComplete = (key: string): boolean => (groupTotal.get(key) ?? 0) > 0 && groupCounted.get(key) === groupTotal.get(key);

  const resolveSlot = (label: string, categoryId: string): string | undefined => {
    const m = SLOT_RE.exec(label);
    if (!m) return undefined; // 'Vincente …' or a literal team — nothing to resolve here
    const pos = Number(m[1]);
    const key = `${categoryId}||${m[2]}`;
    if (!isComplete(key)) return undefined;
    const st = byGroup.get(key);
    const team = st?.rows[pos - 1]?.team;
    if (!team) return undefined;
    if (st!.unresolved.some((set) => set.includes(team))) return undefined; // position ambiguous (S11)
    return team;
  };

  return matches.map((m) => {
    if (m.phase !== 'FINAL') return m;
    return { ...m, homeResolved: resolveSlot(m.home, m.categoryId), awayResolved: resolveSlot(m.away, m.categoryId) };
  });
}
