# Gironi editor (B1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make gironi an explicit, editable composition — an E1 "Componi gironi" editor (draw / move teams / lock) whose stored assignment drives fixtures, standings and finals.

**Architecture:** Grouping moves out of `buildFixtures` into a `resolveGroups` step (explicit `GroupSlot`s if present, else auto `splitIntoGroups`). `buildFixtures` takes pre-resolved groups. `generateSchedule` resolves once per category and feeds fixtures/standings/finals. A new `gironi.html` editor edits the slots with select controls (mobile-friendly). No framework.

**Tech Stack:** Vite MPA, vanilla TypeScript, Vitest + jsdom, plain HTML/CSS.

## Global Constraints

- **No framework**; vanilla TS/HTML/CSS; no backend/network; deterministic.
- **`resolveGroups` is the single grouping source**: explicit `GroupSlot`s when present, else `splitIntoGroups` (auto). Auto behaviour must stay identical to today when nothing is composed.
- **Select/tap controls, no drag&drop.**
- **`groupsLocked` (per Competition)** blocks draw/move.
- **Reuse Matchday classes**; no hardcoded hex in screens.

---

## File Structure

```
shared/mock/types.ts        # + GroupSlot, ScheduledCategory; Competition + groupsLocked; State + groupSlots
shared/mock/seed.ts         # competitions rows + groupsLocked:false; + groupSlots:[]
shared/mock/fixtures.ts     # export splitIntoGroups; buildFixtures takes ScheduledCategory[] (pre-resolved groups)
shared/mock/fixtures.test.ts# buildFixtures tests rewritten to pass groups directly
shared/mock/store.ts        # resolveGroups; generateSchedule rewired; drawGroups/moveTeam/setGroupsLocked/getGroupSlots
shared/mock/gironi.test.ts  # NEW — tests for draw/move/lock + resolution
apps/organizer/gironi.html/.ts   # NEW editor screen
apps/organizer/event-hub.ts # + "Componi gironi" step
vite.config.ts              # + gironi input
```

---

### Task 1: Types + refactor `buildFixtures` to consume resolved groups (TDD)

**Files:**
- Modify: `shared/mock/types.ts`, `shared/mock/seed.ts`, `shared/mock/fixtures.ts`, `shared/mock/fixtures.test.ts`

**Interfaces:**
- Produces:
  - `interface GroupSlot { eventId: string; categoryId: string; team: string; groupLabel: string }`
  - `interface ScheduledCategory { id: string; legs: Legs; fields: string[]; periods: number; periodMinutes: number; breakMinutes: number; groups: Array<{ groupLabel: string; teams: string[] }> }`
  - `Competition.groupsLocked: boolean`; `State.groupSlots: GroupSlot[]`
  - `splitIntoGroups(cat: { format: CompetitionFormat; groupsCount: number; teams: string[] })` exported
  - `buildFixtures(eventId, startDate, endDate, dailyStart, slotsPerDay, cats: ScheduledCategory[]): ScheduledMatch[]`

- [ ] **Step 1: Update `shared/mock/types.ts`**

Add to the `Competition` interface a `groupsLocked: boolean` field:

```ts
export interface Competition extends CompetitionConfig {
  id: string
  eventId: string
  categoryId: string
  groupsLocked: boolean
}
```

Append:

```ts
export interface GroupSlot {
  eventId: string
  categoryId: string
  team: string
  groupLabel: string
}

export interface ScheduledCategory {
  id: string
  legs: Legs
  fields: string[]
  periods: number
  periodMinutes: number
  breakMinutes: number
  groups: Array<{ groupLabel: string; teams: string[] }>
}
```

Extend `State` with `groupSlots: GroupSlot[]` (add the line after `finals: FinalMatch[]`).

- [ ] **Step 2: Update the seed in `shared/mock/seed.ts`**

Add `groupsLocked: false` to each of the three `competitions` rows (append it inside each object). After `finals: [],` add:

```ts
    groupSlots: [],
```

- [ ] **Step 3: Rewrite the `buildFixtures` tests in `shared/mock/fixtures.test.ts`**

Replace the whole file with:

```ts
import { describe, expect, it } from 'vitest'
import { buildFixtures, buildGroups } from './fixtures'
import type { ScheduledCategory } from './types'

function sc(over: Partial<ScheduledCategory>): ScheduledCategory {
  return { id: 'c1', legs: 'SINGLE', fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10,
    groups: [{ groupLabel: 'Girone A', teams: ['A', 'C'] }, { groupLabel: 'Girone B', teams: ['B', 'D'] }], ...over }
}

describe('buildFixtures (pre-resolved groups)', () => {
  it('round-robin pairs per group, placed on the fields', () => {
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, [sc({})])
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ home: 'A', away: 'C', groupLabel: 'Girone A', field: 'Campo A', time: '09:00', day: '2026-08-29' })
    expect(m[1]).toMatchObject({ home: 'B', away: 'D', groupLabel: 'Girone B', field: 'Campo B', time: '09:00' })
  })

  it('home-away doubles each pair', () => {
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, [sc({ legs: 'HOME_AWAY', groups: [{ groupLabel: 'Girone A', teams: ['A', 'B', 'C'] }] })])
    expect(m).toHaveLength(6)
    expect(m.filter(x => x.home === 'B' && x.away === 'A')).toHaveLength(1)
  })

  it('single field advances the slot: 2nd match at 09:50', () => {
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, [sc({ fields: ['Solo'], groups: [{ groupLabel: 'Girone A', teams: ['A', 'B', 'C', 'D'] }] })])
    expect(m).toHaveLength(6)
    expect(m[1]).toMatchObject({ field: 'Solo', time: '09:50' })
  })

  it('places each category independently on its own fields', () => {
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, [
      sc({ id: 'c1', fields: ['Campo Nord'], groups: [{ groupLabel: 'Girone A', teams: ['A', 'B'] }] }),
      sc({ id: 'c2', fields: ['Campo Sud'], periodMinutes: 30, groups: [{ groupLabel: 'Girone A', teams: ['X', 'Y'] }] }),
    ])
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ categoryId: 'c1', field: 'Campo Nord', time: '09:00' })
    expect(m[1]).toMatchObject({ categoryId: 'c2', field: 'Campo Sud', time: '09:00' })
  })

  it('buildGroups still auto-splits by i % groups (used by the auto path)', () => {
    expect(buildGroups([{ id: 'c1', name: 'U10', format: 'GROUPS_KNOCKOUT', groupsCount: 2, legs: 'SINGLE', teams: ['A', 'B', 'C', 'D'], fields: [], periods: 2, periodMinutes: 20, breakMinutes: 10 }]))
      .toEqual([
        { categoryId: 'c1', groupLabel: 'Girone A', teams: ['A', 'C'] },
        { categoryId: 'c1', groupLabel: 'Girone B', teams: ['B', 'D'] },
      ])
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd playfusion-web && npx vitest run shared/mock/fixtures.test.ts`
Expected: FAIL — `buildFixtures` still expects the old `FixtureCategory` shape.

- [ ] **Step 5: Refactor `shared/mock/fixtures.ts`**

Export `splitIntoGroups` and narrow its param; replace `buildFixtures` to iterate pre-resolved `cat.groups`. The final file body:

```ts
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
        day: days[day % days.length], time: addMinutes(dailyStart, slot * slotMinutes), field: fields[field], home: r.home, away: r.away })
      field++
      if (field >= fields.length) { field = 0; slot++; if (slot >= slotsPerDay) { slot = 0; day++ } }
    }
  }
  return out
}
```

- [ ] **Step 6: Run the fixtures test**

Run: `cd playfusion-web && npx vitest run shared/mock/fixtures.test.ts`
Expected: PASS — 5 tests. (The whole suite/build stays red until Task 2 rewires `generateSchedule` — expected.)

- [ ] **Step 7: Commit**

```bash
cd playfusion-web
git add shared/mock/types.ts shared/mock/seed.ts shared/mock/fixtures.ts shared/mock/fixtures.test.ts
git commit -m "refactor: buildFixtures consumes pre-resolved groups; GroupSlot/ScheduledCategory types"
```

---

### Task 2: `resolveGroups` + rewire `generateSchedule` + gironi store ops (TDD)

**Files:**
- Modify: `shared/mock/store.ts`
- Test: `shared/mock/gironi.test.ts` (new)

