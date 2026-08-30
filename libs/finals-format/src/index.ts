// Shared, pure logic for finals brackets — imported by o7 (backend generate) AND E1/E3 (editor +
// live formula preview), so there is ONE implementation of the built-in generators + validate/compile.

/** Built-in finals shapes. (Epic #143 S13 realigned these to Playfusion 1 semantics; finali-formule
 *  added GROUP_KNOCKOUT + FINAL_ROUND_ROBIN.) */
export type FinalsType = 'SINGLE_GROUP_CROSSOVER' | 'SPLIT_GROUP_FINALS' | 'PLACEMENT' | 'GROUP_KNOCKOUT' | 'FINAL_ROUND_ROBIN';

/** One structural bracket draw: label + round + slot + placeholder home/away + optional placement
 *  range. `home`/`away` are the placeholder tokens the on-read resolver understands
 *  (`Nª Girone X` / `Seed k` / `Vincente <slot>` / `Perdente <slot>`) or real names (participants). */
export interface FinalDraw {
  bracketLabel: string;
  round: string;
  order: number;
  slot: string;
  home: string;
  away: string;
  placementFrom?: number;
  placementTo?: number;
  phase: 'FINAL' | 'FINAL_GROUP';
}

/** One category group fed to buildFinals: its label + team count (sizes drive tiers/pairs/rest). */
export interface FinalGroupInput { label: string; size: number }

// ---- placeholder helpers (shared convention) ----
const seed = (pos: number, girone: string): string => `${pos}ª ${girone}`;
const win = (slot: string): string => `Vincente ${slot}`;
const lose = (slot: string): string => `Perdente ${slot}`;
const largestPow2LE = (n: number): number => { let p = 1; while (p * 2 <= n) p *= 2; return p; };
const nextPow2 = (n: number): number => { let p = 1; while (p < n) p *= 2; return p; };
/** Code round label for a knockout round of `n` entrants (n a power of 2 ≥ 2). */
const codeLabel = (n: number): string => (n === 2 ? 'F' : n === 4 ? 'SF' : n === 8 ? 'QF' : `R${n}`);

/** Every unordered pair of a list — a single round-robin (for the FINAL_GROUP). */
function roundRobinPairs<T>(items: T[]): Array<[T, T]> {
  const out: Array<[T, T]> = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) out.push([items[i]!, items[j]!]);
  return out;
}

/** Full-classification single-elim over `entrants`, assigning positions `base+1 .. base+entrants.length`. */
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

/** PLACEMENT (v1 + classifica completa): a full-classification single-elim per finishing tier. */
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

/** SPLIT_GROUP_FINALS (v1): a bracket for the top `finalsTeamsToBracket` + a round-robin FINAL_GROUP. */
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

/** finali-formule SP-A4 — FINAL_ROUND_ROBIN: a single round-robin poule among the top-N overall
 *  qualifiers (cross-group `Seed k`, resolved on read once every group is complete). No elimination —
 *  the poule's own standings decide every final position. */
export function finalRoundRobin(topN: number): FinalDraw[] {
  const n = Math.max(2, Math.floor(topN));
  const seeds = Array.from({ length: n }, (_, i) => `Seed ${i + 1}`);
  return roundRobinPairs(seeds).map(([home, away], k) => ({
    bracketLabel: 'Girone finale', round: 'Girone finale', order: k + 1, slot: `FG${k + 1}`, home, away, phase: 'FINAL_GROUP' as const,
  }));
}

export interface BuildFinalsOpts { finalsTeamsToBracket?: number; qualifiersPerGroup?: number; thirdPlace?: boolean }

export function buildFinals(groups: FinalGroupInput[], finalsType: FinalsType, opts: BuildFinalsOpts = {}): FinalDraw[] {
  if (finalsType === 'SINGLE_GROUP_CROSSOVER') return singleGroupCrossover(groups);
  if (finalsType === 'SPLIT_GROUP_FINALS') return splitGroupFinals(groups, Math.max(0, Math.floor(opts.finalsTeamsToBracket ?? 0)));
  if (finalsType === 'GROUP_KNOCKOUT') return groupKnockout(groups, { qualifiersPerGroup: opts.qualifiersPerGroup, thirdPlace: opts.thirdPlace });
  if (finalsType === 'FINAL_ROUND_ROBIN') return finalRoundRobin(opts.finalsTeamsToBracket ?? groups.length);
  return placement(groups);
}

