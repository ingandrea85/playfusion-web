import type { FinalsType, MatchPhase } from './domain.js';

/** S13 finals generator — realigned to the real Playfusion 1 (AppSync) semantics. Pure: produces the
 *  structural draws (bracket label + round + slot + placeholder home/away + placement range) for one
 *  category from its resolved groups; the scheduler assigns id/day/time/field/phase mapping.
 *
 *  Placeholders (our convention): qualifier seed `Nª Girone X` (resolved from group standings), and
 *  winner link `Vincente <slot>` (resolved from the finished FINAL match with that slot — S13
 *  propagation). Third place / shootout / loser-links are a follow-up slice. */

export interface FinalDraw {
  bracketLabel: string;
  round: string;
  order: number;
  slot: string;
  home: string;
  away: string;
  placementFrom?: number;
  placementTo?: number;
  phase: Extract<MatchPhase, 'FINAL' | 'FINAL_GROUP'>;
}

/** One category group fed to buildFinals: its label + team count (sizes drive tiers/pairs/rest). */
export interface FinalGroupInput { label: string; size: number }

const ROUND_LABELS = ['R64', 'R32', 'R16', 'QF', 'SF', 'F'];
const seed = (pos: number, girone: string): string => `${pos}ª ${girone}`;
const win = (slot: string): string => `Vincente ${slot}`;
const largestPow2LE = (n: number): number => { let p = 1; while (p * 2 <= n) p *= 2; return p; };
const log2 = (n: number): number => Math.round(Math.log2(n));

/** Every unordered pair of a list — a single round-robin (for the FINAL_GROUP). */
function roundRobinPairs<T>(items: T[]): Array<[T, T]> {
  const out: Array<[T, T]> = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) out.push([items[i]!, items[j]!]);
  return out;
}

/** PLACEMENT (v1): a single-elim bracket per finishing tier (1st-of-each-group, 2nd-of-each-group, …).
 *  #groups is truncated to the largest power of 2; round 0 crosses adjacent groups, later rounds pair
 *  the previous round's winners via `Vincente <slot>`. */
function placement(groups: FinalGroupInput[]): FinalDraw[] {
  const effective = largestPow2LE(groups.length);
  if (effective < 2) return [];
  const teamsPerGroup = Math.min(...groups.map((g) => g.size));
  const rounds = log2(effective);
  const labels = ROUND_LABELS.slice(-rounds);
  const draws: FinalDraw[] = [];
  for (let tier = 0; tier < teamsPerGroup; tier++) {
    const place = tier + 1;
    const base = tier * effective;
    const bracketLabel = tier === 0 ? 'Tabellone' : `Piazzamento ${place}ª`;
    const prefix = `T${place}`;
    // round 0: cross adjacent groups.
    let prev: string[] = [];
    let counter = 1;
    for (let g = 0; g + 1 < effective; g += 2) {
      const slot = `${prefix}-${labels[0]}${counter}`;
      const last = rounds === 1;
      draws.push({ bracketLabel, round: labels[0]!, order: counter, slot, home: seed(place, groups[g]!.label), away: seed(place, groups[g + 1]!.label), phase: 'FINAL', placementFrom: base + 1, placementTo: last ? base + 2 : base + effective });
      prev.push(slot); counter++;
    }
    // later rounds: pair winners.
    for (let r = 1; r < rounds; r++) {
      const next: string[] = [];
      counter = 1;
      const last = r === rounds - 1;
      for (let i = 0; i + 1 < prev.length; i += 2) {
        const slot = `${prefix}-${labels[r]}${counter}`;
        draws.push({ bracketLabel, round: labels[r]!, order: counter, slot, home: win(prev[i]!), away: win(prev[i + 1]!), phase: 'FINAL', placementFrom: base + 1, placementTo: last ? base + 2 : base + effective });
        next.push(slot); counter++;
      }
      prev = next;
    }
  }
  return draws;
}

/** SINGLE_GROUP_CROSSOVER (v1): one group, consecutive-rank pairs each deciding two adjacent places. */
function singleGroupCrossover(groups: FinalGroupInput[]): FinalDraw[] {
  if (groups.length !== 1) return [];
  const g = groups[0]!;
  const draws: FinalDraw[] = [];
  const pairs = Math.floor(g.size / 2);
  for (let i = 0; i < pairs; i++) {
    const from = 2 * i + 1, to = 2 * i + 2;
    draws.push({ bracketLabel: 'Finali', round: `Finale ${from}º/${to}º`, order: i + 1, slot: `F${i + 1}`, home: seed(from, g.label), away: seed(to, g.label), phase: 'FINAL', placementFrom: from, placementTo: to });
  }
  return draws;
}

/** SPLIT_GROUP_FINALS (v1): a bracket for the top `finalsTeamsToBracket` + a round-robin FINAL_GROUP
 *  for the rest. Single group ⇒ consecutive pairs; even multi-group ⇒ cross same-rank of paired groups. */
function splitGroupFinals(groups: FinalGroupInput[], bracket: number): FinalDraw[] {
  if (!groups.length || bracket < 2) return [];
  const G = groups.length;
  const draws: FinalDraw[] = [];
  const rest: string[] = []; // FINAL_GROUP placeholders

  if (G === 1) {
    const g = groups[0]!;
    const pairs = Math.floor(bracket / 2);
    for (let i = 0; i < pairs; i++) {
      const from = 2 * i + 1, to = 2 * i + 2;
      draws.push({ bracketLabel: 'Tabellone', round: `Finale ${from}º/${to}º`, order: i + 1, slot: `F${i + 1}`, home: seed(from, g.label), away: seed(to, g.label), phase: 'FINAL', placementFrom: from, placementTo: to });
    }
    for (let pos = bracket + 1; pos <= g.size; pos++) rest.push(seed(pos, g.label));
  } else {
    if (G % 2 !== 0) return []; // v1: multi-group split requires an even number of groups
    const perGroup = Math.floor(bracket / G);
    for (let rank = 1; rank <= perGroup; rank++) {
      let pairIdx = 0;
      for (let g = 0; g + 1 < G; g += 2) {
        const from = (rank - 1) * G + 2 * pairIdx + 1, to = from + 1;
        draws.push({ bracketLabel: 'Tabellone', round: `Finale ${from}º/${to}º`, order: draws.length + 1, slot: `F-r${rank}-p${pairIdx + 1}`, home: seed(rank, groups[g]!.label), away: seed(rank, groups[g + 1]!.label), phase: 'FINAL', placementFrom: from, placementTo: to });
        pairIdx++;
      }
    }
    for (const grp of groups) for (let pos = perGroup + 1; pos <= grp.size; pos++) rest.push(seed(pos, grp.label));
  }

  roundRobinPairs(rest).forEach(([home, away], k) =>
    draws.push({ bracketLabel: 'Girone finale', round: 'Girone finale', order: k + 1, slot: `FG${k + 1}`, home, away, phase: 'FINAL_GROUP' }));
  return draws;
}

export function buildFinals(groups: FinalGroupInput[], finalsType: FinalsType, opts: { finalsTeamsToBracket?: number } = {}): FinalDraw[] {
  if (finalsType === 'SINGLE_GROUP_CROSSOVER') return singleGroupCrossover(groups);
  if (finalsType === 'SPLIT_GROUP_FINALS') return splitGroupFinals(groups, Math.max(0, Math.floor(opts.finalsTeamsToBracket ?? 0)));
  return placement(groups);
}
