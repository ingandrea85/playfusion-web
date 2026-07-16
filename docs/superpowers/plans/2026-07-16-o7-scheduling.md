# O7 Scheduling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add O7 scheduling to the mockups: an E1 screen to configure fields + match params, generate a plausible calendar from confirmed teams and the O6 structure, review it, approve and publish; plus a public E3 calendar view shown once published.

**Architecture:** Extends the Vite MPA mockup. A pure `buildFixtures` generator (own file, TDD) turns confirmed teams + per-category competition into placed `ScheduledMatch[]`. A `Schedule` record per event (status NONE→GENERATED→APPROVED→PUBLISHED + config) lives in the localStorage store. E1 `schedule.html` drives generate/approve/publish; E3 `calendar.html` renders the published calendar. A shared `renderCalendar` helper keeps E1 and E3 consistent. No framework, no backend.

**Tech Stack:** Vite MPA, vanilla TypeScript, Vitest + jsdom, plain HTML/CSS.

## Global Constraints

- **No framework**; vanilla TS/HTML/CSS only.
- **No backend / no network**; state = seed + `localStorage`.
- **Styling via design tokens**; reuse existing `ui.css` classes; no hardcoded hex in screens.
- **Deterministic** output: no `Math.random`; match IDs `sm-${n}`; date/time computed from inputs.
- **Generation fidelity = plausible, not a constraint solver**: derive from real data (confirmed teams + O6 groups/legs), place field→slot→day in sequence, no conflict avoidance.
- **Match-format params (periods/duration/break) and fields live on the Schedule (O7)**; not on Event/Category/Competition.
- **Reuse the "Matchday" look** (`.pf-pagehead`, `.pf-card`, `.pf-field`, `.pf-btn`, `.pf-mono`, `.pf-cat__label`).

---

## File Structure

```
shared/mock/types.ts        # + ScheduleStatus, ScheduleConfig, Schedule, ScheduledMatch, FixtureCategory; State gains schedules[], scheduledMatches[]
shared/mock/seed.ts         # richer confirmed registrations (for a non-empty calendar) + schedules[] (NONE + default config) + scheduledMatches: []
shared/mock/fixtures.ts     # NEW — pure buildFixtures(...) generator
shared/mock/fixtures.test.ts# NEW — Vitest tests for buildFixtures
shared/mock/store.test.ts   # UPDATE two registration-count assertions (seed grew)
shared/mock/store.ts        # + getSchedule, getScheduledMatches, generateSchedule, approveSchedule, publishSchedule
shared/mock/schedule.test.ts# NEW — Vitest tests for the schedule store functions
shared/chrome.ts            # + renderCalendar(matches, catName) helper (shared E1/E3)
shared/ui.css               # + calendar styles (.pf-calday, .pf-match, …)
vite.config.ts              # + schedule + calendar html inputs
apps/organizer/schedule.html / .ts   # NEW E1 screen
apps/organizer/event-hub.ts # 3 disabled steps become active, done-state from Schedule status
apps/public/calendar.html / .ts      # NEW E3 public screen
apps/public/landing.ts      # + "Calendario" link when published
```

---

### Task 1: Schedule types, richer seed, and the `buildFixtures` generator (TDD)

**Files:**
- Modify: `shared/mock/types.ts`
- Modify: `shared/mock/seed.ts`
- Create: `shared/mock/fixtures.ts`
- Test: `shared/mock/fixtures.test.ts`
- Modify: `shared/mock/store.test.ts` (two assertions only — the seed grew)

**Interfaces:**
- Consumes: `CompetitionFormat`, `Legs` from `types.ts`.
- Produces:
  - `type ScheduleStatus = 'NONE' | 'GENERATED' | 'APPROVED' | 'PUBLISHED'`
  - `interface ScheduleConfig { fields: string[]; periods: number; periodMinutes: number; breakMinutes: number; dailyStart: string; slotsPerDay: number }`
  - `interface Schedule { eventId: string; status: ScheduleStatus; config: ScheduleConfig }`
  - `interface ScheduledMatch { id: string; eventId: string; categoryId: string; groupLabel: string; day: string; time: string; field: string; home: string; away: string }`
  - `interface FixtureCategory { id: string; name: string; format: CompetitionFormat; groupsCount: number; legs: Legs; teams: string[] }`
  - `buildFixtures(eventId: string, startDate: string, endDate: string, config: ScheduleConfig, cats: FixtureCategory[]): ScheduledMatch[]`

- [ ] **Step 1: Add types to `shared/mock/types.ts`**

Append after the `Competition` interface:

```ts
export type ScheduleStatus = 'NONE' | 'GENERATED' | 'APPROVED' | 'PUBLISHED'

export interface ScheduleConfig {
  fields: string[]
  periods: number
  periodMinutes: number
  breakMinutes: number
  dailyStart: string
  slotsPerDay: number
}

export interface Schedule {
  eventId: string
  status: ScheduleStatus
  config: ScheduleConfig
}

export interface ScheduledMatch {
  id: string
  eventId: string
  categoryId: string
  groupLabel: string
  day: string
  time: string
  field: string
  home: string
  away: string
}

export interface FixtureCategory {
  id: string
  name: string
  format: CompetitionFormat
  groupsCount: number
  legs: Legs
  teams: string[]
}
```

And extend `State`:

```ts
export interface State {
  events: TournamentEvent[]
  categories: Category[]
  registrations: Registration[]
  competitions: Competition[]
  schedules: Schedule[]
  scheduledMatches: ScheduledMatch[]
}
```

- [ ] **Step 2: Grow the seed and add schedule state in `shared/mock/seed.ts`**

Replace the whole `registrations: [ ... ],` array with this richer set (a mid-setup tournament: enough confirmed teams for a real calendar; `reg-3` stays PENDING for the existing inbox/payments tests):

```ts
    registrations: [
      { id: 'reg-1', eventId: 'evt-1', categoryId: 'cat-1', teamName: 'ASD Aurora',
        contactName: 'Luigi Verdi', contactPhone: '340 1112223', contactEmail: 'l.verdi@asdaurora.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-10T09:00:00.000Z' },
      { id: 'reg-2', eventId: 'evt-1', categoryId: 'cat-2', teamName: 'Polisportiva San Marco',
        contactName: 'Anna Bianchi', contactPhone: '347 4445556', contactEmail: 'anna.bianchi@sanmarco.it', status: 'CONFIRMED', paymentStatus: 'UNPAID', createdAt: '2026-07-11T14:30:00.000Z' },
      { id: 'reg-3', eventId: 'evt-1', categoryId: 'cat-1', teamName: 'GS Rivalta',
        contactName: 'Marco Neri', contactPhone: '333 7778889', contactEmail: 'mneri@gsrivalta.it', status: 'PENDING', paymentStatus: 'UNPAID', createdAt: '2026-07-12T08:15:00.000Z' },
      { id: 'reg-4', eventId: 'evt-1', categoryId: 'cat-1', teamName: 'Juniores Valsusa',
        contactName: 'Paolo Ginnasi', contactPhone: '340 2223334', contactEmail: 'p.ginnasi@juniores.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-12T10:00:00.000Z' },
      { id: 'reg-5', eventId: 'evt-1', categoryId: 'cat-1', teamName: 'Real Collina',
        contactName: 'Sara Conti', contactPhone: '345 3334445', contactEmail: 's.conti@realcollina.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-12T11:00:00.000Z' },
      { id: 'reg-6', eventId: 'evt-1', categoryId: 'cat-1', teamName: 'Sporting Chieri',
        contactName: 'Davide Riva', contactPhone: '346 4445556', contactEmail: 'd.riva@sportingchieri.it', status: 'CONFIRMED', paymentStatus: 'UNPAID', createdAt: '2026-07-12T12:00:00.000Z' },
      { id: 'reg-7', eventId: 'evt-1', categoryId: 'cat-2', teamName: 'Atletico Basse',
        contactName: 'Elena Fossati', contactPhone: '347 5556667', contactEmail: 'e.fossati@atleticobasse.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-12T13:00:00.000Z' },
      { id: 'reg-8', eventId: 'evt-1', categoryId: 'cat-2', teamName: 'Sporting Nichelino',
        contactName: 'Franco Massa', contactPhone: '348 6667778', contactEmail: 'f.massa@sportingnichelino.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-12T14:00:00.000Z' },
      { id: 'reg-9', eventId: 'evt-1', categoryId: 'cat-2', teamName: 'Pol. Santena',
        contactName: 'Giulia Mora', contactPhone: '349 7778889', contactEmail: 'g.mora@polsantena.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-12T15:00:00.000Z' },
      { id: 'reg-10', eventId: 'evt-1', categoryId: 'cat-3', teamName: 'Virtus Moncalieri',
        contactName: 'Luca Ferro', contactPhone: '340 8889990', contactEmail: 'l.ferro@virtusmoncalieri.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-12T16:00:00.000Z' },
      { id: 'reg-11', eventId: 'evt-1', categoryId: 'cat-3', teamName: 'Pol. Trofarello',
        contactName: 'Chiara Alba', contactPhone: '341 9990001', contactEmail: 'c.alba@poltrofarello.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-12T17:00:00.000Z' },
      { id: 'reg-12', eventId: 'evt-1', categoryId: 'cat-3', teamName: 'Calcio Bra Giovani',
        contactName: 'Marco Sala', contactPhone: '342 0001112', contactEmail: 'm.sala@calciobra.it', status: 'CONFIRMED', paymentStatus: 'PAID', createdAt: '2026-07-12T18:00:00.000Z' },
    ],
```