**Interfaces:**
- Consumes: `splitIntoGroups`, `addMinutes`, `buildFixtures`, `buildFinals`, `GroupSlot`, `ScheduledCategory` (Tasks 1 + earlier).
- Produces: `getGroupSlots(eventId): GroupSlot[]`, `drawGroups(eventId, categoryId): void`, `moveTeam(eventId, categoryId, team, toGroupLabel): void`, `setGroupsLocked(categoryId, locked): void`.

- [ ] **Step 1: Write the failing test `shared/mock/gironi.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getGroupSlots, drawGroups, moveTeam, setGroupsLocked, generateSchedule, getScheduledMatches } from './store'
import type { ScheduleConfig } from './types'

const config: ScheduleConfig = {
  dailyStart: '09:00', slotsPerDay: 8, finalsDate: '2026-08-30',
  byCategory: {
    'cat-1': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
    'cat-2': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
    'cat-3': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
  },
}

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('gironi composition', () => {
  it('drawGroups seeds one slot per confirmed team, across groupsCount gironi', () => {
    drawGroups('evt-1', 'cat-1')
    const slots = getGroupSlots('evt-1').filter(s => s.categoryId === 'cat-1')
    expect(slots.length).toBeGreaterThan(0)
    expect(new Set(slots.map(s => s.groupLabel))).toEqual(new Set(['Girone A', 'Girone B']))
  })

  it('moveTeam changes a team girone', () => {
    drawGroups('evt-1', 'cat-1')
    const t = getGroupSlots('evt-1').find(s => s.categoryId === 'cat-1')!
    moveTeam('evt-1', 'cat-1', t.team, 'Girone B')
    expect(getGroupSlots('evt-1').find(s => s.categoryId === 'cat-1' && s.team === t.team)!.groupLabel).toBe('Girone B')
  })

  it('locked category refuses draw and move', () => {
    drawGroups('evt-1', 'cat-1')
    setGroupsLocked('cat-1', true)
    const before = getGroupSlots('evt-1').filter(s => s.categoryId === 'cat-1').map(s => `${s.team}:${s.groupLabel}`).sort()
    moveTeam('evt-1', 'cat-1', before[0].split(':')[0], 'Girone B')
    const after = getGroupSlots('evt-1').filter(s => s.categoryId === 'cat-1').map(s => `${s.team}:${s.groupLabel}`).sort()
    expect(after).toEqual(before)
  })

  it('generateSchedule uses the explicit composition when slots exist', () => {
    // put ALL cat-1 confirmed teams in Girone A → single round-robin → all matches share Girone A
    drawGroups('evt-1', 'cat-1')
    for (const s of getGroupSlots('evt-1').filter(s => s.categoryId === 'cat-1')) moveTeam('evt-1', 'cat-1', s.team, 'Girone A')
    generateSchedule('evt-1', config)
    const cat1 = getScheduledMatches('evt-1').filter(m => m.categoryId === 'cat-1')
    expect(cat1.length).toBeGreaterThan(0)
    expect(cat1.every(m => m.groupLabel === 'Girone A')).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd playfusion-web && npx vitest run shared/mock/gironi.test.ts`
Expected: FAIL — gironi ops not exported / `generateSchedule` not resolving.

- [ ] **Step 3: Update `shared/mock/store.ts`**

Extend imports:

```ts
import type { Category, Competition, CompetitionConfig, Registration, Schedule, ScheduleConfig, ScheduledMatch, ScheduledCategory, StandingRow, FinalMatch, GroupSlot, FixtureCategory, State, TournamentEvent } from './types'
import { buildFixtures, buildGroups, splitIntoGroups, addMinutes } from './fixtures'
import { buildFinals } from './finals'
```

Add the resolver near the other helpers (after `ensureSchedule`):

```ts
function resolveGroups(state: State, eventId: string, cat: FixtureCategory): Array<{ groupLabel: string; teams: string[] }> {
  const slots = state.groupSlots.filter(s => s.eventId === eventId && s.categoryId === cat.id)
  if (slots.length) {
    const labels = [...new Set(slots.map(s => s.groupLabel))].sort()
    return labels.map(lb => ({ groupLabel: lb, teams: slots.filter(s => s.groupLabel === lb).map(s => s.team) }))
  }
  return splitIntoGroups(cat)
}
```