/** Epic #143 (S4) — `bracket` (solo tabellone): a winners-only single-elimination seeded directly
 *  from an ordered participant list (no gironi, no standings). Round 1 carries the real participant
 *  names; every later round carries `Vincente <slot>` links resolved on read. A non-power-of-2 field
 *  is padded with byes: a lone entrant advances with no match. The deciding final carries 1º/2º. */
/** A 3rd-place final (Epic finali-formule SP-A2): the two semifinal losers play for the bronze.
 *  Only meaningful when the bracket has exactly two semifinals (`semiSlots.length === 2`). */
export function thirdPlaceDraw(semiSlots: string[], order: number): FinalDraw | null {
  if (semiSlots.length !== 2) return null;
  return { bracketLabel: 'Finale 3º/4º', round: 'Finale 3º/4º', order, slot: '3P',
    home: lose(semiSlots[0]!), away: lose(semiSlots[1]!), phase: 'FINAL', placementFrom: 3, placementTo: 4 };
}

export interface KnockoutOpts { thirdPlace?: boolean }

/** Winners-only single elim over a fixed (already power-of-two) slot array; `null` = a bye (the paired
 *  entrant advances with no match). Round 1 slots may be real names OR seed placeholders. Later rounds
 *  carry `Vincente <slot>` links; the deciding final gets 1º/2º and (opt) a 3rd/4th final. */
