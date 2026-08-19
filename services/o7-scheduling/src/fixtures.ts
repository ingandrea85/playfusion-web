import type { FixtureCategory, ScheduledMatch } from './domain.js';

/** Every unordered pair (i<j) of a group's teams — a single round-robin. */
function pairs(teams: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < teams.length; i++)
    for (let j = i + 1; j < teams.length; j++) out.push([teams[i]!, teams[j]!]);
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
interface Cursor { field: number; slot: number; day: number }

/** Deterministic "plausible" fixture generator (S22 per-category placement). For each
 *  category's resolved groups (the gironi composition — S8), build each group's round-robin
 *  (doubled for HOME_AWAY), tagging every match with that category's own fields + slot length.
 *
 *  Placement uses one cursor PER (fields + slot-length) signature: categories sharing the
 *  same fields+timing lay out sequentially on a single cursor (no collisions — the "same for
 *  all" case behaves like before); categories with distinct fields lay out in parallel on
 *  their own fields (no collisions because the fields differ). Two categories sharing only
 *  some fields can still overlap — accepted, and resolvable via the S9 reschedule editor.
 *
 *  Deterministic: no `Math.random`; ids `sm-${n}` in category → group → pair order. */
export function buildFixtures(
  eventId: string, startDate: string, endDate: string, dailyStart: string, slotsPerDay: number, cats: FixtureCategory[],
): ScheduledMatch[] {
  const raw: Array<{ categoryId: string; groupLabel: string; home: string; away: string; place: Placement }> = [];
  for (const cat of cats) {
    const slotMinutes = cat.periods * cat.periodMinutes + cat.breakMinutes;
    const fields = cat.fields.length ? cat.fields : ['Campo 1'];
    const place: Placement = { fields, slotMinutes };
    for (const group of cat.groups) {
      for (const [home, away] of pairs(group.teams)) {
        raw.push({ categoryId: cat.id, groupLabel: group.label, home, away, place });
        if (cat.legs === 'HOME_AWAY') raw.push({ categoryId: cat.id, groupLabel: group.label, home: away, away: home, place });
      }
    }
  }

  const days = dateRange(startDate, endDate);
  const cursors = new Map<string, Cursor>();
  return raw.map((r, idx) => {
    const key = `${r.place.fields.join('|')}@${r.place.slotMinutes}`;
    const cur = cursors.get(key) ?? { field: 0, slot: 0, day: 0 };
    const match: ScheduledMatch = {
      id: `sm-${idx + 1}`, sportEventId: eventId, categoryId: r.categoryId, groupLabel: r.groupLabel,
      day: days[cur.day % days.length]!, time: addMinutes(dailyStart, cur.slot * r.place.slotMinutes),
      field: r.place.fields[cur.field]!, home: r.home, away: r.away,
    };
    cur.field++;
    if (cur.field >= r.place.fields.length) { cur.field = 0; cur.slot++; if (cur.slot >= slotsPerDay) { cur.slot = 0; cur.day++; } }
    cursors.set(key, cur);
    return match;
  });
}