In `generateSchedule`, after the `cats` (FixtureCategory[]) array is built and BEFORE `buildFixtures`, insert the resolution and replace the fixtures/standings/finals derivation. Replace the block that currently starts at `const matches = buildFixtures(...)` through the finals block with:

```ts
  const resolved = cats.map(cat => ({ cat, groups: resolveGroups(state, eventId, cat) }))
  const schedCats: ScheduledCategory[] = resolved.map(({ cat, groups }) => ({
    id: cat.id, legs: cat.legs, fields: cat.fields, periods: cat.periods, periodMinutes: cat.periodMinutes, breakMinutes: cat.breakMinutes, groups,
  }))
  const matches = buildFixtures(eventId, event.startDate, event.endDate, config.dailyStart, config.slotsPerDay, schedCats)
  state.scheduledMatches = state.scheduledMatches.filter(m => m.eventId !== eventId).concat(matches)

  state.standings = state.standings.filter(s => s.eventId !== eventId)
  for (const { cat, groups } of resolved) for (const g of groups) for (const team of g.teams) {
    state.standings.push({ eventId, categoryId: cat.id, groupLabel: g.groupLabel, team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 })
  }

  const finalsOut: FinalMatch[] = []
  let fseq = 0
  for (const { cat, groups } of resolved) {
    const comp = state.competitions.find(k => k.categoryId === cat.id)
    if (!comp) continue
    const draws = buildFinals(groups.map(g => g.groupLabel), comp.qualifiersPerGroup, comp.finalsType)
    if (!draws.length) continue
    const fields = cat.fields.length ? cat.fields : ['Campo 1']
    const slotMinutes = cat.periods * cat.periodMinutes + cat.breakMinutes
    let fi = 0, si = 0
    for (const d of draws) {
      finalsOut.push({ id: `fm-${++fseq}`, eventId, categoryId: cat.id, bracketLabel: d.bracketLabel, round: d.round, order: d.order, home: d.home, away: d.away, day: config.finalsDate, time: addMinutes(config.dailyStart, si * slotMinutes), field: fields[fi] })
      fi++; if (fi >= fields.length) { fi = 0; si++ }
    }
  }
  state.finals = state.finals.filter(f => f.eventId !== eventId).concat(finalsOut)
```

(Delete the old standalone `buildGroups(cats)` standings loop and the old finals loop that this replaces. `buildGroups` remains imported/used only where still referenced — if now unused in store, drop it from the import list to avoid an unused import.)

Append the gironi ops at the end of the file:

```ts
export function getGroupSlots(eventId: string): GroupSlot[] {
  return load().groupSlots.filter(s => s.eventId === eventId)
}
export function drawGroups(eventId: string, categoryId: string): void {
  const state = load()
  const comp = state.competitions.find(k => k.categoryId === categoryId)
  if (!comp || comp.groupsLocked) { save(state); return }
  const teams = state.registrations.filter(r => r.eventId === eventId && r.categoryId === categoryId && r.status === 'CONFIRMED').map(r => r.teamName)
  const groups = splitIntoGroups({ format: comp.format, groupsCount: comp.groupsCount, teams })
  state.groupSlots = state.groupSlots.filter(s => !(s.eventId === eventId && s.categoryId === categoryId))
  for (const g of groups) for (const team of g.teams) state.groupSlots.push({ eventId, categoryId, team, groupLabel: g.groupLabel })
  save(state)
}
export function moveTeam(eventId: string, categoryId: string, team: string, toGroupLabel: string): void {
  const state = load()
  const comp = state.competitions.find(k => k.categoryId === categoryId)
  if (comp?.groupsLocked) { save(state); return }
  const s = state.groupSlots.find(x => x.eventId === eventId && x.categoryId === categoryId && x.team === team)
  if (s) s.groupLabel = toGroupLabel
  save(state)
}
export function setGroupsLocked(categoryId: string, locked: boolean): void {
  const state = load()
  const comp = state.competitions.find(k => k.categoryId === categoryId)
  if (comp) comp.groupsLocked = locked
  save(state)
}
```

- [ ] **Step 4: Run the full suite**

Run: `cd playfusion-web && npm test`
Expected: PASS — fixtures (5) + gironi (4) + finals (4) + schedule (6) + store (7) + competition (4) all green.

