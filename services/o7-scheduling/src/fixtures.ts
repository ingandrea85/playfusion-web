import type { FixtureCategory, MatchPhase, ScheduledMatch } from './domain.js';

/** Every unordered pair (i<j) of a group's teams — a single round-robin. */
function pairs(teams: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < teams.length; i++)
    for (let j = i + 1; j < teams.length; j++) out.push([teams[i]!, teams[j]!]);
  return out;
}

/** Festival pairing (circle method): `n` rounds where each team meets distinct opponents. Even team
 *  counts give each team exactly min(n, teams-1) matches; odd counts add a rotating bye, so a team
 *  plays at most that many. Returns unordered pairs; ordering (home/away) is arbitrary (no legs). */
export function rotationPairs(teams: string[], n: number): Array<[string, string]> {
  if (teams.length < 2 || n < 1) return [];
  const t = [...teams];
  if (t.length % 2 === 1) t.push('__BYE__');
  const m = t.length; // even
  const rounds = Math.min(Math.floor(n), m - 1);
  const out: Array<[string, string]> = [];
  let arr = [...t];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < m / 2; i++) {
      const a = arr[i]!, b = arr[m - 1 - i]!;
      if (a !== '__BYE__' && b !== '__BYE__') out.push([a, b]);
    }
    arr = [arr[0]!, arr[m - 1]!, ...arr.slice(1, m - 1)]; // fix first, rotate the rest
  }
  return out;
}

/** Inclusive list of ISO days from start to end (UTC, no time zone drift). */
function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out.length ? out : [start];
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + mins;
  const hh = Math.floor(total / 60) % 24;
  return `${String(hh).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

interface Placement { fields: string[]; slotMinutes: number }
interface Slot { teams: Set<string>; count: number }

/** Deterministic "plausible" fixture generator (S22 per-category placement). For each
 *  category's resolved groups (the gironi composition — S8), build each group's round-robin
 *  (doubled for HOME_AWAY), tagging every match with that category's own fields + slot length.
 *
 *  Placement is greedy first-fit over (time-slot → day → field), keeping one cursor space per
 *  (fields + slot-length) signature: categories sharing the same fields+timing share the grid,
 *  categories with distinct fields lay out on their own fields.
 *
 *  HARD constraint: a team plays at most ONE match per (day, time) — a team can't be on two
 *  fields at once. Within a (day, slot) the field positions must hold disjoint teams; a match
 *  whose team is already busy in a slot is pushed to the next free, conflict-free (slot, day).
 *  Scanning slot-major (then day) spreads matches across the event's days at the earliest time
 *  first; slots grow as needed, so nothing overflows the day range. Deterministic (no random);
 *  ids `sm-${n}` in category → group → pair order. */
const placeKey = (p: Placement): string => `${p.fields.join('|')}@${p.slotMinutes}`;

/** A match to place: teams + its category's placement (fields + slot length), plus an optional phase
 *  (group fixtures leave it absent; festival matches set 'FESTIVAL'). */
interface RawMatch { categoryId: string; groupLabel: string; home: string; away: string; place: Placement; phase?: MatchPhase }

/** Greedy first-fit placement over (time-slot → day → field), one team at most per (day, time).
 *  Shared by the round-robin (buildFixtures) and festival (buildFestivalFixtures) paths; `phase` is
 *  carried through to the emitted match. Deterministic; ids `sm-${n}` in input order. */
export function placeMatches(
  raw: RawMatch[], startDate: string, endDate: string, dailyStart: string, eventId: string,
): ScheduledMatch[] {
  const days = dateRange(startDate, endDate);
  const D = days.length;
  // slots[`${signature}#${day}:${slot}`] = which teams + how many fields are already used there.
  const slots = new Map<string, Slot>();
  return raw.map((r, idx) => {
    const F = r.place.fields.length;
    let day = 0, slot = 0, field = 0;
    // First conflict-free position: slot-major (spread across days at the earliest time first).
    for (let s = 0; ; s++) {
      let done = false;
      for (let d = 0; d < D; d++) {
        const key = `${placeKey(r.place)}#${d}:${s}`;
        const cell = slots.get(key) ?? { teams: new Set<string>(), count: 0 };
        if (cell.count < F && !cell.teams.has(r.home) && !cell.teams.has(r.away)) {
          field = cell.count; day = d; slot = s;
          cell.count++; cell.teams.add(r.home); cell.teams.add(r.away);
          slots.set(key, cell);
          done = true; break;
        }
      }
      if (done) break;
    }
    return {
      id: `sm-${idx + 1}`, sportEventId: eventId, categoryId: r.categoryId, groupLabel: r.groupLabel,
      day: days[day]!, time: addMinutes(dailyStart, slot * r.place.slotMinutes),
      field: r.place.fields[field]!, home: r.home, away: r.away,
      ...(r.phase ? { phase: r.phase } : {}),
    };
  });
}

export function buildFixtures(
  eventId: string, startDate: string, endDate: string, dailyStart: string, cats: FixtureCategory[], phase?: MatchPhase,
): ScheduledMatch[] {
  const raw: RawMatch[] = [];
  for (const cat of cats) {
    const slotMinutes = cat.periods * cat.periodMinutes + cat.breakMinutes;
    const catFields = cat.fields.length ? cat.fields : ['Campo 1'];
    for (const group of cat.groups) {
      // Field per group: a pinned group plays ALL its matches on its one field (serialized); an
      // unpinned group keeps sharing the category's fields (today's rotation).
      const place: Placement = { fields: group.field ? [group.field] : catFields, slotMinutes };
      for (const [home, away] of pairs(group.teams)) {
        raw.push({ categoryId: cat.id, groupLabel: group.label, home, away, place, ...(phase ? { phase } : {}) });
        if (cat.legs === 'HOME_AWAY') raw.push({ categoryId: cat.id, groupLabel: group.label, home: away, away: home, place, ...(phase ? { phase } : {}) });
      }
    }
  }
  return placeMatches(raw, startDate, endDate, dailyStart, eventId);
}

/** One festival category: its confirmed teams + how many matches each plays + its placement config. */
export interface FestivalCategory {
  id: string; teams: string[]; matchesPerTeam: number;
  fields: string[]; periods: number; periodMinutes: number; breakMinutes: number;
}

/** Festival (non-competitive): each category's teams play `matchesPerTeam` rotation matches, placed on
 *  the shared grid (same engine as buildFixtures). No groups, no finals; every match is phase FESTIVAL
 *  with an empty groupLabel, so it never feeds the standings. */
export function buildFestivalFixtures(
  eventId: string, startDate: string, endDate: string, dailyStart: string, cats: FestivalCategory[],
): ScheduledMatch[] {
  const raw: RawMatch[] = [];
  for (const cat of cats) {
    const slotMinutes = cat.periods * cat.periodMinutes + cat.breakMinutes;
    const fields = cat.fields.length ? cat.fields : ['Campo 1'];
    const place: Placement = { fields, slotMinutes };
    for (const [home, away] of rotationPairs(cat.teams, cat.matchesPerTeam)) {
      raw.push({ categoryId: cat.id, groupLabel: '', home, away, place, phase: 'FESTIVAL' });
    }
  }
  return placeMatches(raw, startDate, endDate, dailyStart, eventId);
}
