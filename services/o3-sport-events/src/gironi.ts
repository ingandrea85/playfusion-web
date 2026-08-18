/** O6 group composition, stored per-category on the o3 event (S8). Explicit and editable:
 *  the organizer draws groups (a round-robin auto-seed of the confirmed teams), moves teams
 *  between them, then locks. `teams` are participantRefs (no team-name field yet — see S7). */
export interface Group {
  label: string;   // 'Girone A', 'Girone B', …
  teams: string[]; // participantRefs, in slot order
}
export interface CategoryGironi {
  groups: Group[];
  locked: boolean;
}
/** categoria (a plain string on the event) → its composition. */
export type GironiMap = Record<string, CategoryGironi>;

export function groupLabel(i: number): string { return `Girone ${String.fromCharCode(65 + i)}`; }

/** Round-robin auto-seed: team i → group `i % groupsCount`. Deterministic, order-preserving.
 *  Produces exactly `groupsCount` groups (≥1), some possibly empty when teams < groups. */
export function autoDraw(teams: string[], groupsCount: number): Group[] {
  const n = Math.max(1, Math.floor(groupsCount));
  const groups: Group[] = Array.from({ length: n }, (_, i) => ({ label: groupLabel(i), teams: [] }));
  teams.forEach((t, i) => groups[i % n]!.teams.push(t));
  return groups;
}
