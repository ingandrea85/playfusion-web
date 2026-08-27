// Shared, pure logic for custom finals formats — imported by o7 (backend generate) AND the E1
// editor (authoring + live preview), so there is ONE implementation of validate/compile.

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
