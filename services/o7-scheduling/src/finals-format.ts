import { DomainError } from '@playfusion/platform-lib';
import type { FinalDraw } from './finals.js';
import type { GroupStanding, StandingRow } from './domain.js';

// Custom finals formats (admin-authored). A format is an explicitly drawn bracket referencing
// qualifiers by cross-group SEED (not by group letter) plus winner/loser links. Approach A: this
// declarative model is compiled to the internal FinalDraw[] at generate time, reusing all the
// existing finals machinery (propagation, decree on drawn KO, final standings).

export type SeedRef = { seed: number };
export type WinnerRef = { winnerOf: string };
export type LoserRef = { loserOf: string };
export type MatchRef = SeedRef | WinnerRef | LoserRef;

export interface FormatMatch {
  slot: string;             // unique within the format (e.g. 'SF1', 'F', '3P')
  home: MatchRef;
  away: MatchRef;
  placementFrom?: number;   // 2-wide final: winner→from, loser→to (to = from + 1)
  placementTo?: number;
}
export interface FormatRound { name: string; matches: FormatMatch[] }
export interface CustomFinalsFormat { id: string; name: string; seeds: number; rounds: FormatRound[]; createdAt: string }

const isSeed = (r: MatchRef): r is SeedRef => 'seed' in r;
const isWinner = (r: MatchRef): r is WinnerRef => 'winnerOf' in r;
const isLoser = (r: MatchRef): r is LoserRef => 'loserOf' in r;

const bad = (msg: string): never => { throw new DomainError('INVALID_FORMAT', msg, 422); };

/** Validate a format definition (pure — shared by the save endpoint and the future editor). */
export function validateFormat(f: CustomFinalsFormat): void {
  if (!f.name || !f.name.trim()) bad('name is required');
  if (!(Number.isInteger(f.seeds) && f.seeds >= 2)) bad('seeds must be an integer >= 2');
  if (!f.rounds?.length || !f.rounds.some((r) => r.matches?.length)) bad('at least one round with a match is required');

  const allSlots = new Set<string>();
  const earlierSlots = new Set<string>(); // links may only reference slots from PRIOR rounds
  for (const round of f.rounds) {
    if (!round.name?.trim()) bad('round name is required');
    for (const m of round.matches) {
      if (!m.slot?.trim()) bad('match slot is required');
      if (allSlots.has(m.slot)) bad(`duplicate slot ${m.slot}`);
      allSlots.add(m.slot);
      for (const ref of [m.home, m.away]) {
        if (isSeed(ref)) {
          if (!(Number.isInteger(ref.seed) && ref.seed >= 1 && ref.seed <= f.seeds)) bad(`seed ${ref.seed} out of range 1..${f.seeds}`);
        } else if (isWinner(ref)) {
          if (!earlierSlots.has(ref.winnerOf)) bad(`winnerOf "${ref.winnerOf}" is not a slot from an earlier round`);
        } else if (isLoser(ref)) {
          if (!earlierSlots.has(ref.loserOf)) bad(`loserOf "${ref.loserOf}" is not a slot from an earlier round`);
        } else bad('match ref must be a seed, winnerOf or loserOf');
      }
      const hasFrom = m.placementFrom != null, hasTo = m.placementTo != null;
      if (hasFrom || hasTo) {
        if (!(hasFrom && m.placementTo === (m.placementFrom as number) + 1)) bad('placement must be [n, n+1]');
      }
    }
    for (const m of round.matches) earlierSlots.add(m.slot);
  }
}

const refToPlaceholder = (r: MatchRef): string =>
  isSeed(r) ? `Seed ${r.seed}` : isWinner(r) ? `Vincente ${r.winnerOf}` : `Perdente ${(r as LoserRef).loserOf}`;

/** Compile a validated format into the internal FinalDraw[] (same shape buildFinals emits). Refs
 *  become the placeholder tokens the on-read resolver understands: `Seed k` / `Vincente <slot>` /
 *  `Perdente <slot>`. Undefined placement keys are omitted (S13 DynamoDB marshalling rule). */
export function compileFormat(f: CustomFinalsFormat): FinalDraw[] {
  const draws: FinalDraw[] = [];
  let order = 0;
  for (const round of f.rounds) {
    for (const m of round.matches) {
      const d: FinalDraw = {
        bracketLabel: 'Tabellone', round: round.name, order: ++order, slot: m.slot,
        home: refToPlaceholder(m.home), away: refToPlaceholder(m.away), phase: 'FINAL',
      };
      if (m.placementFrom != null) { d.placementFrom = m.placementFrom; d.placementTo = m.placementTo; }
      draws.push(d);
    }
  }
  return draws;
}

/**
 * Cross-group seeding: all group winners ranked among themselves, then all runners-up, etc. Within a
 * finishing position, teams are ordered by performance (points → goal difference → goals for → name).
 * `groups` are one category's GROUP standings (rows already ranked within each group). Returns the
 * ordered team list where `Seed k` = index `k-1`.
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
