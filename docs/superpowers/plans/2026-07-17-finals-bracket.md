# Finals brackets (Slice B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On calendar generation, also build per-category finals brackets with placeholders (by `finalsType`), schedule them on a global finals date, and show them in E1 and a public E3 page.

**Architecture:** A pure `buildFinals` generator produces placeholder bracket "draws" per `finalsType`; `generateSchedule` schedules them on `config.finalsDate` (global) into `state.finals`. A `renderBracket` helper lists rounds. Shown in E1 (`schedule.html`, per selected category) and E3 `bracket.html` (category tabs, published-gated). No new deps.

**Tech Stack:** Vite MPA, vanilla TypeScript, Vitest + jsdom, plain HTML/CSS.

## Global Constraints

- **No framework**; vanilla TS/HTML/CSS; no backend/network.
- **Deterministic**; no `Math.random`; ids `fm-${n}`.
- **`finalsDate` is global** on `ScheduleConfig` (all categories' finals on that date); per-category fields/params still drive slot placement.
- **Placeholders only** (`Nª Girone X`, `Vincente SF1`) — no real team resolution (that is O8).
- **Per-type simplified brackets** (SPLIT_GROUP_FINALS / SINGLE_GROUP_CROSSOVER / PLACEMENT), plausible, not a tournament engine.
- **Reuse Matchday classes**; bracket list scrolls/wraps without page horizontal scroll; no hardcoded hex in screens.
- **Public bracket gated on `PUBLISHED`.**

---

## File Structure

```
shared/mock/types.ts        # + FinalMatch, FinalDraw; ScheduleConfig gains finalsDate; State gains finals[]
shared/mock/seed.ts         # schedule config + finalsDate; + finals: []
shared/mock/fixtures.ts     # export addMinutes (used by store to schedule finals)
shared/mock/finals.ts       # NEW — buildFinals(gironi, qualifiersPerGroup, finalsType): FinalDraw[]
shared/mock/finals.test.ts  # NEW
shared/mock/store.ts        # generateSchedule builds+schedules finals; getFinals; ensureSchedule default; imports
shared/mock/schedule.test.ts# config literal + finals assertion
shared/chrome.ts            # + renderBracket(finals)
shared/ui.css               # + bracket styles
apps/organizer/schedule.html/.ts   # + finalsDate input; + #finals section (per selected category)
apps/public/bracket.html/.ts       # NEW public page (category tabs)
apps/public/landing.ts      # + "Tabellone" link when published
vite.config.ts              # + bracket input
```

---

### Task 1: Types + seed + `buildFinals` generator (TDD)

**Files:**
- Modify: `shared/mock/types.ts`, `shared/mock/seed.ts`, `shared/mock/fixtures.ts`
- Create: `shared/mock/finals.ts`, `shared/mock/finals.test.ts`

**Interfaces:**
- Produces:
  - `interface FinalDraw { bracketLabel: string; round: string; order: number; home: string; away: string }`
  - `interface FinalMatch extends FinalDraw { id: string; eventId: string; categoryId: string; day: string; time: string; field: string }`
  - `buildFinals(gironi: string[], qualifiersPerGroup: number, finalsType: FinalsType): FinalDraw[]`
  - `addMinutes` exported from `fixtures.ts`.
  - `State.finals: FinalMatch[]`.

- [ ] **Step 1: Add types in `shared/mock/types.ts`**

Append after `StandingRow`:

```ts
export interface FinalDraw {
  bracketLabel: string
  round: string
  order: number
  home: string
  away: string
}

export interface FinalMatch extends FinalDraw {
  id: string
  eventId: string
  categoryId: string
  day: string
  time: string
  field: string
}
```

Extend `State`:

```ts
export interface State {
  events: TournamentEvent[]
  categories: Category[]
  registrations: Registration[]
  competitions: Competition[]
  schedules: Schedule[]
  scheduledMatches: ScheduledMatch[]
  standings: StandingRow[]
  finals: FinalMatch[]
}
```

(Do NOT change `ScheduleConfig` in this task — `finalsDate` is added in Task 2 with its dependents.)

- [ ] **Step 2: Add `finals: []` to the seed in `shared/mock/seed.ts`**

After `standings: [],` add:

```ts
    finals: [],
```

- [ ] **Step 3: Export `addMinutes` from `shared/mock/fixtures.ts`**

Change `function addMinutes(` to `export function addMinutes(` (no other change).

- [ ] **Step 4: Write the failing test `shared/mock/finals.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { buildFinals } from './finals'

describe('buildFinals', () => {
  it('SINGLE_GROUP_CROSSOVER with 4 qualifiers → SF (1v4, 2v3) + Finale', () => {
    const d = buildFinals(['Girone A'], 4, 'SINGLE_GROUP_CROSSOVER')
    expect(d).toEqual([
      { bracketLabel: 'Tabellone', round: 'Semifinali', order: 1, home: '1ª Girone A', away: '4ª Girone A' },
      { bracketLabel: 'Tabellone', round: 'Semifinali', order: 2, home: '2ª Girone A', away: '3ª Girone A' },
      { bracketLabel: 'Tabellone', round: 'Finale', order: 1, home: 'Vincente SF1', away: 'Vincente SF2' },
    ])
  })

  it('SINGLE_GROUP_CROSSOVER with 2 qualifiers → just a Finale', () => {
    const d = buildFinals(['Girone A'], 2, 'SINGLE_GROUP_CROSSOVER')
    expect(d).toEqual([{ bracketLabel: 'Tabellone', round: 'Finale', order: 1, home: '1ª Girone A', away: '2ª Girone A' }])
  })

  it('SPLIT_GROUP_FINALS with 2 groups, Q2 → oro + argento finals', () => {
    const d = buildFinals(['Girone A', 'Girone B'], 2, 'SPLIT_GROUP_FINALS')
    expect(d).toEqual([
      { bracketLabel: 'Tabellone Oro', round: 'Finale', order: 1, home: '1ª Girone A', away: '1ª Girone B' },
      { bracketLabel: 'Tabellone Argento', round: 'Finale', order: 1, home: '2ª Girone A', away: '2ª Girone B' },
    ])
  })

  it('PLACEMENT with 2 groups, Q2 → placement finals by position', () => {
    const d = buildFinals(['Girone A', 'Girone B'], 2, 'PLACEMENT')
    expect(d).toEqual([
      { bracketLabel: 'Piazzamento', round: 'Finale 1º/2º', order: 1, home: '1ª Girone A', away: '1ª Girone B' },
      { bracketLabel: 'Piazzamento', round: 'Finale 3º/4º', order: 2, home: '2ª Girone A', away: '2ª Girone B' },
    ])
  })
})
```

- [ ] **Step 5: Run it to verify it fails**

Run: `cd playfusion-web && npx vitest run shared/mock/finals.test.ts`
Expected: FAIL — cannot resolve `./finals`.

- [ ] **Step 6: Implement `shared/mock/finals.ts`**

```ts
import type { FinalDraw, FinalsType } from './types'

const slot = (pos: number, girone: string) => `${pos}ª ${girone}`

function roundName(n: number): string {
  return n === 2 ? 'Finale' : n === 4 ? 'Semifinali' : n === 8 ? 'Quarti' : n === 16 ? 'Ottavi' : 'Turno'
}
function roundShort(round: string): string {
  return round === 'Finale' ? 'F' : round === 'Semifinali' ? 'SF' : round === 'Quarti' ? 'QF' : round === 'Ottavi' ? 'OF' : 'T'
}

function singleElim(slots: string[], bracketLabel: string): FinalDraw[] {
  const draws: FinalDraw[] = []
  let current = [...slots]
  while (current.length >= 2) {
    const rn = roundName(current.length)
    const rs = roundShort(rn)
    const winners: string[] = []
    let order = 1
    for (let i = 0; i + 1 < current.length; i += 2) {
      draws.push({ bracketLabel, round: rn, order, home: current[i], away: current[i + 1] })
      winners.push(`Vincente ${rs}${order}`)
      order++
    }
    if (current.length % 2 === 1) winners.push(current[current.length - 1])
    current = winners
  }
  return draws
}

export function buildFinals(gironi: string[], qualifiersPerGroup: number, finalsType: FinalsType): FinalDraw[] {
  const Q = Math.max(0, qualifiersPerGroup)
  if (!gironi.length || Q < 1) return []
  if (finalsType === 'SINGLE_GROUP_CROSSOVER') {
    const g = gironi[0]
    if (Q >= 4) return singleElim([slot(1, g), slot(4, g), slot(2, g), slot(3, g)], 'Tabellone')
    if (Q >= 2) return [{ bracketLabel: 'Tabellone', round: 'Finale', order: 1, home: slot(1, g), away: slot(2, g) }]
    return []
  }
  if (finalsType === 'SPLIT_GROUP_FINALS') {
    const out: FinalDraw[] = []
    for (let p = 1; p <= Q; p++) {
      const label = p === 1 ? 'Tabellone Oro' : p === 2 ? 'Tabellone Argento' : `Tabellone ${p}`
      out.push(...singleElim(gironi.map(g => slot(p, g)), label))
    }
    return out
  }
  // PLACEMENT
  const out: FinalDraw[] = []
  const g0 = gironi[0]
  const g1 = gironi[1] ?? gironi[0]
  for (let p = 1; p <= Q; p++) {
    out.push({ bracketLabel: 'Piazzamento', round: `Finale ${2 * p - 1}º/${2 * p}º`, order: p, home: slot(p, g0), away: slot(p, g1) })
  }
  return out
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd playfusion-web && npx vitest run shared/mock/finals.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 8: Commit**

```bash
cd playfusion-web
git add shared/mock/types.ts shared/mock/seed.ts shared/mock/fixtures.ts shared/mock/finals.ts shared/mock/finals.test.ts
git commit -m "feat: FinalMatch/FinalDraw types + buildFinals per-type generator (Slice B)"
```

---

### Task 2: `finalsDate` on config + `generateSchedule` schedules finals + `getFinals` (TDD)

**Files:**
- Modify: `shared/mock/types.ts`, `shared/mock/seed.ts`, `shared/mock/store.ts`, `shared/mock/schedule.test.ts`

**Interfaces:**
- Consumes: `buildFinals` (Task 1), `addMinutes` (Task 1), `FinalMatch`.
- Produces: `ScheduleConfig.finalsDate: string`; `getFinals(eventId): FinalMatch[]`; `generateSchedule` now also (re)creates `state.finals`.

- [ ] **Step 1: Add `finalsDate` to `ScheduleConfig` in `shared/mock/types.ts`**

Change:

```ts
export interface ScheduleConfig {
  dailyStart: string
  slotsPerDay: number
  byCategory: Record<string, CategorySchedule>
}
```

to:

```ts
export interface ScheduleConfig {
  dailyStart: string
  slotsPerDay: number
  finalsDate: string
  byCategory: Record<string, CategorySchedule>
}
```

- [ ] **Step 2: Add `finalsDate` to the seed schedule in `shared/mock/seed.ts`**

In the `schedules` entry's `config`, change the `dailyStart: '09:00', slotsPerDay: 8,` line to:

```ts
        dailyStart: '09:00', slotsPerDay: 8, finalsDate: '2026-08-30',
```

- [ ] **Step 3: Update the config literal in `shared/mock/schedule.test.ts` + add a finals assertion**

Change the `config` literal's first line `dailyStart: '09:00', slotsPerDay: 8,` to:

```ts
  dailyStart: '09:00', slotsPerDay: 8, finalsDate: '2026-08-30',
```

Add `getFinals` to the import from `./store`, and add this test inside the `describe`:

```ts
  it('generate also creates finals on the finals date; reset clears them', () => {
    expect(getFinals('evt-1')).toHaveLength(0)
    generateSchedule('evt-1', config)
    const f = getFinals('evt-1')
    expect(f.length).toBeGreaterThan(0)
    expect(f.every(m => m.day === '2026-08-30')).toBe(true)
    resetDemo()
    expect(getFinals('evt-1')).toHaveLength(0)
  })
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd playfusion-web && npx vitest run shared/mock/schedule.test.ts`
Expected: FAIL — `getFinals` not exported / finals not created.

- [ ] **Step 5: Update `shared/mock/store.ts`**

Extend imports:

```ts
import type { Category, Competition, CompetitionConfig, Registration, Schedule, ScheduleConfig, ScheduledMatch, StandingRow, FinalMatch, FixtureCategory, State, TournamentEvent } from './types'
import { buildFixtures, buildGroups, addMinutes } from './fixtures'
import { buildFinals } from './finals'
```

In `ensureSchedule`, add `finalsDate: ''` to the default config object:

```ts
    s = { eventId, status: 'NONE', config: { dailyStart: '09:00', slotsPerDay: 8, finalsDate: '', byCategory: {} } }
```

In `generateSchedule`, immediately AFTER the standings-population block (the `for (const g of groups) ...` loop) and BEFORE `sched.status = 'GENERATED'`, add:

```ts
  const finalsOut: FinalMatch[] = []
  let fseq = 0
  for (const cat of cats) {
    const comp = state.competitions.find(k => k.categoryId === cat.id)
    if (!comp) continue
    const gironi = buildGroups([cat]).map(g => g.groupLabel)
    const draws = buildFinals(gironi, comp.qualifiersPerGroup, comp.finalsType)
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

Append the getter at the end of the file:

```ts
export function getFinals(eventId: string): FinalMatch[] {
  return load().finals.filter(f => f.eventId === eventId)
}
```

- [ ] **Step 6: Run the full suite**

Run: `cd playfusion-web && npm test`
Expected: PASS — fixtures (6) + finals (4) + schedule (6) + store (7) + competition (4) all green.

- [ ] **Step 7: Commit**

```bash
cd playfusion-web
git add shared/mock/types.ts shared/mock/seed.ts shared/mock/store.ts shared/mock/schedule.test.ts
git commit -m "feat: global finalsDate + generateSchedule schedules finals; getFinals"
```

---

### Task 3: `renderBracket` + styles + E1 finals section + finals-date input

**Files:**
- Modify: `shared/chrome.ts`, `shared/ui.css`, `apps/organizer/schedule.html`, `apps/organizer/schedule.ts`

**Interfaces:**
- Consumes: `getFinals` (store), `FinalMatch` (types).
- Produces: `renderBracket(finals: FinalMatch[]): string` (reused by E3).

- [ ] **Step 1: Add `renderBracket` to `shared/chrome.ts`**

Extend the type import: `import type { ScheduledMatch, StandingRow, FinalMatch } from './mock/types'`. Append:

```ts
// Finals bracket — grouped by bracketLabel → round; placeholder matchups. Shared by E1 and E3.
export function renderBracket(finals: FinalMatch[]): string {
  if (!finals.length) return `<p class="pf-muted">Nessuna fase finale.</p>`
  const labels: string[] = []
  for (const f of finals) if (!labels.includes(f.bracketLabel)) labels.push(f.bracketLabel)
  return labels.map(lb => {
    const lf = finals.filter(f => f.bracketLabel === lb)
    const rounds: string[] = []
    for (const f of lf) if (!rounds.includes(f.round)) rounds.push(f.round)
    const roundsHtml = rounds.map(r => {
      const rows = lf.filter(f => f.round === r).sort((a, b) => a.order - b.order).map(m => `<li class="pf-final">
        <span class="pf-final__meta pf-mono">${m.day} · ${m.time} · ${m.field}</span>
        <span class="pf-final__teams">${m.home} <b>vs</b> ${m.away}</span>
      </li>`).join('')
      return `<div class="pf-final-round"><div class="pf-final-round__head pf-mono">${r}</div><ul class="pf-finallist">${rows}</ul></div>`
    }).join('')
    return `<div class="pf-bracket"><div class="pf-bracket__head"><span class="pf-cat__label">${lb}</span></div>${roundsHtml}</div>`
  }).join('')
}
```

- [ ] **Step 2: Add bracket styles to `shared/ui.css`**

Append:

```css
/* ---------- Finals bracket ---------- */
.pf-bracket { margin-bottom: var(--space-5); }
.pf-bracket__head { margin-bottom: var(--space-2); }
.pf-final-round { margin-bottom: var(--space-4); }
.pf-final-round__head { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-muted);
  padding-bottom: var(--space-2); border-bottom: 2px solid var(--color-border); margin-bottom: var(--space-2); }
.pf-finallist { list-style: none; margin: 0; padding: 0; }
.pf-final { padding: var(--space-3) 0; border-bottom: 1px solid var(--color-border); }
.pf-final:last-child { border-bottom: none; }
.pf-final__meta { display: block; font-size: 12px; color: var(--color-text-muted); }
.pf-final__teams { display: block; font-weight: 700; margin-top: 2px; }
.pf-final__teams b { color: var(--color-text-muted); font-weight: 600; margin: 0 4px; }
```

- [ ] **Step 3: Add `#finals` container in `apps/organizer/schedule.html`**

After `<div id="standings"></div>` add:

```html
    <div id="finals"></div>
```

- [ ] **Step 4: Wire E1 in `apps/organizer/schedule.ts`**

Extend the chrome import to include `renderBracket`, and the store import to include `getFinals`:

```ts
import { renderOrganizerTopbar, renderCalendar, renderStandings, renderTabs, renderBracket } from '../../shared/chrome'
```
```ts
import { getCategories, getSchedule, getScheduledMatches, getStandings, getFinals, generateSchedule, approveSchedule, publishSchedule } from '../../shared/mock/store'
```

In `renderWindow()`, add a "Data finali" field inside the `.pf-row` (after the slotsPerDay field):

```ts
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Data finali</label><input id="finalsDate" type="date" value="${cfg.finalsDate}" ${dis} /></div>
```

In `buildConfig()`, add `finalsDate` to the returned object:

```ts
  return { dailyStart, slotsPerDay, finalsDate: (document.getElementById('finalsDate') as HTMLInputElement).value, byCategory }
```

In `renderViews()`, at the very end (after setting `#standings`), add:

```ts
  document.getElementById('finals')!.innerHTML = getFinals(id).some(f => f.categoryId === selCat)
    ? `<div class="pf-pagehead" style="margin:var(--space-6) 0 var(--space-4)"><div class="pf-eyebrow">Finali</div><h2>Fase finale</h2></div>`
      + renderBracket(getFinals(id).filter(f => f.categoryId === selCat))
    : ''
```

In `render()`, add `document.getElementById('finals')!.innerHTML = ''` to BOTH the `cats.length === 0` branch and the `status === 'NONE'` branch (alongside the existing `#viewtabs`/`#calendar`/`#standings` clears).

- [ ] **Step 5: Verify build + behaviour**

Run: `cd playfusion-web && npm run build`
Expected: succeeds; `npm test` green (27).

`npm run dev`: the window card now has a "Data finali" input; after "Genera calendario", below the standings a "Finali" section shows the selected category's bracket (placeholders like "1ª Girone A vs 1ª Girone B" on the finals date). Switching category updates it.

- [ ] **Step 6: Commit**

```bash
cd playfusion-web
git add shared/chrome.ts shared/ui.css apps/organizer/schedule.html apps/organizer/schedule.ts
git commit -m "feat: renderBracket + E1 finals section + global finals-date input"
```

---

### Task 4: E3 public bracket page + landing link

**Files:**
- Modify: `vite.config.ts`, `apps/public/landing.ts`
- Create: `apps/public/bracket.html`, `apps/public/bracket.ts`

**Interfaces:**
- Consumes: `renderPublicTopbar`, `renderBracket`, `renderTabs` (chrome); `getCategories`, `getEvent`, `getSchedule`, `getFinals` (store).

- [ ] **Step 1: Register the page in `vite.config.ts`**

After the `standings` entry, add:

```ts
        bracket: r('apps/public/bracket.html'),
```

- [ ] **Step 2: Create `apps/public/bracket.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PlayFusion · Tabellone</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-publicbar" id="topbar"></header>
  <main class="pf-container pf-container--narrow">
    <a class="pf-back" id="back" href="#">← Torna all'evento</a>
    <div class="pf-pagehead"><div class="pf-eyebrow" id="eyebrow">Torneo</div><h1>Tabellone finali</h1></div>
    <div id="viewtabs"></div>
    <div class="pf-card" id="bracket"></div>
  </main>
  <script type="module" src="./bracket.ts"></script>
</body>
</html>
```

- [ ] **Step 3: Create `apps/public/bracket.ts`**

```ts
import { renderPublicTopbar, renderBracket, renderTabs } from '../../shared/chrome'
import { getCategories, getEvent, getSchedule, getFinals } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)
document.getElementById('eyebrow')!.textContent = getEvent(id)?.name ?? 'Torneo'

const catName = (catId: string) => getCategories(id).find(c => c.id === catId)?.name ?? '—'
const published = getSchedule(id)?.status === 'PUBLISHED'
let selCat = ''

function presentCats(): string[] {
  const seen: string[] = []
  for (const f of getFinals(id)) if (!seen.includes(f.categoryId)) seen.push(f.categoryId)
  return seen
}
function renderViews(): void {
  const catsPresent = presentCats()
  if (!catsPresent.length) { document.getElementById('bracket')!.innerHTML = renderBracket([]); return }
  if (!catsPresent.includes(selCat)) selCat = catsPresent[0]
  document.getElementById('viewtabs')!.innerHTML = renderTabs(catsPresent.map(c => ({ key: c, label: catName(c) })), selCat)
  document.querySelectorAll<HTMLButtonElement>('#viewtabs .pf-tab').forEach(b =>
    b.addEventListener('click', () => { selCat = b.dataset.key!; renderViews() }))
  document.getElementById('bracket')!.innerHTML = renderBracket(getFinals(id).filter(f => f.categoryId === selCat))
}

if (!published) {
  document.getElementById('bracket')!.innerHTML = `<p class="pf-muted">Il tabellone non è ancora stato pubblicato.</p>`
} else {
  renderViews()
}
```

- [ ] **Step 4: Add the "Tabellone" link to `apps/public/landing.ts`**

In the published block of the `#cta` innerHTML (which already has "Calendario" and "Classifiche" links), add a third link:

```ts
    <a class="pf-btn pf-btn--lg" style="margin-left:var(--space-2)" href="/apps/public/bracket.html?event=${id}">Tabellone</a>
```

(place it right after the existing "Classifiche" link, still inside the `${published ? \`...\` : ''}` template.)

- [ ] **Step 5: Verify**

Run: `cd playfusion-web && npm run build` → succeeds with a `bracket` entry; `npm test` green (27).
`npm run dev`: before publishing, no "Tabellone" link and `bracket.html` says "non ancora pubblicato"; after publishing, the landing shows "Tabellone" and the page shows the bracket with category tabs.

- [ ] **Step 6: Commit**

```bash
cd playfusion-web
git add vite.config.ts apps/public/bracket.html apps/public/bracket.ts apps/public/landing.ts
git commit -m "feat: E3 public finals bracket page + landing link when published"
```

---

### Task 5: End-to-end verification + README

**Files:** `README.md`

- [ ] **Step 1: Full suite + build**

Run: `cd playfusion-web && npm test && npm run build`
Expected: 27 tests pass; build succeeds.

- [ ] **Step 2: Manual walkthrough (acceptance)**

`npm run dev`: Hub → Reset → Organizer → Memorial → set a "Data finali" → Genera calendario. Under the standings, a "Finali" section shows the selected category's bracket with placeholders (the seed uses PLACEMENT → "1ª Girone A vs 1ª Girone B" = Finale 1º/2º, etc.), on the finals date. Change a category's `finalsType` in "Configura competizione" (e.g. to Split-group or Crossover) → regenerate → the bracket shape changes. Approva → Pubblica → landing shows "Tabellone" → the public page shows the bracket with category tabs.
Expected: spec success criteria 1–6.

- [ ] **Step 3: Update `README.md`**

Under `## Scope`, add:

```markdown
- **Finals** — generating the calendar also builds per-category finals brackets with placeholders (by `finalsType`, O6), scheduled on a global finals date; shown in E1 under standings and on the public E3 `bracket.html` once published.
```

- [ ] **Step 4: Commit**

```bash
cd playfusion-web
git add README.md
git commit -m "docs: note finals brackets in README"
```

---

## Self-Review

**1. Spec coverage:**
- `FinalMatch`/`FinalDraw` + `finalsDate` global + `State.finals` → Tasks 1/2. ✓
- `buildFinals` per-type (crossover/split/placement) with placeholders → Task 1 + tests. ✓
- Generate schedules finals on `finalsDate`, per-category fields for time/field → Task 2. ✓
- `getFinals`; reset clears; regenerate replaces → Task 2 + test. ✓
- `renderBracket` (bracketLabel → round list) → Task 3. ✓
- E1 finals section per selected category + finals-date input → Task 3. ✓
- E3 `bracket.html` category tabs, published-gated + landing link → Task 4. ✓
- Success criteria 1–6 → Task 5. ✓
- Blueprint D-O6-4 + O7 finalsDate note → coordinator post-step. ✓
- Out of scope (SVG tree, real advancement, tie-breaks) → absent. ✓

**2. Placeholder scan:** No TBD/TODO; full code in every step (the word "placeholder" here means bracket seed labels, not plan gaps).

**3. Type consistency:** `FinalDraw` fields (`bracketLabel`,`round`,`order`,`home`,`away`) and `FinalMatch extends FinalDraw` (`id`,`eventId`,`categoryId`,`day`,`time`,`field`) identical across types, `buildFinals`, store mapping, `renderBracket`, tests. `buildFinals(gironi, qualifiersPerGroup, finalsType)` signature matches store call + tests. `ScheduleConfig.finalsDate` present in types, seed, schedule.test literal, ensureSchedule default, buildConfig, and consumed in generateSchedule. `getFinals(eventId)` consistent across store, schedule.test, E1, E3. `renderBracket(finals)` matches both call sites. `finalsType` enum values match O6 (`SINGLE_GROUP_CROSSOVER`/`SPLIT_GROUP_FINALS`/`PLACEMENT`).
