import type { CompetitionFormat, FixtureCategory, ScheduledCategory, ScheduledMatch } from './types'

function pairs(teams: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (let i = 0; i < teams.length; i++)
    for (let j = i + 1; j < teams.length; j++) out.push([teams[i], teams[j]])
  return out
}

function groupLabel(i: number): string { return `Girone ${String.fromCharCode(65 + i)}` }

function dateRange(start: string, end: string): string[] {
  const out: string[] = []
  const d = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (d <= last) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) }
  return out
}

export function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + mins
  const hh = Math.floor(total / 60) % 24
  return `${String(hh).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function splitIntoGroups(cat: { format: CompetitionFormat; groupsCount: number; teams: string[] }): Array<{ groupLabel: string; teams: string[] }> {
  const groups = cat.format === 'ROUND_ROBIN' ? 1 : Math.max(1, cat.groupsCount)
  const buckets: string[][] = Array.from({ length: groups }, () => [])
  cat.teams.forEach((t, i) => buckets[i % groups].push(t))
  return buckets.map((teams, gi) => ({ groupLabel: groupLabel(gi), teams }))
}

export function buildGroups(cats: FixtureCategory[]): Array<{ categoryId: string; groupLabel: string; teams: string[] }> {
  return cats.flatMap(cat => splitIntoGroups(cat).map(g => ({ categoryId: cat.id, groupLabel: g.groupLabel, teams: g.teams })))
}

export function buildFixtures(
  eventId: string, startDate: string, endDate: string,
  dailyStart: string, slotsPerDay: number, cats: ScheduledCategory[],
): ScheduledMatch[] {
  const days = dateRange(startDate, endDate)
  const out: ScheduledMatch[] = []
  let seq = 0
  for (const cat of cats) {
    const raw: Array<{ groupLabel: string; home: string; away: string }> = []
    for (const g of cat.groups) {
      for (const [home, away] of pairs(g.teams)) {
        raw.push({ groupLabel: g.groupLabel, home, away })
        if (cat.legs === 'HOME_AWAY') raw.push({ groupLabel: g.groupLabel, home: away, away: home })
      }
    }
    const fields = cat.fields.length ? cat.fields : ['Campo 1']
    const slotMinutes = cat.periods * cat.periodMinutes + cat.breakMinutes
    let field = 0, slot = 0, day = 0
    for (const r of raw) {
      out.push({ id: `sm-${++seq}`, eventId, categoryId: cat.id, groupLabel: r.groupLabel,
        day: days[day % days.length], time: addMinutes(dailyStart, slot * slotMinutes), field: fields[field], home: r.home, away: r.away, homeScore: null, awayScore: null })
      field++
      if (field >= fields.length) { field = 0; slot++; if (slot >= slotsPerDay) { slot = 0; day++ } }
    }
  }
  return out
}