function knockoutFromSlots(slots0: (string | null)[], opts: KnockoutOpts): FinalDraw[] {
  let slots = slots0;
  const draws: FinalDraw[] = [];
  const semiSlots: string[] = []; // the SF-round match slots (for the optional 3rd-place final)
  let roundSize = slots.length;
  while (roundSize >= 2) {
    const code = codeLabel(roundSize);
    const next: (string | null)[] = [];
    let k = 0;
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i]!, b = slots[i + 1]!;
      if (a != null && b != null) {
        const slot = `${code}${++k}`;
        if (roundSize === 4) semiSlots.push(slot);
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
  if (opts.thirdPlace) { const tp = thirdPlaceDraw(semiSlots, draws.length + 1); if (tp) draws.push(tp); }
  return draws;
}

export function bracketFromParticipants(entrants: string[], opts: KnockoutOpts = {}): FinalDraw[] {
  const n = entrants.length;
  if (n < 2) return [];
  return knockoutFromSlots([...entrants, ...Array(nextPow2(n) - n).fill(null)], opts);
}

/** Standard bracket seed positions for a power-of-two draw: returns, for each bracket position (in
 *  order), the seed number that occupies it (1 spread from 2, 1-4-2-3, …). Byes land on the top seeds
 *  because their opponents (the highest, non-existent seed numbers) become `null`. */
function seedSlots(size: number): number[] {
  let cur: number[] = [1, 2];
  while (cur.length < size) {
    const s = cur.length * 2, nx: number[] = [];
    for (const seedNo of cur) { nx.push(seedNo); nx.push(s + 1 - seedNo); }
    cur = nx;
  }
  return cur;
}

export interface GroupKnockoutOpts extends KnockoutOpts { qualifiersPerGroup?: number }

/** finali-formule SP-A3 — GROUP_KNOCKOUT: a seeded single-elim from group qualifiers. The top `Q` of
 *  each group qualify; seeds are ordered group-winners-first (1ºA, 1ºB, … then 2ºA, 2ºB, …) then placed
 *  with standard bracket seeding so winners are spread and cross groups (1ºA-2ºB…), with byes to the top
 *  seeds. Entry-round home/away are `Nª Girone X` placeholders resolved on read from the standings. */
export function groupKnockout(groups: FinalGroupInput[], opts: GroupKnockoutOpts = {}): FinalDraw[] {
  const Q = Math.max(1, Math.floor(opts.qualifiersPerGroup ?? 1));
  const quals: string[] = [];
  for (let rank = 1; rank <= Q; rank++) for (const g of groups) quals.push(seed(rank, g.label));
  if (quals.length < 2) return [];
  const positions = seedSlots(nextPow2(quals.length));
  const slots = positions.map((p) => (p <= quals.length ? quals[p - 1]! : null));
  return knockoutFromSlots(slots, { thirdPlace: opts.thirdPlace });
}

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

/** The compiled bracket record (matches o7's FinalDraw shape; home/away are placeholder tokens). */
export interface CompiledDraw {
  bracketLabel: string;
  round: string;
  order: number;
  slot: string;
  home: string;
  away: string;
  placementFrom?: number;
  placementTo?: number;
  phase: 'FINAL';
}

export const isSeed = (r: MatchRef): r is SeedRef => 'seed' in r;
export const isWinner = (r: MatchRef): r is WinnerRef => 'winnerOf' in r;
export const isLoser = (r: MatchRef): r is LoserRef => 'loserOf' in r;

/**
 * Validate a format — returns a list of human-readable errors (empty = valid). Pure, so both the
 * save endpoint (maps a non-empty list to 422) and the editor (shows them inline) use it.
 */
export function validateFormat(f: Pick<CustomFinalsFormat, 'name' | 'seeds' | 'rounds'>): string[] {
  const errors: string[] = [];
  if (!f.name || !f.name.trim()) errors.push('Il nome è obbligatorio.');
  if (!(Number.isInteger(f.seeds) && f.seeds >= 2)) errors.push('I seed devono essere un intero ≥ 2.');
  if (!f.rounds?.length || !f.rounds.some((r) => r.matches?.length)) errors.push('Serve almeno un turno con una partita.');

  const allSlots = new Set<string>();
  const earlierSlots = new Set<string>(); // links may only reference slots from PRIOR rounds
  for (const round of f.rounds ?? []) {
    if (!round.name?.trim()) errors.push('Ogni turno deve avere un nome.');
    for (const m of round.matches ?? []) {
      if (!m.slot?.trim()) { errors.push('Ogni partita deve avere uno slot.'); continue; }
      if (allSlots.has(m.slot)) errors.push(`Slot duplicato: ${m.slot}.`);
      allSlots.add(m.slot);
      for (const [side, ref] of [['home', m.home], ['away', m.away]] as const) {
        if (!ref) { errors.push(`${m.slot}: manca ${side}.`); continue; }
        if (isSeed(ref)) {
          if (!(Number.isInteger(ref.seed) && ref.seed >= 1 && ref.seed <= f.seeds)) errors.push(`${m.slot}: seed ${ref.seed} fuori range 1..${f.seeds}.`);
        } else if (isWinner(ref)) {
          if (!earlierSlots.has(ref.winnerOf)) errors.push(`${m.slot}: "Vincente ${ref.winnerOf}" non è uno slot di un turno precedente.`);
        } else if (isLoser(ref)) {
          if (!earlierSlots.has(ref.loserOf)) errors.push(`${m.slot}: "Perdente ${ref.loserOf}" non è uno slot di un turno precedente.`);
        } else errors.push(`${m.slot}: riferimento non valido.`);
      }
      const hasFrom = m.placementFrom != null, hasTo = m.placementTo != null;
      if ((hasFrom || hasTo) && !(hasFrom && m.placementTo === (m.placementFrom as number) + 1)) errors.push(`${m.slot}: il piazzamento deve essere [n, n+1].`);
    }
    for (const m of round.matches ?? []) if (m.slot) earlierSlots.add(m.slot);
  }
  return errors;
}

// ---- finali-formule SP-B1/B2: the "formula" preview (explainer text + structural draws) ----

/** Human round name for a knockout round of `n` entrants (n a power of 2). */
const roundName = (n: number): string =>
  ({ 2: 'Finale', 4: 'Semifinali', 8: 'Quarti', 16: 'Ottavi', 32: 'Sedicesimi' } as Record<number, string>)[n] ?? `${n}-esimi`;
/** The chain of round names for `n` entrants: Quarti · Semifinali · Finale (padded to a power of 2). */
function roundChain(n: number): string[] {
  const out: string[] = [];
  for (let s = nextPow2(Math.max(2, n)); s >= 2; s /= 2) out.push(roundName(s));
  return out;
}
const seqLabels = (n: number): string[] => Array.from({ length: Math.max(0, Math.floor(n)) }, (_, i) => `${i + 1}`);
const groupLetter = (i: number): string => String.fromCharCode(65 + i);
const syntheticGroups = (g: number, size: number): FinalGroupInput[] =>
  Array.from({ length: Math.max(0, Math.floor(g)) }, (_, i) => ({ label: `Girone ${groupLetter(i)}`, size: Math.max(1, Math.floor(size)) }));

/** The knobs a caller (E1/E3) feeds the formula preview: the chosen structure + the current counts. */
export interface FormulaInput {
  finalsType?: FinalsType;
  solo?: boolean;                // solo tabellone (bracket format): seed straight from the participants
  participants?: number;         // teams/players in the category (solo count, or total for group sizing)
  groups?: number;               // number of groups
  qualifiersPerGroup?: number;   // GROUP_KNOCKOUT
  finalsTeamsToBracket?: number; // SPLIT_GROUP_FINALS / FINAL_ROUND_ROBIN size
  thirdPlace?: boolean;
}

/** Compile the chosen formula into structural draws for the current counts (placeholder home/away, no
 *  real names). Empty when there's nothing to draw yet (too few teams / no format chosen). */
export function previewDraws(input: FormulaInput): FinalDraw[] {
  if (input.solo) return bracketFromParticipants(seqLabels(input.participants ?? 0), { thirdPlace: input.thirdPlace });
  if (!input.finalsType) return [];
  const g = Math.max(0, Math.floor(input.groups ?? 0));
  const size = g ? Math.max(2, Math.round((input.participants ?? g * 4) / g)) : 4;
  return buildFinals(syntheticGroups(g || 2, size), input.finalsType, {
    finalsTeamsToBracket: input.finalsTeamsToBracket, qualifiersPerGroup: input.qualifiersPerGroup, thirdPlace: input.thirdPlace,
  });
}

/** A one-line, human explanation of the chosen formula, calibrated on the current counts. */
export function formatExplainer(input: FormulaInput): string {
  if (input.solo) {
    const n = Math.floor(input.participants ?? 0);
    if (n < 2) return 'Aggiungi almeno 2 iscritti per generare il tabellone.';
    const byes = nextPow2(n) - n;
    return `Eliminazione diretta: ${n} iscritti → ${roundChain(n).join(' · ')}. Chi perde esce${input.thirdPlace ? ', più finale 3º/4º' : ''}${byes ? `. ${byes} bye per le teste di serie` : ''}.`;
  }
  switch (input.finalsType) {
    case 'GROUP_KNOCKOUT': {
      const q = Math.max(1, Math.floor(input.qualifiersPerGroup ?? 1)), tot = Math.max(0, Math.floor(input.groups ?? 0)) * q;
      return `Tabellone da ${input.groups ?? 0} gironi: passano i primi ${q} di ogni girone (${tot} qualificati), incrociati con teste di serie → ${roundChain(tot).join(' · ')}${input.thirdPlace ? '. Finale 3º/4º inclusa' : ''}.`;
    }
    case 'FINAL_ROUND_ROBIN': {
      const n = Math.max(2, Math.floor(input.finalsTeamsToBracket ?? input.groups ?? 2)), pairs = (n * (n - 1)) / 2;
      return `Girone all'italiana finale: i migliori ${n} si affrontano tutti-contro-tutti (${pairs} partite). Vince chi fa più punti — nessuna eliminazione.`;
    }
    case 'PLACEMENT':
      return 'Tabellone per fascia: i pari-posizione dei gironi si sfidano a eliminazione; ogni squadra ottiene un piazzamento finale.';
    case 'SINGLE_GROUP_CROSSOVER':
      return 'Girone unico: coppie consecutive in classifica (1ª-2ª, 3ª-4ª…) decidono le posizioni.';
    case 'SPLIT_GROUP_FINALS':
      return `I primi ${input.finalsTeamsToBracket ?? 0} vanno al tabellone a eliminazione, gli altri a un girone finale.`;
    default:
      return 'Nessuna fase finale configurata.';
  }
}

const refToPlaceholder = (r: MatchRef): string =>
  isSeed(r) ? `Seed ${r.seed}` : isWinner(r) ? `Vincente ${r.winnerOf}` : `Perdente ${(r as LoserRef).loserOf}`;

/** Compile a (valid) format into bracket draws. Refs → the placeholder tokens the on-read resolver
 *  understands: `Seed k` / `Vincente <slot>` / `Perdente <slot>`. Undefined placement keys omitted. */
export function compileFormat(f: Pick<CustomFinalsFormat, 'rounds'>): CompiledDraw[] {
  const draws: CompiledDraw[] = [];
  let order = 0;
  for (const round of f.rounds) {
    for (const m of round.matches) {
      const d: CompiledDraw = {
        bracketLabel: 'Tabellone', round: round.name, order: ++order, slot: m.slot,
        home: refToPlaceholder(m.home), away: refToPlaceholder(m.away), phase: 'FINAL',
      };
      if (m.placementFrom != null) { d.placementFrom = m.placementFrom; d.placementTo = m.placementTo; }
      draws.push(d);
    }
  }
  return draws;
}
