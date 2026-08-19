import type { FinalsType } from './domain.js';

/** S12 finals bracket generator (pure; ported from the mockup `shared/mock/finals.ts`). Produces the
 *  structural draws (bracket label + round + order + placeholder home/away) for a category from its
 *  groups, qualifiers-per-group and finalsType. No day/time/field/id — the scheduler assigns those.
 *  `Nª Girone X` = qualifier placeholder (resolved in S12); `Vincente <round><n>` = winner placeholder
 *  (propagation is S13). Third place / shootout are S13 (`thirdPlace` kept but always false in S12). */

export interface FinalDraw { bracketLabel: string; round: string; order: number; home: string; away: string }

const slot = (pos: number, girone: string): string => `${pos}ª ${girone}`;

function roundName(n: number): string {
  return n === 2 ? 'Finale' : n === 4 ? 'Semifinali' : n === 8 ? 'Quarti' : n === 16 ? 'Ottavi' : 'Turno';
}
export function roundShort(round: string): string {
  return round === 'Finale' ? 'F' : round === 'Semifinali' ? 'SF' : round === 'Quarti' ? 'QF' : round === 'Ottavi' ? 'OF' : 'T';
}

/** Single-elimination rounds from a seeded slot list; later rounds reference `Vincente <rs><n>`. */
function singleElim(slots: string[], bracketLabel: string, thirdPlace = false): FinalDraw[] {
  const draws: FinalDraw[] = [];
  let current = [...slots];
  while (current.length >= 2) {
    const rn = roundName(current.length);
    const rs = roundShort(rn);
    const winners: string[] = [];
    let order = 1;
    for (let i = 0; i + 1 < current.length; i += 2) {
      draws.push({ bracketLabel, round: rn, order, home: current[i]!, away: current[i + 1]! });
      winners.push(`Vincente ${rs}${order}`);
      order++;
    }
    if (current.length % 2 === 1) winners.push(current[current.length - 1]!);
    if (thirdPlace && current.length === 4) {
      draws.push({ bracketLabel, round: 'Finale 3º/4º', order: 1, home: `Perdente ${rs}1`, away: `Perdente ${rs}2` });
    }
    current = winners;
  }
  return draws;
}

export function buildFinals(gironi: string[], qualifiersPerGroup: number, finalsType: FinalsType, thirdPlace = false): FinalDraw[] {
  const Q = Math.max(0, Math.floor(qualifiersPerGroup));
  if (!gironi.length || Q < 1) return [];
  if (finalsType === 'SINGLE_GROUP_CROSSOVER') {
    const g = gironi[0]!;
    if (Q >= 4) return singleElim([slot(1, g), slot(4, g), slot(2, g), slot(3, g)], 'Tabellone', thirdPlace);
    if (Q >= 2) return [{ bracketLabel: 'Tabellone', round: 'Finale', order: 1, home: slot(1, g), away: slot(2, g) }];
    return [];
  }
  if (finalsType === 'SPLIT_GROUP_FINALS') {
    const out: FinalDraw[] = [];
    for (let p = 1; p <= Q; p++) {
      const label = p === 1 ? 'Tabellone Oro' : p === 2 ? 'Tabellone Argento' : `Tabellone ${p}`;
      out.push(...singleElim(gironi.map((g) => slot(p, g)), label, thirdPlace));
    }
    return out;
  }
  // PLACEMENT
  const out: FinalDraw[] = [];
  const g0 = gironi[0]!;
  const g1 = gironi[1] ?? gironi[0]!;
  for (let p = 1; p <= Q; p++) {
    out.push({ bracketLabel: 'Piazzamento', round: `Finale ${2 * p - 1}º/${2 * p}º`, order: p, home: slot(p, g0), away: slot(p, g1) });
  }
  return out;
}
