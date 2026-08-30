import type { FinalsType, MatchPhase } from './domain.js';

/** S13 finals generator — realigned to the real Playfusion 1 (AppSync) semantics. Pure: produces the
 *  structural draws (bracket label + round + slot + placeholder home/away + placement range) for one
 *  category from its resolved groups; the scheduler assigns id/day/time/field/phase mapping.
 *
 *  Placeholders (our convention): qualifier seed `Nª Girone X` (resolved from group standings),
 *  winner link `Vincente <slot>` and loser link `Perdente <slot>` (resolved from the finished FINAL
 *  match with that slot — S13 propagation; loser links feed the classification/placement finals). */

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

const seed = (pos: number, girone: string): string => `${pos}ª ${girone}`;
const win = (slot: string): string => `Vincente ${slot}`;
const lose = (slot: string): string => `Perdente ${slot}`;
const largestPow2LE = (n: number): number => { let p = 1; while (p * 2 <= n) p *= 2; return p; };
/** Code round label for a knockout round of `n` entrants (n a power of 2 ≥ 2). Only the winners' path
 *  uses these — the classification (loser) branches use human "Finale Nº/Mº" / "Sp." labels instead. */
const codeLabel = (n: number): string => (n === 2 ? 'F' : n === 4 ? 'SF' : n === 8 ? 'QF' : `R${n}`);

/** Every unordered pair of a list — a single round-robin (for the FINAL_GROUP). */
function roundRobinPairs<T>(items: T[]): Array<[T, T]> {
  const out: Array<[T, T]> = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) out.push([items[i]!, items[j]!]);
  return out;
}

/** Full-classification single-elim over `entrants`, assigning positions `base+1 .. base+entrants.length`.
 *  Each round splits into a winners' branch (top half of positions) and a losers' branch (bottom half),
 *  so every entrant ends with an exact placement. Only the main winners' path carries code rounds
 *  (QF/SF/F → the graphical tree); every classification branch uses human "Finale Nº/Mº" / "Sp." labels
 *  and renders as a placement list. A 2-team round is the deciding final for its two positions. */
function classify(entrants: string[], base: number, prefix: string, mainPath: boolean, bracketLabel: string, draws: FinalDraw[]): void {
  const n = entrants.length;
  if (n < 2) return;
  if (n === 2) {
    const round = mainPath ? 'F' : `Finale ${base + 1}º/${base + 2}º`;
    draws.push({ bracketLabel, round, order: draws.length + 1, slot: `${prefix}F`, home: entrants[0]!, away: entrants[1]!, phase: 'FINAL', placementFrom: base + 1, placementTo: base + 2 });
    return;
  }
  const round = mainPath ? codeLabel(n) : `Sp. ${base + 1}º-${base + n}º`;
  const winners: string[] = [];
  const losers: string[] = [];
  for (let i = 0, k = 1; i + 1 < n; i += 2, k++) {
    const slot = `${prefix}${codeLabel(n)}${k}`;
    draws.push({ bracketLabel, round, order: k, slot, home: entrants[i]!, away: entrants[i + 1]!, phase: 'FINAL' });
    winners.push(win(slot)); losers.push(lose(slot));
  }
  classify(winners, base, `${prefix}W`, mainPath, bracketLabel, draws);
  classify(losers, base + n / 2, `${prefix}L`, false, bracketLabel, draws);
}

/** PLACEMENT (v1 + classifica completa): a full-classification single-elim per finishing tier
 *  (1st-of-each-group, 2nd-of-each-group, …). #groups is truncated to the largest power of 2; each tier
 *  crosses the same-rank team of the effective groups, then classifies them into every position of the
 *  tier's block (winners toward 1º/2º, losers into 3º/4º, 5º/6º, 7º/8º …). */
function placement(groups: FinalGroupInput[]): FinalDraw[] {
  const effective = largestPow2LE(groups.length);
  if (effective < 2) return [];
  const teamsPerGroup = Math.min(...groups.map((g) => g.size));
  const eff = groups.slice(0, effective);
  const draws: FinalDraw[] = [];
  for (let tier = 0; tier < teamsPerGroup; tier++) {
    const place = tier + 1;
    const base = tier * effective;
    const bracketLabel = tier === 0 ? 'Tabellone' : `Piazzamento ${place}ª`;
    const seeds = eff.map((g) => seed(place, g.label));
    classify(seeds, base, `T${place}`, true, bracketLabel, draws);
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

const nextPow2 = (n: number): number => { let p = 1; while (p < n) p *= 2; return p; };

/** Epic #143 (S4) — `bracket` (solo tabellone): a **winners-only** single-elimination seeded directly
 *  from an ordered participant list (no gironi, no standings). Round 1 carries the real participant
 *  names as `home`/`away` (so the on-read resolver treats them as literals — no seed/standings source
 *  needed); every later round carries `Vincente <slot>` links resolved on read from the finished match.
 *  A non-power-of-2 field is padded with byes: a lone entrant advances with no match. The deciding
 *  final carries placement 1º/2º. Unlike `classify`, it produces no loser/classification branches
 *  (3º/4º etc. are out of scope for this epic). */
export function bracketFromParticipants(entrants: string[]): FinalDraw[] {
  const n = entrants.length;
  if (n < 2) return [];
  let slots: (string | null)[] = [...entrants, ...Array(nextPow2(n) - n).fill(null)];
  const draws: FinalDraw[] = [];
  let roundSize = slots.length;
  while (roundSize >= 2) {
    const code = codeLabel(roundSize);
    const next: (string | null)[] = [];
    let k = 0;
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i]!, b = slots[i + 1]!;
      if (a != null && b != null) {
        const slot = `${code}${++k}`;
        draws.push({
          bracketLabel: 'Tabellone', round: code, order: k, slot, home: a, away: b, phase: 'FINAL',
          ...(roundSize === 2 ? { placementFrom: 1, placementTo: 2 } : {}),
        });
        next.push(win(slot));
      } else {
        next.push(a ?? b ?? null); // bye: the present entrant advances (or the empty half propagates)
      }
    }
    slots = next;
    roundSize = next.length;
  }
  return draws;
}

export function buildFinals(groups: FinalGroupInput[], finalsType: FinalsType, opts: { finalsTeamsToBracket?: number } = {}): FinalDraw[] {
  if (finalsType === 'SINGLE_GROUP_CROSSOVER') return singleGroupCrossover(groups);
  if (finalsType === 'SPLIT_GROUP_FINALS') return splitGroupFinals(groups, Math.max(0, Math.floor(opts.finalsTeamsToBracket ?? 0)));
  return placement(groups);
}