Then, immediately after the `competitions: [ ... ],` array, add the schedule state:

```ts
    schedules: [
      { eventId: 'evt-1', status: 'NONE', config: { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', slotsPerDay: 8 } },
    ],
    scheduledMatches: [],
```

- [ ] **Step 3: Update the two stale assertions in `shared/mock/store.test.ts`**

The seed now has 12 registrations. Change the count in the seed test:

```ts
    expect(getRegistrations('evt-1')).toHaveLength(12)
```

and the new-id expectation in the addRegistration test (from `reg-4`/length 4):

```ts
    expect(r.id).toBe('reg-13')
    expect(r.status).toBe('PENDING')
    expect(r.paymentStatus).toBe('UNPAID')
    expect(getRegistrations('evt-1')).toHaveLength(13)
```

(Leave the `confirmTeam`/`markPaid` test on `reg-3` unchanged — `reg-3` is still PENDING/UNPAID.)

- [ ] **Step 4: Write the failing test `shared/mock/fixtures.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { buildFixtures } from './fixtures'
import type { FixtureCategory, ScheduleConfig } from './types'

const config: ScheduleConfig = { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', slotsPerDay: 8 }

describe('buildFixtures', () => {
  it('splits teams into groups and produces single-leg round-robin pairs', () => {
    const cats: FixtureCategory[] = [{ id: 'c1', name: 'U10', format: 'GROUPS_KNOCKOUT', groupsCount: 2, legs: 'SINGLE', teams: ['A', 'B', 'C', 'D'] }]
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', config, cats)
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ home: 'A', away: 'C', groupLabel: 'Girone A', field: 'Campo A', time: '09:00', day: '2026-08-29' })
    expect(m[1]).toMatchObject({ home: 'B', away: 'D', groupLabel: 'Girone B', field: 'Campo B', time: '09:00' })
  })

  it('doubles matches for home-away', () => {
    const cats: FixtureCategory[] = [{ id: 'c1', name: 'U10', format: 'GROUPS_KNOCKOUT', groupsCount: 1, legs: 'HOME_AWAY', teams: ['A', 'B', 'C'] }]
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', config, cats)
    expect(m).toHaveLength(6)
    expect(m.filter(x => x.home === 'B' && x.away === 'A')).toHaveLength(1)
  })

  it('treats ROUND_ROBIN as a single group regardless of groupsCount', () => {
    const cats: FixtureCategory[] = [{ id: 'c1', name: 'U10', format: 'ROUND_ROBIN', groupsCount: 5, legs: 'SINGLE', teams: ['A', 'B', 'C'] }]
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', config, cats)
    expect(m).toHaveLength(3)
    expect(m.every(x => x.groupLabel === 'Girone A')).toBe(true)
  })

  it('places field then slot: the 3rd match wraps to the next slot', () => {
    const cats: FixtureCategory[] = [{ id: 'c1', name: 'U10', format: 'GROUPS_KNOCKOUT', groupsCount: 1, legs: 'SINGLE', teams: ['A', 'B', 'C', 'D'] }]
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', config, cats)
    expect(m).toHaveLength(6)
    expect(m[2]).toMatchObject({ field: 'Campo A', time: '09:50' })
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd playfusion-web && npx vitest run shared/mock/fixtures.test.ts`
Expected: FAIL — cannot resolve `./fixtures`.

- [ ] **Step 6: Implement `shared/mock/fixtures.ts`**

