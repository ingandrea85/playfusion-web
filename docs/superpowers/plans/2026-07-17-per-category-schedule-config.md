# Per-category schedule config — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make O7 scheduling config per-category — each category has its own fields and match-format params (periods/duration/break) — while keeping the venue window (daily start, slots/day) global; the E1 schedule screen gets a same-for-all / per-category toggle.

**Architecture:** Revision of the existing O7 code. `ScheduleConfig` becomes `{ dailyStart, slotsPerDay, byCategory }`; `buildFixtures` places each category independently on its own fields with its own slot length; `schedule.ts` is reworked to a global-window card + uniform/per-category config (comma-separated fields + params). No framework, no backend.

**Tech Stack:** Vite MPA, vanilla TypeScript, Vitest + jsdom, plain HTML/CSS.

## Global Constraints

- **No framework**; vanilla TS/HTML/CSS. No backend/network.
- **Deterministic**: no `Math.random`; match IDs `sm-${n}` sequential in category→group→pair order.
- **Per-category**: fields + match-format params live in `ScheduleConfig.byCategory[categoryId]`. **Global**: `dailyStart`, `slotsPerDay` only.
- **Plausible generation** (no conflict solver): each category placed independently on its own fields, field→slot→day from `dailyStart`, day wrap with `% days.length`.
- **Reuse Matchday classes** (`.pf-card`, `.pf-field`, `.pf-btn`, `.pf-switch`, `.pf-flash`, `.pf-cat__label`, `.pf-row`, `.pf-pagehead`); no hardcoded hex in screens.
- **Fields input is comma-separated text** (e.g. "Campo A, Campo B") — no per-row add/remove.

---

## File Structure

```
shared/mock/types.ts        # + CategorySchedule; ScheduleConfig → {dailyStart, slotsPerDay, byCategory}; FixtureCategory gains fields/periods/periodMinutes/breakMinutes
shared/mock/seed.ts         # schedules[].config → new shape (byCategory for cat-1/2/3)
shared/mock/fixtures.ts     # buildFixtures rewritten: new signature, per-category placement
shared/mock/fixtures.test.ts# rewritten for the new signature
shared/mock/store.ts        # generateSchedule assembles per-category FixtureCategory; ensureSchedule default config new shape
shared/mock/schedule.test.ts# config literal updated to new shape
apps/organizer/schedule.html/.ts  # reworked: global window card + uniform/per-category config
```

---

### Task 1: Per-category config model, seed, and rewritten `buildFixtures` (TDD)

**Files:**
- Modify: `shared/mock/types.ts`
- Modify: `shared/mock/seed.ts`
- Modify: `shared/mock/fixtures.ts`
- Test: `shared/mock/fixtures.test.ts` (rewrite)

**Interfaces:**
- Produces:
  - `interface CategorySchedule { fields: string[]; periods: number; periodMinutes: number; breakMinutes: number }`
  - `interface ScheduleConfig { dailyStart: string; slotsPerDay: number; byCategory: Record<string, CategorySchedule> }`
  - `FixtureCategory` extended with `fields: string[]; periods: number; periodMinutes: number; breakMinutes: number`
  - `buildFixtures(eventId: string, startDate: string, endDate: string, dailyStart: string, slotsPerDay: number, cats: FixtureCategory[]): ScheduledMatch[]`

- [ ] **Step 1: Update `shared/mock/types.ts`**

Replace the existing `ScheduleConfig` interface with:

```ts
export interface CategorySchedule {
  fields: string[]
  periods: number
  periodMinutes: number
  breakMinutes: number
}

export interface ScheduleConfig {
  dailyStart: string
  slotsPerDay: number
  byCategory: Record<string, CategorySchedule>
}
```

And replace the existing `FixtureCategory` interface with:

```ts
export interface FixtureCategory {
  id: string
  name: string
  format: CompetitionFormat
  groupsCount: number
  legs: Legs
  teams: string[]
  fields: string[]
  periods: number
  periodMinutes: number
  breakMinutes: number
}
```