- [ ] **Step 5: Commit**

```bash
cd playfusion-web
git add shared/mock/store.ts shared/mock/gironi.test.ts
git commit -m "feat: resolveGroups + explicit gironi ops (draw/move/lock); generation derives from composition"
```

---

### Task 3: E1 "Componi gironi" editor screen + hub step

**Files:**
- Modify: `vite.config.ts`, `apps/organizer/event-hub.ts`
- Create: `apps/organizer/gironi.html`, `apps/organizer/gironi.ts`

**Interfaces:**
- Consumes: store gironi ops + `getCategories`, `getCompetition`, `getGroupSlots`; `renderOrganizerTopbar`, `renderTabs`.

- [ ] **Step 1: Register the page in `vite.config.ts`**

After the `schedule` entry add:

```ts
        gironi: r('apps/organizer/gironi.html'),
```

- [ ] **Step 2: Create `apps/organizer/gironi.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Gironi</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-topbar" id="topbar"></header>
  <main class="pf-container">
    <a class="pf-back" id="back" href="#">← Torna all'evento</a>
    <div class="pf-pagehead"><div class="pf-eyebrow">Setup · Gironi</div><h1>Componi gironi</h1></div>
    <div id="cattabs"></div>
    <div id="content"></div>
  </main>
  <script type="module" src="./gironi.ts"></script>
</body>
</html>
```

- [ ] **Step 3: Create `apps/organizer/gironi.ts`**

```ts
import { renderOrganizerTopbar, renderTabs } from '../../shared/chrome'
import { getCategories, getCompetition, getGroupSlots, drawGroups, moveTeam, setGroupsLocked } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

const cats = getCategories(id)
let selCat = cats[0]?.id ?? ''

function gironiLabels(catId: string): string[] {
  const comp = getCompetition(catId)
  const n = !comp || comp.format === 'ROUND_ROBIN' ? 1 : Math.max(1, comp.groupsCount)
  return Array.from({ length: n }, (_, i) => `Girone ${String.fromCharCode(65 + i)}`)
}

function render(): void {
  document.getElementById('cattabs')!.innerHTML = renderTabs(cats.map(c => ({ key: c.id, label: c.name })), selCat)
  document.querySelectorAll<HTMLButtonElement>('#cattabs .pf-tab').forEach(b =>
    b.addEventListener('click', () => { selCat = b.dataset.key!; render() }))

  const comp = getCompetition(selCat)
  const locked = !!comp?.groupsLocked
  const labels = gironiLabels(selCat)
  const slots = getGroupSlots(id).filter(s => s.categoryId === selCat)
  const content = document.getElementById('content')!

  const toolbar = `<div class="pf-card"><div class="pf-row">
      <button class="pf-btn pf-btn--primary" id="draw" ${locked ? 'disabled' : ''}>Sorteggia gironi</button>
      <label class="pf-switch"><input type="checkbox" id="lock" ${locked ? 'checked' : ''} /> Blocca gironi</label>
    </div></div>`

  if (!slots.length) {
    content.innerHTML = toolbar + `<div class="pf-card pf-muted">Nessun girone: premi "Sorteggia gironi" per comporli automaticamente, poi sposta le squadre.</div>`
  } else {
    const cols = labels.map(lb => {
      const teams = slots.filter(s => s.groupLabel === lb)
      const rows = teams.map(t => `<li class="pf-row" style="justify-content:space-between;padding:var(--space-2) 0">
        <span class="pf-teamname">${t.team}</span>
        <select class="js-move" data-team="${t.team}" ${locked ? 'disabled' : ''}>
          ${labels.map(l => `<option value="${l}"${l === lb ? ' selected' : ''}>${l}</option>`).join('')}
        </select></li>`).join('')
      return `<div class="pf-card"><div class="pf-cat__label" style="margin-bottom:var(--space-3)">${lb}</div><ul style="list-style:none;margin:0;padding:0">${rows || '<li class="pf-muted">Vuoto</li>'}</ul></div>`
    }).join('')
    content.innerHTML = toolbar + `<div class="pf-catlist">${cols}</div>`
  }

  const draw = document.getElementById('draw') as HTMLButtonElement | null
  if (draw && !draw.disabled) draw.addEventListener('click', () => { drawGroups(id, selCat); render() })
  const lock = document.getElementById('lock') as HTMLInputElement
  lock.addEventListener('change', () => { setGroupsLocked(selCat, lock.checked); render() })
  document.querySelectorAll<HTMLSelectElement>('.js-move').forEach(sel =>
    sel.addEventListener('change', () => { moveTeam(id, selCat, sel.dataset.team!, sel.value); render() }))
}
render()
```

