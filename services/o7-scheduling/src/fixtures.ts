import type { FixtureCategory, ScheduleConfig, ScheduledMatch } from './domain.js';

/** Every unordered pair (i<j) of a group's teams — a single round-robin. */
function pairs(teams: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < teams.length; i++)
    for (let j = i + 1; j < teams.length; j++) out.push([teams[i]!, teams[j]!]);
  return out;
}

function groupLabel(i: number): string { return `Girone ${String.fromCharCode(65 + i)}`; }

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

/** Deterministic "plausible" fixture generator: split each category's teams into groups
 *  (round-robin i → group i % groupsCount), build each group's round-robin (doubled for
 *  HOME_AWAY), then place matches on fields/slots/days by rotating field → slot → day.
 *  No conflict avoidance, no `Math.random`; ids are `sm-${n}`. */
export function buildFixtures(
  eventId: string, startDate: string, endDate: string, config: ScheduleConfig, cats: FixtureCategory[],
): ScheduledMatch[] {
  const raw: Array<{ categoryId: string; groupLabel: string; home: string; away: string }> = [];
  for (const cat of cats) {
    const groups = Math.max(1, cat.groupsCount);
    const buckets: string[][] = Array.from({ length: groups }, () => []);
    cat.teams.forEach((t, i) => buckets[i % groups]!.push(t));
    buckets.forEach((bucket, gi) => {
      for (const [home, away] of pairs(bucket)) {
        raw.push({ categoryId: cat.id, groupLabel: groupLabel(gi), home, away });
        if (cat.legs === 'HOME_AWAY') raw.push({ categoryId: cat.id, groupLabel: groupLabel(gi), home: away, away: home });
      }
    });
  }

  const days = dateRange(startDate, endDate);
  const slotMinutes = config.periods * config.periodMinutes + config.breakMinutes;
  const fields = config.fields.length ? config.fields : ['Campo 1'];
  let field = 0, slot = 0, day = 0;
  return raw.map((r, idx) => {
    const match: ScheduledMatch = {
      id: `sm-${idx + 1}`, sportEventId: eventId, categoryId: r.categoryId, groupLabel: r.groupLabel,
      day: days[day % days.length]!, time: addMinutes(config.dailyStart, slot * slotMinutes),
      field: fields[field]!, home: r.home, away: r.away,
    };
    field++;
    if (field >= fields.length) { field = 0; slot++; if (slot >= config.slotsPerDay) { slot = 0; day++; } }
    return match;
  });
}