(`Schedule`, `ScheduledMatch`, `ScheduleStatus` are unchanged.)

- [ ] **Step 2: Update the seed schedule config in `shared/mock/seed.ts`**

Replace the `schedules: [ ... ],` array with:

```ts
    schedules: [
      { eventId: 'evt-1', status: 'NONE', config: {
        dailyStart: '09:00', slotsPerDay: 8,
        byCategory: {
          'cat-1': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
          'cat-2': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
          'cat-3': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
        },
      } },
    ],
```

(`scheduledMatches: []` stays.)

- [ ] **Step 3: Rewrite `shared/mock/fixtures.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { buildFixtures } from './fixtures'
import type { FixtureCategory } from './types'

function cat(over: Partial<FixtureCategory>): FixtureCategory {
  return { id: 'c1', name: 'U10', format: 'GROUPS_KNOCKOUT', groupsCount: 2, legs: 'SINGLE',
    teams: ['A', 'B', 'C', 'D'], fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, ...over }
}

describe('buildFixtures', () => {
  it('splits teams into groups and produces single-leg round-robin pairs on the category fields', () => {
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, [cat({})])
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ home: 'A', away: 'C', groupLabel: 'Girone A', field: 'Campo A', time: '09:00', day: '2026-08-29' })
    expect(m[1]).toMatchObject({ home: 'B', away: 'D', groupLabel: 'Girone B', field: 'Campo B', time: '09:00' })
  })

  it('doubles matches for home-away', () => {
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, [cat({ groupsCount: 1, legs: 'HOME_AWAY', teams: ['A', 'B', 'C'] })])
    expect(m).toHaveLength(6)
    expect(m.filter(x => x.home === 'B' && x.away === 'A')).toHaveLength(1)
  })

  it('treats ROUND_ROBIN as a single group', () => {
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, [cat({ format: 'ROUND_ROBIN', groupsCount: 5, teams: ['A', 'B', 'C'] })])
    expect(m).toHaveLength(3)
    expect(m.every(x => x.groupLabel === 'Girone A')).toBe(true)
  })

  it('uses each category slot length: single field, 4 teams → 3rd match at 09:50', () => {
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, [cat({ groupsCount: 1, fields: ['Solo'] })])
    expect(m).toHaveLength(6)
    expect(m[2]).toMatchObject({ field: 'Solo', time: '09:50' })
  })

  it('places each category independently on its own fields from dailyStart', () => {
    const cats: FixtureCategory[] = [
      cat({ id: 'c1', name: 'U10', format: 'ROUND_ROBIN', groupsCount: 1, teams: ['A', 'B'], fields: ['Campo Nord'], periodMinutes: 15, breakMinutes: 5 }),
      cat({ id: 'c2', name: 'U14', format: 'ROUND_ROBIN', groupsCount: 1, teams: ['X', 'Y'], fields: ['Campo Sud'], periodMinutes: 30, breakMinutes: 10 }),
    ]
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, cats)
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ categoryId: 'c1', field: 'Campo Nord', time: '09:00' })
    expect(m[1]).toMatchObject({ categoryId: 'c2', field: 'Campo Sud', time: '09:00' })
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd playfusion-web && npx vitest run shared/mock/fixtures.test.ts`
Expected: FAIL — `buildFixtures` still has the old signature (arg mismatch / wrong placement).

- [ ] **Step 5: Rewrite `shared/mock/fixtures.ts`**