- [ ] **Step 4: Add the hub step in `apps/organizer/event-hub.ts`**

Add `getGroupSlots` to the store import. After the `competitionConfigured` line add:

```ts
const gironiComposed = cats.length > 0 && cats.every(c => getGroupSlots(id).some(s => s.categoryId === c.id))
```

Insert this step in the `steps` array between `'Configura competizione'` and `'Genera calendario'`:

```ts
  { label: 'Componi gironi', href: `/apps/organizer/gironi.html?event=${id}`, done: gironiComposed },
```

- [ ] **Step 5: Verify build + behaviour**

Run: `cd playfusion-web && npm run build`
Expected: succeeds (`gironi` entry present); `npm test` green (30).

`npm run dev`: event hub shows "Componi gironi"; open it → category tabs; "Sorteggia gironi" fills the gironi; a team's "Sposta in…" select moves it to another girone; "Blocca gironi" disables the controls. Then "Genera calendario" produces fixtures/standings/finals matching the composition.

- [ ] **Step 6: Commit**

```bash
cd playfusion-web
git add vite.config.ts apps/organizer/event-hub.ts apps/organizer/gironi.html apps/organizer/gironi.ts
git commit -m "feat: E1 'Componi gironi' editor (draw/move/lock) + hub step"
```

---

### Task 4: End-to-end verification + README

**Files:** `README.md`

- [ ] **Step 1: Full suite + build**

Run: `cd playfusion-web && npm test && npm run build`
Expected: 30 tests pass; build succeeds.

- [ ] **Step 2: Manual walkthrough (acceptance)**

`npm run dev`: Hub → Reset → Organizer → Memorial → Configura competizione → **Componi gironi**: Sorteggia U10, move a team from Girone A to Girone B, then Genera calendario → the calendar/standings/finals for U10 reflect the moved team's girone. Lock U10 → draw/move disabled.
Expected: spec success criteria 1–5.

- [ ] **Step 3: Update `README.md`**

Under `## Scope`, add:

```markdown
- **Gironi editor** (`apps/organizer/gironi.html`) — explicit group composition (O6): draw, move teams between gironi (select controls), lock; fixtures/standings/finals derive from it.
```

- [ ] **Step 4: Commit**

```bash
cd playfusion-web
git add README.md
git commit -m "docs: note gironi editor in README"
```

---

## Self-Review

**1. Spec coverage:**
- `GroupSlot` + `groupsLocked` + `State.groupSlots` → Task 1. ✓
- `resolveGroups` single source (explicit else auto) → Task 2. ✓
- `buildFixtures` consumes resolved groups; standings + finals from resolved groups → Tasks 1/2. ✓
- draw / move / lock store ops → Task 2 + tests. ✓
- E1 editor (tabs, draw, move select, lock) + hub step → Task 3. ✓
- Auto path unchanged when nothing composed → Task 2 (`resolveGroups` falls back to `splitIntoGroups`); fixtures tests confirm placement. ✓
- Blueprint D-O6-5 → coordinator post-step. ✓
- Success criteria 1–5 → Task 4. ✓

**2. Placeholder scan:** No TBD/TODO; full code in every step.

**3. Type consistency:** `GroupSlot` fields identical across types, store ops, tests. `ScheduledCategory` (`id,legs,fields,periods,periodMinutes,breakMinutes,groups`) matches buildFixtures signature + generateSchedule construction + fixtures tests. `Competition.groupsLocked` added in types + seed + read in store ops + editor. `splitIntoGroups({format,groupsCount,teams})` narrow param used by buildGroups, resolveGroups, drawGroups. Store op names (`getGroupSlots/drawGroups/moveTeam/setGroupsLocked`) consistent across store, gironi.test, editor, event-hub. `getCompetition` reused (exists from round 2).