```ts
import type { FixtureCategory, ScheduleConfig, ScheduledMatch } from './types'

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

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + mins
  const hh = Math.floor(total / 60) % 24
  return `${String(hh).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function buildFixtures(
  eventId: string, startDate: string, endDate: string, config: ScheduleConfig, cats: FixtureCategory[],
): ScheduledMatch[] {
  const raw: Array<{ categoryId: string; groupLabel: string; home: string; away: string }> = []
  for (const cat of cats) {
    const groups = cat.format === 'ROUND_ROBIN' ? 1 : Math.max(1, cat.groupsCount)
    const buckets: string[][] = Array.from({ length: groups }, () => [])
    cat.teams.forEach((t, i) => buckets[i % groups].push(t))
    buckets.forEach((bucket, gi) => {
      for (const [home, away] of pairs(bucket)) {
        raw.push({ categoryId: cat.id, groupLabel: groupLabel(gi), home, away })
        if (cat.legs === 'HOME_AWAY') raw.push({ categoryId: cat.id, groupLabel: groupLabel(gi), home: away, away: home })
      }
    })
  }
  const days = dateRange(startDate, endDate)
  const slotMinutes = config.periods * config.periodMinutes + config.breakMinutes
  const fields = config.fields.length ? config.fields : ['Campo 1']
  let field = 0, slot = 0, day = 0
  return raw.map((r, idx) => {
    const match: ScheduledMatch = {
      id: `sm-${idx + 1}`, eventId, categoryId: r.categoryId, groupLabel: r.groupLabel,
      day: days[day % days.length], time: addMinutes(config.dailyStart, slot * slotMinutes),
      field: fields[field], home: r.home, away: r.away,
    }
    field++
    if (field >= fields.length) { field = 0; slot++; if (slot >= config.slotsPerDay) { slot = 0; day++ } }
    return match
  })
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd playfusion-web && npm test`
Expected: PASS — fixtures (4) + existing store (7, with updated counts) + competition (4) all green.

- [ ] **Step 8: Commit**

```bash
cd playfusion-web
git add shared/mock/types.ts shared/mock/seed.ts shared/mock/fixtures.ts shared/mock/fixtures.test.ts shared/mock/store.test.ts
git commit -m "feat: Schedule types, richer seed, and buildFixtures generator (O7) with tests"
```

---

### Task 2: Schedule store functions (TDD)

**Files:**
- Modify: `shared/mock/store.ts`
- Test: `shared/mock/schedule.test.ts` (new)

**Interfaces:**
- Consumes: `load`/`save`, `buildFixtures`, state arrays from Task 1.
- Produces:
  - `getSchedule(eventId: string): Schedule | undefined`
  - `getScheduledMatches(eventId: string): ScheduledMatch[]`
  - `generateSchedule(eventId: string, config: ScheduleConfig): void`
  - `approveSchedule(eventId: string): void`
  - `publishSchedule(eventId: string): void`

- [ ] **Step 1: Write the failing test `shared/mock/schedule.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getSchedule, getScheduledMatches, generateSchedule, approveSchedule, publishSchedule } from './store'
import type { ScheduleConfig } from './types'

const config: ScheduleConfig = { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', slotsPerDay: 8 }

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('schedule store', () => {
  it('starts at NONE with no matches', () => {
    expect(getSchedule('evt-1')?.status).toBe('NONE')
    expect(getScheduledMatches('evt-1')).toHaveLength(0)
  })

  it('generate produces matches from confirmed teams and sets GENERATED', () => {
    generateSchedule('evt-1', config)
    expect(getSchedule('evt-1')?.status).toBe('GENERATED')
    expect(getScheduledMatches('evt-1').length).toBeGreaterThan(0)
  })

  it('regenerate replaces matches (no accumulation) while not approved', () => {
    generateSchedule('evt-1', config)
    const first = getScheduledMatches('evt-1').length
    generateSchedule('evt-1', config)
    expect(getScheduledMatches('evt-1')).toHaveLength(first)
  })

  it('approve then publish advance the status; generate is a no-op once approved', () => {
    generateSchedule('evt-1', config)
    approveSchedule('evt-1')
    expect(getSchedule('evt-1')?.status).toBe('APPROVED')
    generateSchedule('evt-1', { ...config, fields: ['X'] })
    expect(getSchedule('evt-1')?.status).toBe('APPROVED')
    publishSchedule('evt-1')
    expect(getSchedule('evt-1')?.status).toBe('PUBLISHED')
  })
})
```

- [ ] **Step 2: Run it to verify failure**

Run: `cd playfusion-web && npx vitest run shared/mock/schedule.test.ts`
Expected: FAIL — schedule functions not exported.

- [ ] **Step 3: Implement in `shared/mock/store.ts`**

Extend the top type import to include the new types and import the generator:

```ts
import type { Category, Competition, CompetitionConfig, Registration, Schedule, ScheduleConfig, ScheduledMatch, FixtureCategory, State, TournamentEvent } from './types'
import { buildSeed } from './seed'
import { buildFixtures } from './fixtures'
```

Append at the end of the file:

```ts
export function getSchedule(eventId: string): Schedule | undefined {
  return load().schedules.find(s => s.eventId === eventId)
}
export function getScheduledMatches(eventId: string): ScheduledMatch[] {
  return load().scheduledMatches.filter(m => m.eventId === eventId)
}
function ensureSchedule(state: State, eventId: string): Schedule {
  let s = state.schedules.find(x => x.eventId === eventId)
  if (!s) {
    s = { eventId, status: 'NONE', config: { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', slotsPerDay: 8 } }
    state.schedules.push(s)
  }
  return s
}
export function generateSchedule(eventId: string, config: ScheduleConfig): void {
  const state = load()
  const sched = ensureSchedule(state, eventId)
  if (sched.status === 'APPROVED' || sched.status === 'PUBLISHED') { save(state); return }
  const event = state.events.find(e => e.id === eventId)
  if (!event) { save(state); return }
  sched.config = config
  const cats: FixtureCategory[] = state.categories.filter(c => c.eventId === eventId).map(c => {
    const comp = state.competitions.find(k => k.categoryId === c.id)
    const teams = state.registrations
      .filter(r => r.eventId === eventId && r.categoryId === c.id && r.status === 'CONFIRMED')
      .map(r => r.teamName)
    return { id: c.id, name: c.name, format: comp?.format ?? 'ROUND_ROBIN', groupsCount: comp?.groupsCount ?? 1, legs: comp?.legs ?? 'SINGLE', teams }
  })
  const matches = buildFixtures(eventId, event.startDate, event.endDate, config, cats)
  state.scheduledMatches = state.scheduledMatches.filter(m => m.eventId !== eventId).concat(matches)
  sched.status = 'GENERATED'
  save(state)
}
export function approveSchedule(eventId: string): void {
  const state = load()
  const s = state.schedules.find(x => x.eventId === eventId)
  if (s && s.status === 'GENERATED') s.status = 'APPROVED'
  save(state)
}
export function publishSchedule(eventId: string): void {
  const state = load()
  const s = state.schedules.find(x => x.eventId === eventId)
  if (s && s.status === 'APPROVED') s.status = 'PUBLISHED'
  save(state)
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd playfusion-web && npm test`
Expected: PASS — all suites green (fixtures 4, schedule 4, store 7, competition 4).

- [ ] **Step 5: Commit**

```bash
cd playfusion-web
git add shared/mock/store.ts shared/mock/schedule.test.ts
git commit -m "feat: schedule store (generate/approve/publish) with tests (O7)"
```

---

### Task 3: E1 `schedule.html` screen + shared calendar helper + event-hub steps

**Files:**
- Modify: `shared/chrome.ts` (add `renderCalendar`)
- Modify: `shared/ui.css` (calendar styles)
- Modify: `vite.config.ts` (add `schedule` input)
- Create: `apps/organizer/schedule.html`, `apps/organizer/schedule.ts`
- Modify: `apps/organizer/event-hub.ts` (activate the 3 steps)

**Interfaces:**
- Consumes: store schedule fns (Task 2), `getCategories`, `renderOrganizerTopbar`.
- Produces: `renderCalendar(matches: ScheduledMatch[], catName: (id: string) => string): string` in `chrome.ts` (reused by E3 in Task 4).

- [ ] **Step 1: Add `renderCalendar` to `shared/chrome.ts`**

Add the import at the top and the function at the end:

```ts
import type { ScheduledMatch } from './mock/types'
```

```ts
// Calendar rendering — grouped by day, matches sorted by time then field. Shared by E1 and E3.
export function renderCalendar(matches: ScheduledMatch[], catName: (id: string) => string): string {
  if (!matches.length) return `<p class="pf-muted">Nessuna partita in calendario.</p>`
  const days = [...new Set(matches.map(m => m.day))].sort()
  return days.map(day => {
    const rows = matches.filter(m => m.day === day)
      .sort((a, b) => a.time.localeCompare(b.time) || a.field.localeCompare(b.field))
      .map(m => `<li class="pf-match">
        <span class="pf-match__time">${m.time}</span>
        <span class="pf-match__field">${m.field}</span>
        <span class="pf-match__cat">${catName(m.categoryId)} · ${m.groupLabel}</span>
        <span class="pf-match__teams">${m.home} <b>vs</b> ${m.away}</span>
      </li>`).join('')
    return `<div class="pf-calday"><div class="pf-calday__head">${day}</div><ul class="pf-callist">${rows}</ul></div>`
  }).join('')
}
```

- [ ] **Step 2: Add calendar styles to `shared/ui.css`**

Append:

```css
/* ---------- Calendar ---------- */
.pf-calday { margin-bottom: var(--space-5); }
.pf-calday__head { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--color-text-muted); padding-bottom: var(--space-2); border-bottom: 2px solid var(--color-border); margin-bottom: var(--space-2); }
.pf-callist { list-style: none; margin: 0; padding: 0; }
.pf-match { display: grid; grid-template-columns: 56px 110px 1fr; align-items: center; gap: var(--space-3);
  padding: var(--space-3) 0; border-bottom: 1px solid var(--color-border); }
.pf-match:last-child { border-bottom: none; }
.pf-match__time { font-family: var(--font-mono); font-weight: 700; }
.pf-match__field { font-family: var(--font-mono); font-size: 12px; color: var(--color-text-muted); }
.pf-match__cat { font-size: 12px; color: var(--color-text-muted); }
.pf-match__teams { grid-column: 1 / -1; font-weight: 700; }
.pf-match__teams b { color: var(--color-text-muted); font-weight: 600; margin: 0 4px; }
@media (min-width: 560px) { .pf-match { grid-template-columns: 56px 110px 200px 1fr; } .pf-match__teams { grid-column: auto; } }
```

- [ ] **Step 3: Register the page in `vite.config.ts`**

Add after the `competition` entry:

```ts
        schedule: r('apps/organizer/schedule.html'),
```

- [ ] **Step 4: Create `apps/organizer/schedule.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Calendario</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-topbar" id="topbar"></header>
  <main class="pf-container">
    <a class="pf-back" id="back" href="#">← Torna all'evento</a>
    <div class="pf-pagehead"><div class="pf-eyebrow">Setup · Calendario</div><h1>Calendario</h1></div>
    <div class="pf-card" id="config"></div>
    <div class="pf-card" id="actions"></div>
    <div id="calendar"></div>
  </main>
  <script type="module" src="./schedule.ts"></script>
</body>
</html>
```

- [ ] **Step 5: Create `apps/organizer/schedule.ts`**

```ts
import { renderOrganizerTopbar, renderCalendar } from '../../shared/chrome'
import {
  getEvent, getCategories, getSchedule, getScheduledMatches,
  generateSchedule, approveSchedule, publishSchedule,
} from '../../shared/mock/store'
import type { ScheduleConfig } from '../../shared/mock/types'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

const catName = (catId: string) => getCategories(id).find(c => c.id === catId)?.name ?? '—'
const schedule = () => getSchedule(id)!
let fields = [...schedule().config.fields]

function locked(): boolean { const s = schedule().status; return s === 'APPROVED' || s === 'PUBLISHED' }

function renderConfig(): void {
  const cfg = schedule().config
  const dis = locked() ? 'disabled' : ''
  const fieldRows = fields.map((f, i) =>
    `<div class="pf-row" style="gap:var(--space-2);margin-bottom:var(--space-2)">
       <input class="js-field" data-i="${i}" value="${f}" ${dis} style="flex:1;padding:11px var(--space-3);border:1px solid var(--color-border-strong);border-radius:var(--radius-2);font:inherit" />
       ${locked() ? '' : `<button type="button" class="pf-btn js-rmfield" data-i="${i}">×</button>`}
     </div>`).join('')
  document.getElementById('config')!.innerHTML = `
    <h2>Configurazione</h2>
    <label class="pf-field"><span>Campi</span></label>
    <div id="fieldlist">${fieldRows}</div>
    ${locked() ? '' : `<button type="button" class="pf-btn" id="addfield">+ Aggiungi campo</button>`}
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3);margin-top:var(--space-4)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>N. tempi</label><input id="periods" type="number" min="1" value="${cfg.periods}" ${dis} /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Durata tempo (min)</label><input id="periodMinutes" type="number" min="1" value="${cfg.periodMinutes}" ${dis} /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Pausa (min)</label><input id="breakMinutes" type="number" min="0" value="${cfg.breakMinutes}" ${dis} /></div>
    </div>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Inizio giornata</label><input id="dailyStart" type="time" value="${cfg.dailyStart}" ${dis} /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Slot per giornata</label><input id="slotsPerDay" type="number" min="1" value="${cfg.slotsPerDay}" ${dis} /></div>
    </div>
    ${locked() ? '<p class="pf-muted">Calendario approvato: configurazione bloccata.</p>'
      : '<button class="pf-btn pf-btn--primary" id="generate" style="margin-top:var(--space-3)">Genera calendario</button>'}`

  if (!locked()) {
    document.querySelectorAll<HTMLInputElement>('.js-field').forEach(inp =>
      inp.addEventListener('change', () => { fields[Number(inp.dataset.i)] = inp.value.trim() }))
    document.querySelectorAll<HTMLButtonElement>('.js-rmfield').forEach(btn =>
      btn.addEventListener('click', () => { fields.splice(Number(btn.dataset.i), 1); renderConfig() }))
    document.getElementById('addfield')!.addEventListener('click', () => { fields.push(`Campo ${fields.length + 1}`); renderConfig() })
    document.getElementById('generate')!.addEventListener('click', () => {
      const cfgNew: ScheduleConfig = {
        fields: fields.filter(Boolean),
        periods: Number((document.getElementById('periods') as HTMLInputElement).value),
        periodMinutes: Number((document.getElementById('periodMinutes') as HTMLInputElement).value),
        breakMinutes: Number((document.getElementById('breakMinutes') as HTMLInputElement).value),
        dailyStart: (document.getElementById('dailyStart') as HTMLInputElement).value,
        slotsPerDay: Number((document.getElementById('slotsPerDay') as HTMLInputElement).value),
      }
      generateSchedule(id, cfgNew)
      render()
    })
  }
}

function renderActions(): void {
  const s = schedule().status
  const el = document.getElementById('actions')!
  if (s === 'NONE') { el.innerHTML = '<p class="pf-muted">Genera il calendario per procedere.</p>'; return }
  el.innerHTML = `
    <div class="pf-row">
      <div><span class="pf-eyebrow">Stato calendario</span><h2 style="margin-top:4px">${{ GENERATED: 'Generato', APPROVED: 'Approvato', PUBLISHED: 'Pubblicato' }[s]}</h2></div>
      <div style="display:flex;gap:var(--space-2)">
        <button class="pf-btn pf-btn--primary" id="approve" ${s === 'GENERATED' ? '' : 'disabled'}>Approva</button>
        <button class="pf-btn pf-btn--primary" id="publish" ${s === 'APPROVED' ? '' : 'disabled'}>Pubblica</button>
      </div>
    </div>`
  const approve = document.getElementById('approve') as HTMLButtonElement
  const publish = document.getElementById('publish') as HTMLButtonElement
  if (!approve.disabled) approve.addEventListener('click', () => { approveSchedule(id); render() })
  if (!publish.disabled) publish.addEventListener('click', () => { publishSchedule(id); render() })
}

function render(): void {
  renderConfig()
  renderActions()
  document.getElementById('calendar')!.innerHTML =
    schedule().status === 'NONE' ? '' : renderCalendar(getScheduledMatches(id), catName)
}
render()
```

- [ ] **Step 6: Activate the 3 steps in `apps/organizer/event-hub.ts`**

Add `getSchedule` to the store import:

```ts
import { getEvent, getRegistrations, getCategories, getCompetitions, getSchedule } from '../../shared/mock/store'
```

After the `competitionConfigured` line, add:

```ts
const schedStatus = getSchedule(id)?.status ?? 'NONE'
```

Replace the three disabled step objects:

```ts
  { label: 'Genera calendario', done: false, disabled: true },
  { label: 'Approva calendario', done: false, disabled: true },
  { label: 'Pubblica evento', done: false, disabled: true },
```

with:

```ts
  { label: 'Genera calendario', href: `/apps/organizer/schedule.html?event=${id}`, done: schedStatus !== 'NONE' },
  { label: 'Approva calendario', href: `/apps/organizer/schedule.html?event=${id}`, done: schedStatus === 'APPROVED' || schedStatus === 'PUBLISHED' },
  { label: 'Pubblica evento', href: `/apps/organizer/schedule.html?event=${id}`, done: schedStatus === 'PUBLISHED' },
```

- [ ] **Step 7: Verify build and behaviour**

Run: `cd playfusion-web && npm run build`
Expected: build succeeds; `schedule` appears among the entries.

Then `npm run dev`: event hub shows the 3 steps enabled; open "Genera calendario" → config card with fields (add/remove) + params → "Genera calendario" renders a calendar grouped by day; "Approva" locks config and enables "Pubblica"; "Pubblica" sets published.
Expected: no console errors; `npm test` still green.

- [ ] **Step 8: Commit**

```bash
cd playfusion-web
git add shared/chrome.ts shared/ui.css vite.config.ts apps/organizer/schedule.html apps/organizer/schedule.ts apps/organizer/event-hub.ts
git commit -m "feat: O7 E1 schedule screen (config/generate/approve/publish) + calendar helper + hub steps"
```

---

### Task 4: E3 public calendar view

**Files:**
- Modify: `vite.config.ts` (add `calendar` input)
- Create: `apps/public/calendar.html`, `apps/public/calendar.ts`
- Modify: `apps/public/landing.ts` (add "Calendario" link when published)

**Interfaces:**
- Consumes: `renderPublicTopbar`, `renderCalendar` (chrome); `getCategories`, `getEvent`, `getSchedule`, `getScheduledMatches` (store).

- [ ] **Step 1: Register the page in `vite.config.ts`**

Add after the `participants` entry:

```ts
        calendar: r('apps/public/calendar.html'),
```

- [ ] **Step 2: Create `apps/public/calendar.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PlayFusion · Calendario</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-publicbar" id="topbar"></header>
  <main class="pf-container pf-container--narrow">
    <a class="pf-back" id="back" href="#">← Torna all'evento</a>
    <div class="pf-pagehead"><div class="pf-eyebrow" id="eyebrow">Torneo</div><h1>Calendario</h1></div>
    <div class="pf-card" id="calendar"></div>
  </main>
  <script type="module" src="./calendar.ts"></script>
</body>
</html>
```

- [ ] **Step 3: Create `apps/public/calendar.ts`**

```ts
import { renderPublicTopbar, renderCalendar } from '../../shared/chrome'
import { getCategories, getEvent, getSchedule, getScheduledMatches } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)
document.getElementById('eyebrow')!.textContent = getEvent(id)?.name ?? 'Torneo'

const catName = (catId: string) => getCategories(id).find(c => c.id === catId)?.name ?? '—'
const published = getSchedule(id)?.status === 'PUBLISHED'
document.getElementById('calendar')!.innerHTML = published
  ? renderCalendar(getScheduledMatches(id), catName)
  : `<p class="pf-muted">Il calendario non è ancora stato pubblicato.</p>`
```

- [ ] **Step 4: Add the "Calendario" link to `apps/public/landing.ts`**

Add `getSchedule` to the import:

```ts
import { getCategories, getEvent, getRegistrations, getSchedule } from '../../shared/mock/store'
```

Replace the CTA block

```ts
document.getElementById('cta')!.innerHTML = open
  ? `<a class="pf-btn pf-btn--primary pf-btn--lg" href="/apps/public/enroll.html?event=${id}">Iscrivi la squadra</a>`
  : `<p class="pf-muted">Le iscrizioni sono chiuse.</p>`
```

with:

```ts
const published = getSchedule(id)?.status === 'PUBLISHED'
document.getElementById('cta')!.innerHTML = `
  ${open
    ? `<a class="pf-btn pf-btn--primary pf-btn--lg" href="/apps/public/enroll.html?event=${id}">Iscrivi la squadra</a>`
    : `<p class="pf-muted">Le iscrizioni sono chiuse.</p>`}
  ${published ? `<a class="pf-btn pf-btn--lg" style="margin-left:var(--space-2)" href="/apps/public/calendar.html?event=${id}">Calendario</a>` : ''}`
```

- [ ] **Step 5: Verify**

Run: `cd playfusion-web && npm run build` → succeeds with `calendar` entry.
`npm run dev`: with the schedule NOT published, landing shows no "Calendario" link and `calendar.html` shows the "non ancora pubblicato" message. After publishing in E1, the landing shows "Calendario" and the public page lists the same matches.
Expected: no console errors; `npm test` green.

- [ ] **Step 6: Commit**

```bash
cd playfusion-web
git add vite.config.ts apps/public/calendar.html apps/public/calendar.ts apps/public/landing.ts
git commit -m "feat: O7 public calendar view (E3) + landing link when published"
```

---

### Task 5: End-to-end verification + README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Full suite**

Run: `cd playfusion-web && npm test`
Expected: PASS — fixtures (4) + schedule (4) + store (7) + competition (4) all green.

- [ ] **Step 2: Manual walkthrough (acceptance)**

`npm run dev`, then:
1. Hub → "Reset demo".
2. Organizer → Memorial → "Genera calendario". Add a third field, press "Genera calendario" → a calendar grouped by day appears with matches (Categoria · Girone, Casa vs Ospite).
3. Press "Approva" → config locks, "Pubblica" enables. Press "Pubblica".
4. Event-hub → the three steps (Genera / Approva / Pubblica) now show done.
5. Open the public landing (`/apps/public/landing.html?event=evt-1`) → a "Calendario" button appears; open it → the same matches, read-only.
Expected: matches spec success criteria 1–7.

- [ ] **Step 3: Update `README.md`**

Under `## Scope`, add:

```markdown
- **E1 Organizer** calendar (`apps/organizer/schedule.html`) — O7: configure fields + match params, generate a plausible calendar from confirmed teams and the O6 structure, approve, publish.
- **E3 Public** calendar (`apps/public/calendar.html`) — read-only match calendar, shown once the schedule is published.
```

- [ ] **Step 4: Commit**

```bash
cd playfusion-web
git add README.md
git commit -m "docs: note O7 scheduling screens in README"
```

---

## Self-Review

**1. Spec coverage:**
- `buildFixtures` from confirmed teams + O6 groups/legs, field→slot→day placement → Task 1. ✓
- Richer seed so the calendar is non-empty → Task 1 Step 2 (12 registrations, 3 confirmed+ per category). ✓
- Schedule model + generate/approve/publish + regenerate-until-approved → Task 2. ✓
- E1 screen (config fields+params, generate, review, approve, publish) → Task 3. ✓
- Hub 3 steps active with status done-state → Task 3 Step 6. ✓
- Shared calendar render → Task 3 Step 1 (`renderCalendar`), reused Task 4. ✓
- E3 public calendar gated on PUBLISHED + landing link → Task 4. ✓
- Reset restores NONE → seed has `status: 'NONE'`, `scheduledMatches: []`. ✓
- Success criteria 1–7 → Task 5 Step 2. ✓
- Blueprint decisions D-O7-1/D-O7-2 → registered separately after (coordinator note). ✓
- Out of scope (constraint solver, drag&drop, notifications) → absent. ✓

**2. Placeholder scan:** No TBD/TODO; full code in every step.

**3. Type consistency:** `ScheduleConfig` fields (`fields`, `periods`, `periodMinutes`, `breakMinutes`, `dailyStart`, `slotsPerDay`) identical across types, seed, `buildFixtures`, store, and both screens. `ScheduledMatch` fields (`id`, `eventId`, `categoryId`, `groupLabel`, `day`, `time`, `field`, `home`, `away`) consistent across generator, `renderCalendar`, tests. Store fn names (`getSchedule`, `getScheduledMatches`, `generateSchedule`, `approveSchedule`, `publishSchedule`) match between Task 2 Interfaces, implementation, screen imports, event-hub, tests. Status strings (`NONE`/`GENERATED`/`APPROVED`/`PUBLISHED`) consistent throughout. `renderCalendar(matches, catName)` signature matches both call sites (E1 Task 3, E3 Task 4).