```ts
import type { FixtureCategory, ScheduledMatch } from './types'

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
  eventId: string, startDate: string, endDate: string,
  dailyStart: string, slotsPerDay: number, cats: FixtureCategory[],
): ScheduledMatch[] {
  const days = dateRange(startDate, endDate)
  const out: ScheduledMatch[] = []
  let seq = 0
  for (const cat of cats) {
    const groups = cat.format === 'ROUND_ROBIN' ? 1 : Math.max(1, cat.groupsCount)
    const buckets: string[][] = Array.from({ length: groups }, () => [])
    cat.teams.forEach((t, i) => buckets[i % groups].push(t))
    const raw: Array<{ groupLabel: string; home: string; away: string }> = []
    buckets.forEach((bucket, gi) => {
      for (const [home, away] of pairs(bucket)) {
        raw.push({ groupLabel: groupLabel(gi), home, away })
        if (cat.legs === 'HOME_AWAY') raw.push({ groupLabel: groupLabel(gi), home: away, away: home })
      }
    })
    const fields = cat.fields.length ? cat.fields : ['Campo 1']
    const slotMinutes = cat.periods * cat.periodMinutes + cat.breakMinutes
    let field = 0, slot = 0, day = 0
    for (const r of raw) {
      out.push({
        id: `sm-${++seq}`, eventId, categoryId: cat.id, groupLabel: r.groupLabel,
        day: days[day % days.length], time: addMinutes(dailyStart, slot * slotMinutes),
        field: fields[field], home: r.home, away: r.away,
      })
      field++
      if (field >= fields.length) { field = 0; slot++; if (slot >= slotsPerDay) { slot = 0; day++ } }
    }
  }
  return out
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd playfusion-web && npx vitest run shared/mock/fixtures.test.ts`
Expected: PASS — 5 tests green. (The store/schedule suites will fail to typecheck at build until Task 2; the fixtures unit test runs independently.)

- [ ] **Step 7: Commit**

```bash
cd playfusion-web
git add shared/mock/types.ts shared/mock/seed.ts shared/mock/fixtures.ts shared/mock/fixtures.test.ts
git commit -m "feat: per-category schedule config model + per-category buildFixtures (O7 revision)"
```

---

### Task 2: `generateSchedule` assembles per-category config

**Files:**
- Modify: `shared/mock/store.ts`
- Modify: `shared/mock/schedule.test.ts`

**Interfaces:**
- Consumes: `buildFixtures` (new signature), `CategorySchedule`, `ScheduleConfig` from Task 1.
- Produces: `generateSchedule(eventId: string, config: ScheduleConfig): void` (signature unchanged; internals updated); `getSchedule`/`getScheduledMatches`/`approveSchedule`/`publishSchedule` unchanged.

- [ ] **Step 1: Update the config literal in `shared/mock/schedule.test.ts`**

Replace the `const config: ScheduleConfig = { ... }` line with:

```ts
const config: ScheduleConfig = {
  dailyStart: '09:00', slotsPerDay: 8,
  byCategory: {
    'cat-1': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
    'cat-2': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
    'cat-3': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
  },
}
```

And in the 4th test (the approved-lock no-op), replace the regenerate call `generateSchedule('evt-1', { ...config, fields: ['X'] })` with:

```ts
    generateSchedule('evt-1', { ...config, dailyStart: '08:00' })
```

(The other three assertions — starts NONE, generate → GENERATED with matches, regenerate replaces — are unchanged and still valid.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd playfusion-web && npx vitest run shared/mock/schedule.test.ts`
Expected: FAIL — `generateSchedule` builds `FixtureCategory` without the new per-category fields / calls `buildFixtures` with the old signature (type error or zero matches).

- [ ] **Step 3: Update `shared/mock/store.ts`**

Replace the existing `ensureSchedule` function with (new default config shape):

```ts
function ensureSchedule(state: State, eventId: string): Schedule {
  let s = state.schedules.find(x => x.eventId === eventId)
  if (!s) {
    s = { eventId, status: 'NONE', config: { dailyStart: '09:00', slotsPerDay: 8, byCategory: {} } }
    state.schedules.push(s)
  }
  return s
}
```

Replace the existing `generateSchedule` function with:

```ts
export function generateSchedule(eventId: string, config: ScheduleConfig): void {
  const state = load()
  const sched = ensureSchedule(state, eventId)
  if (sched.status === 'APPROVED' || sched.status === 'PUBLISHED') { save(state); return }
  const event = state.events.find(e => e.id === eventId)
  if (!event) { save(state); return }
  sched.config = config
  const DEF = { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 }
  const cats: FixtureCategory[] = state.categories.filter(c => c.eventId === eventId).map(c => {
    const comp = state.competitions.find(k => k.categoryId === c.id)
    const teams = state.registrations
      .filter(r => r.eventId === eventId && r.categoryId === c.id && r.status === 'CONFIRMED')
      .map(r => r.teamName)
    const cs = config.byCategory[c.id] ?? DEF
    return {
      id: c.id, name: c.name, format: comp?.format ?? 'ROUND_ROBIN', groupsCount: comp?.groupsCount ?? 1, legs: comp?.legs ?? 'SINGLE', teams,
      fields: cs.fields, periods: cs.periods, periodMinutes: cs.periodMinutes, breakMinutes: cs.breakMinutes,
    }
  })
  const matches = buildFixtures(eventId, event.startDate, event.endDate, config.dailyStart, config.slotsPerDay, cats)
  state.scheduledMatches = state.scheduledMatches.filter(m => m.eventId !== eventId).concat(matches)
  sched.status = 'GENERATED'
  save(state)
}
```

(The type import line already includes `Schedule, ScheduleConfig, ScheduledMatch, FixtureCategory`; `CategorySchedule` is not directly referenced in store.ts so no import change is needed. `getSchedule`, `getScheduledMatches`, `approveSchedule`, `publishSchedule` are unchanged.)

- [ ] **Step 4: Run the full suite**

Run: `cd playfusion-web && npm test`
Expected: PASS — fixtures (5) + schedule (4) + store (7) + competition (4) all green.

- [ ] **Step 5: Commit**

```bash
cd playfusion-web
git add shared/mock/store.ts shared/mock/schedule.test.ts
git commit -m "feat: generateSchedule uses per-category config (O7 revision)"
```

---

### Task 3: Rework the E1 `schedule.html` screen

**Files:**
- Modify: `apps/organizer/schedule.html`
- Modify: `apps/organizer/schedule.ts`

**Interfaces:**
- Consumes: store schedule fns; `CategorySchedule`, `ScheduleConfig` types; `renderOrganizerTopbar`, `renderCalendar`.

- [ ] **Step 1: Rewrite `apps/organizer/schedule.html`**

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
    <div id="flash"></div>
    <div class="pf-card" id="window"></div>
    <div class="pf-card"><label class="pf-switch"><input type="checkbox" id="uniform" /> Stessa config di gioco per tutte le categorie</label></div>
    <div id="configarea"></div>
    <div class="pf-card" id="actions"></div>
    <div id="calendar"></div>
  </main>
  <script type="module" src="./schedule.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Rewrite `apps/organizer/schedule.ts`**

```ts
import { renderOrganizerTopbar, renderCalendar } from '../../shared/chrome'
import { getCategories, getSchedule, getScheduledMatches, generateSchedule, approveSchedule, publishSchedule } from '../../shared/mock/store'
import type { CategorySchedule, ScheduleConfig } from '../../shared/mock/types'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

const cats = getCategories(id)
const catName = (catId: string) => cats.find(c => c.id === catId)?.name ?? '—'
const schedule = () => getSchedule(id)!
const DEF: CategorySchedule = { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 }
const catCfg = (catId: string): CategorySchedule => schedule().config.byCategory[catId] ?? DEF

function locked(): boolean { const s = schedule().status; return s === 'APPROVED' || s === 'PUBLISHED' }
function sameCat(a: CategorySchedule, b: CategorySchedule): boolean {
  return a.fields.join(',') === b.fields.join(',') && a.periods === b.periods && a.periodMinutes === b.periodMinutes && a.breakMinutes === b.breakMinutes
}
function allSame(): boolean {
  const cs = cats.map(c => catCfg(c.id))
  return cs.length > 0 && cs.every(x => sameCat(x, cs[0]))
}
let uniform = allSame()

function flash(msg: string): void { document.getElementById('flash')!.innerHTML = `<div class="pf-flash">✓ ${msg}</div>` }

function catConfigForm(cs: CategorySchedule, dis: string): string {
  return `
    <div class="pf-field"><label>Campi (separati da virgola)</label><input class="js-fields" value="${cs.fields.join(', ')}" ${dis} /></div>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>N. tempi</label><input class="js-periods" type="number" min="1" value="${cs.periods}" ${dis} /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Durata tempo (min)</label><input class="js-periodMinutes" type="number" min="1" value="${cs.periodMinutes}" ${dis} /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Pausa (min)</label><input class="js-breakMinutes" type="number" min="0" value="${cs.breakMinutes}" ${dis} /></div>
    </div>`
}
function readCat(scope: HTMLElement): CategorySchedule {
  return {
    fields: (scope.querySelector('.js-fields') as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean),
    periods: Number((scope.querySelector('.js-periods') as HTMLInputElement).value),
    periodMinutes: Number((scope.querySelector('.js-periodMinutes') as HTMLInputElement).value),
    breakMinutes: Number((scope.querySelector('.js-breakMinutes') as HTMLInputElement).value),
  }
}

function buildConfig(): ScheduleConfig {
  const dailyStart = (document.getElementById('dailyStart') as HTMLInputElement).value
  const slotsPerDay = Number((document.getElementById('slotsPerDay') as HTMLInputElement).value)
  const byCategory: Record<string, CategorySchedule> = {}
  if (uniform) {
    const cs = readCat(document.getElementById('shared')!)
    for (const c of cats) byCategory[c.id] = cs
  } else {
    document.querySelectorAll<HTMLElement>('.js-catcfg').forEach(el => { byCategory[el.dataset.cat!] = readCat(el) })
  }
  return { dailyStart, slotsPerDay, byCategory }
}

function renderWindow(): void {
  const cfg = schedule().config
  const dis = locked() ? 'disabled' : ''
  document.getElementById('window')!.innerHTML = `
    <h2>Finestra oraria</h2>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Inizio giornata</label><input id="dailyStart" type="time" value="${cfg.dailyStart}" ${dis} /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Slot per giornata</label><input id="slotsPerDay" type="number" min="1" value="${cfg.slotsPerDay}" ${dis} /></div>
    </div>`
}

function renderConfigArea(): void {
  const area = document.getElementById('configarea')!
  if (locked()) { area.innerHTML = `<div class="pf-card pf-muted">Calendario approvato: configurazione bloccata.</div>`; return }
  if (uniform) {
    area.innerHTML = `<div class="pf-card" id="shared"><h2>Config di gioco (tutte le categorie)</h2>${catConfigForm(catCfg(cats[0].id), '')}</div>
      <button class="pf-btn pf-btn--primary" id="generate">Genera calendario</button>`
  } else {
    area.innerHTML = cats.map(c =>
      `<div class="pf-card js-catcfg" data-cat="${c.id}"><div class="pf-cat__label" style="margin-bottom:var(--space-3)">${c.name}</div>${catConfigForm(catCfg(c.id), '')}</div>`).join('')
      + `<button class="pf-btn pf-btn--primary" id="generate">Genera calendario</button>`
  }
  document.getElementById('generate')!.addEventListener('click', () => { generateSchedule(id, buildConfig()); render(); flash('Calendario generato') })
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
  const ap = document.getElementById('approve') as HTMLButtonElement
  const pb = document.getElementById('publish') as HTMLButtonElement
  if (!ap.disabled) ap.addEventListener('click', () => { approveSchedule(id); render(); flash('Calendario approvato') })
  if (!pb.disabled) pb.addEventListener('click', () => { publishSchedule(id); render(); flash('Calendario pubblicato') })
}

function render(): void {
  document.getElementById('flash')!.innerHTML = ''
  if (cats.length === 0) {
    document.getElementById('window')!.innerHTML = ''
    document.getElementById('configarea')!.innerHTML = `<div class="pf-card pf-muted">Nessuna categoria. Aggiungile prima nello step Categorie.</div>`
    document.getElementById('actions')!.innerHTML = ''
    return
  }
  renderWindow()
  renderConfigArea()
  renderActions()
  document.getElementById('calendar')!.innerHTML = schedule().status === 'NONE' ? '' : renderCalendar(getScheduledMatches(id), catName)
}

const toggle = document.getElementById('uniform') as HTMLInputElement
toggle.checked = uniform
toggle.addEventListener('change', () => { uniform = toggle.checked; render() })
render()
```

- [ ] **Step 3: Verify build + behaviour**

Run: `cd playfusion-web && npm run build`
Expected: build succeeds.

Then `npm run dev`: open "Genera calendario". Window card (start/slots) on top; toggle ON shows one shared config; uncheck → one config card per category. Set U14 to `Campo Sud` with longer periods, keep others; "Genera calendario" → the calendar shows U14 matches on Campo Sud at its own slot spacing while others use their fields. "Approva" locks config; "Pubblica" publishes. Confirmation flash appears on each action.
Expected: no console errors; `npm test` green (20 tests).

- [ ] **Step 4: Commit**

```bash
cd playfusion-web
git add apps/organizer/schedule.html apps/organizer/schedule.ts
git commit -m "feat: per-category schedule config screen (global window + uniform/per-category toggle)"
```

---

### Task 4: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite**

Run: `cd playfusion-web && npm test`
Expected: PASS — 20 tests (fixtures 5, schedule 4, store 7, competition 4).

- [ ] **Step 2: Manual walkthrough (acceptance)**

`npm run dev`, then: Hub → Reset demo → Organizer → Memorial → "Genera calendario". Uncheck the uniform toggle, give U10 fields "Campo A, Campo B" 2×20', give U14 field "Campo Grande" 2×30'; Genera → verify in the calendar U14 matches are on "Campo Grande" and spaced by its longer slot, U10 on its fields; other categories unaffected when you change only one. Approve → Publish → public landing shows the "Calendario" link → public calendar matches.
Expected: spec success criteria 1–6.

---

## Self-Review

**1. Spec coverage:**
- `ScheduleConfig` per-category (`byCategory`) + global `dailyStart`/`slotsPerDay` → Task 1 types + seed. ✓
- `buildFixtures` per-category independent placement on own fields/slot length → Task 1 Step 5 + tests (independence test). ✓
- `generateSchedule` assembles per-category config → Task 2. ✓
- Screen: global window card + uniform/per-category toggle + comma-separated fields → Task 3. ✓
- Toggle initial state from data equality (`allSame`) → Task 3. ✓
- Save/generate/approve/publish feedback (flash) → Task 3 (reuses `.pf-flash`). ✓
- Success criteria 1–6 → Task 4 Step 2. ✓
- Blueprint D-O7-1/D-O7-2 revision → coordinator post-step (not a code task). ✓
- Out of scope (conflict prevention, per-category window) → absent. ✓

**2. Placeholder scan:** No TBD/TODO; full code in every step.

**3. Type consistency:** `CategorySchedule` fields (`fields`, `periods`, `periodMinutes`, `breakMinutes`) identical across types, seed, `buildFixtures` (via `FixtureCategory`), store assembly, screen `catConfigForm`/`readCat`, and tests. `ScheduleConfig` = `{ dailyStart, slotsPerDay, byCategory }` consistent across types, seed, store, schedule.test, and `buildConfig`. `buildFixtures` new signature `(eventId, startDate, endDate, dailyStart, slotsPerDay, cats)` matches its one caller (store `generateSchedule`) and the tests. Status strings and store fn names unchanged from the prior O7 round.
