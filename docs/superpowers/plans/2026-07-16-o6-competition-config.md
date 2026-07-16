# O6 "Configura competizione" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the E1 "Configura competizione" (O6) mockup screen: per-category competition structure (format, legs, groups, finals) with a "same for all / per-category" toggle, backed by a `Competition` record per category in the mock store.

**Architecture:** Extends the existing Vite MPA mockup (`playfusion-web`). A new `Competition` type + store functions hold one competition config per category (localStorage). A new screen `apps/organizer/competition.html` renders either a single shared form (uniform) or one editable form per category, with conditional fields by format. A new enabled step in the event-hub checklist links to it. No framework, no backend.

**Tech Stack:** Vite MPA, vanilla TypeScript, Vitest + jsdom, plain HTML/CSS.

## Global Constraints

- **No framework** — vanilla TS/HTML/CSS only.
- **No backend / no network** — state is seed JSON + `localStorage`. No `fetch`.
- **Styling via design tokens** — use `var(--…)` from `shared/tokens.css`; reuse existing `ui.css` classes; no hardcoded hex in screens.
- **Deterministic IDs** — `comp-${n+1}` from array length; never `Math.random`.
- **Category stays a bare label** — competition config lives on a separate `Competition` record (one per category), never on `Category` (Blueprint O6, not O3).
- **Scope** — competition STRUCTURE only. Out of scope: fields/campi, slots, calendar (O7); match periods/duration/break. These are NOT added here.
- **Match the "Matchday" look** — reuse `.pf-pagehead`, `.pf-card`, `.pf-field`, `.pf-btn`, `.pf-cat__label`, `.pf-row` already defined.

---

## File Structure

```
shared/mock/types.ts          # + CompetitionFormat, Legs, FinalsType, CompetitionConfig, Competition; State gains competitions[]
shared/mock/seed.ts           # + competitions[] (3 seed rows, identical defaults)
shared/mock/store.ts          # + getCompetition(s), upsertCompetition, applyToAllCategories
shared/mock/competition.test.ts  # NEW — Vitest tests for the competition store functions
vite.config.ts                # + competition html input
shared/ui.css                 # + .pf-switch (toggle) styling
apps/organizer/competition.html   # NEW screen
apps/organizer/competition.ts     # NEW screen logic
apps/organizer/event-hub.ts   # + "Configura competizione" step (enabled) before the O7 disabled steps
```

---

### Task 1: Competition model, seed and store functions (TDD)

**Files:**
- Modify: `shared/mock/types.ts`
- Modify: `shared/mock/seed.ts`
- Modify: `shared/mock/store.ts`
- Test: `shared/mock/competition.test.ts` (new)

**Interfaces:**
- Consumes: existing `State`, `load`/`save`, `addCategory` from `store.ts`.
- Produces:
  - `type CompetitionFormat = 'ROUND_ROBIN' | 'GROUPS_KNOCKOUT'`
  - `type Legs = 'SINGLE' | 'HOME_AWAY'`
  - `type FinalsType = 'PLACEMENT' | 'SINGLE_GROUP_CROSSOVER' | 'SPLIT_GROUP_FINALS'`
  - `interface CompetitionConfig { format: CompetitionFormat; legs: Legs; groupsCount: number; qualifiersPerGroup: number; finalsType: FinalsType }`
  - `interface Competition extends CompetitionConfig { id: string; eventId: string; categoryId: string }`
  - `getCompetitions(eventId: string): Competition[]`
  - `getCompetition(categoryId: string): Competition | undefined`
  - `upsertCompetition(input: { eventId: string; categoryId: string } & CompetitionConfig): Competition`
  - `applyToAllCategories(eventId: string, config: CompetitionConfig): void`

- [ ] **Step 1: Add types to `shared/mock/types.ts`**

Add these exports (after the existing `Category` interface) and extend `State`:

```ts
export type CompetitionFormat = 'ROUND_ROBIN' | 'GROUPS_KNOCKOUT'
export type Legs = 'SINGLE' | 'HOME_AWAY'
export type FinalsType = 'PLACEMENT' | 'SINGLE_GROUP_CROSSOVER' | 'SPLIT_GROUP_FINALS'

export interface CompetitionConfig {
  format: CompetitionFormat
  legs: Legs
  groupsCount: number
  qualifiersPerGroup: number
  finalsType: FinalsType
}

export interface Competition extends CompetitionConfig {
  id: string
  eventId: string
  categoryId: string
}
```

Then change the `State` interface to add the `competitions` array:

```ts
export interface State {
  events: TournamentEvent[]
  categories: Category[]
  registrations: Registration[]
  competitions: Competition[]
}
```

- [ ] **Step 2: Add seed competitions in `shared/mock/seed.ts`**

Inside the object returned by `buildSeed()`, after the `registrations: [ ... ],` array, add:

```ts
    competitions: [
      { id: 'comp-1', eventId: 'evt-1', categoryId: 'cat-1', format: 'GROUPS_KNOCKOUT', legs: 'SINGLE', groupsCount: 2, qualifiersPerGroup: 2, finalsType: 'PLACEMENT' },
      { id: 'comp-2', eventId: 'evt-1', categoryId: 'cat-2', format: 'GROUPS_KNOCKOUT', legs: 'SINGLE', groupsCount: 2, qualifiersPerGroup: 2, finalsType: 'PLACEMENT' },
      { id: 'comp-3', eventId: 'evt-1', categoryId: 'cat-3', format: 'GROUPS_KNOCKOUT', legs: 'SINGLE', groupsCount: 2, qualifiersPerGroup: 2, finalsType: 'PLACEMENT' },
    ],
```

- [ ] **Step 3: Write the failing test `shared/mock/competition.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  resetDemo, addCategory, getCompetition, getCompetitions, upsertCompetition, applyToAllCategories,
} from './store'
import type { CompetitionConfig } from './types'

const RR: CompetitionConfig = { format: 'ROUND_ROBIN', legs: 'HOME_AWAY', groupsCount: 1, qualifiersPerGroup: 1, finalsType: 'PLACEMENT' }

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('competition store', () => {
  it('seeds one competition per category, all identical', () => {
    const comps = getCompetitions('evt-1')
    expect(comps).toHaveLength(3)
    expect(getCompetition('cat-1')?.format).toBe('GROUPS_KNOCKOUT')
    expect(comps.every(c => c.legs === 'SINGLE' && c.groupsCount === 2)).toBe(true)
  })

  it('upsertCompetition updates the existing row for a category (no duplicate)', () => {
    upsertCompetition({ eventId: 'evt-1', categoryId: 'cat-1', ...RR })
    expect(getCompetitions('evt-1')).toHaveLength(3)
    expect(getCompetition('cat-1')?.format).toBe('ROUND_ROBIN')
    expect(getCompetition('cat-1')?.legs).toBe('HOME_AWAY')
  })

  it('upsertCompetition creates a row for a category that has none', () => {
    const cat = addCategory('evt-1', 'U16', 8)
    expect(getCompetition(cat.id)).toBeUndefined()
    upsertCompetition({ eventId: 'evt-1', categoryId: cat.id, ...RR })
    expect(getCompetition(cat.id)?.format).toBe('ROUND_ROBIN')
    expect(getCompetitions('evt-1')).toHaveLength(4)
  })

  it('applyToAllCategories writes the same config to every category of the event', () => {
    applyToAllCategories('evt-1', RR)
    const comps = getCompetitions('evt-1')
    expect(comps).toHaveLength(3)
    expect(comps.every(c => c.format === 'ROUND_ROBIN' && c.legs === 'HOME_AWAY')).toBe(true)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd playfusion-web && npx vitest run shared/mock/competition.test.ts`
Expected: FAIL — `getCompetition`/`getCompetitions`/`upsertCompetition`/`applyToAllCategories` not exported.

- [ ] **Step 5: Implement the store functions in `shared/mock/store.ts`**

First extend the type import at the top of the file:

```ts
import type { Category, Competition, CompetitionConfig, Registration, State, TournamentEvent } from './types'
```

Then append these functions at the end of the file:

```ts
export function getCompetitions(eventId: string): Competition[] {
  return load().competitions.filter(c => c.eventId === eventId)
}
export function getCompetition(categoryId: string): Competition | undefined {
  return load().competitions.find(c => c.categoryId === categoryId)
}
export function upsertCompetition(input: { eventId: string; categoryId: string } & CompetitionConfig): Competition {
  const state = load()
  const existing = state.competitions.find(c => c.categoryId === input.categoryId)
  if (existing) { Object.assign(existing, input); save(state); return existing }
  const comp: Competition = { id: `comp-${state.competitions.length + 1}`, ...input }
  state.competitions.push(comp); save(state); return comp
}
export function applyToAllCategories(eventId: string, config: CompetitionConfig): void {
  const state = load()
  for (const cat of state.categories.filter(c => c.eventId === eventId)) {
    const existing = state.competitions.find(c => c.categoryId === cat.id)
    if (existing) Object.assign(existing, config)
    else state.competitions.push({ id: `comp-${state.competitions.length + 1}`, eventId, categoryId: cat.id, ...config })
  }
  save(state)
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd playfusion-web && npm test`
Expected: PASS — the existing 7 store tests plus the 4 new competition tests are green.

- [ ] **Step 7: Commit**

```bash
cd playfusion-web
git add shared/mock/types.ts shared/mock/seed.ts shared/mock/store.ts shared/mock/competition.test.ts
git commit -m "feat: Competition model + per-category competition store (O6) with tests"
```

---

### Task 2: "Configura competizione" screen + event-hub step

**Files:**
- Modify: `vite.config.ts`
- Modify: `shared/ui.css`
- Create: `apps/organizer/competition.html`
- Create: `apps/organizer/competition.ts`
- Modify: `apps/organizer/event-hub.ts`

**Interfaces:**
- Consumes: `renderOrganizerTopbar` (chrome); `getCategories`, `getCompetition`, `getCompetitions`, `upsertCompetition`, `applyToAllCategories` (store); `CompetitionConfig` (types).
- Produces: the `competition.html` screen; a new enabled event-hub step linking to it.

- [ ] **Step 1: Register the new page in `vite.config.ts`**

In the `rollupOptions.input` object, add this line after the `payments` entry:

```ts
        competition: r('apps/organizer/competition.html'),
```

- [ ] **Step 2: Add the toggle style to `shared/ui.css`**

Append at the end of the file:

```css
/* ---------- Switch (toggle) ---------- */
.pf-switch { display: inline-flex; align-items: center; gap: var(--space-3); font-weight: 700; cursor: pointer; }
.pf-switch input { width: 18px; height: 18px; accent-color: var(--color-action-primary); }
```

- [ ] **Step 3: Create `apps/organizer/competition.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Competizione</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-topbar" id="topbar"></header>
  <main class="pf-container">
    <a class="pf-back" id="back" href="#">← Torna all'evento</a>
    <div class="pf-pagehead">
      <div class="pf-eyebrow">Setup · Competizione</div>
      <h1>Configura competizione</h1>
    </div>
    <div class="pf-card">
      <label class="pf-switch"><input type="checkbox" id="uniform" /> Stessa configurazione per tutte le categorie</label>
    </div>
    <div id="content"></div>
  </main>
  <script type="module" src="./competition.ts"></script>
</body>
</html>
```

- [ ] **Step 4: Create `apps/organizer/competition.ts`**

```ts
import { renderOrganizerTopbar } from '../../shared/chrome'
import { getCategories, getCompetition, applyToAllCategories, upsertCompetition } from '../../shared/mock/store'
import type { CompetitionConfig } from '../../shared/mock/types'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

const cats = getCategories(id)
const DEFAULT: CompetitionConfig = { format: 'GROUPS_KNOCKOUT', legs: 'SINGLE', groupsCount: 2, qualifiersPerGroup: 2, finalsType: 'PLACEMENT' }

function sameConfig(a: CompetitionConfig, b: CompetitionConfig): boolean {
  return a.format === b.format && a.legs === b.legs && a.groupsCount === b.groupsCount
    && a.qualifiersPerGroup === b.qualifiersPerGroup && a.finalsType === b.finalsType
}
function allSame(): boolean {
  const comps = cats.map(c => getCompetition(c.id))
  if (comps.length === 0 || comps.some(c => !c)) return false
  return (comps as CompetitionConfig[]).every(c => sameConfig(c, comps[0] as CompetitionConfig))
}

function configFields(cfg: CompetitionConfig): string {
  const opt = (v: string, cur: string, label: string) => `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`
  const ko = cfg.format === 'GROUPS_KNOCKOUT'
  return `
    <div class="pf-field"><label>Formato</label>
      <select name="format">
        ${opt('ROUND_ROBIN', cfg.format, "Girone all'italiana")}
        ${opt('GROUPS_KNOCKOUT', cfg.format, 'Gironi + tabellone')}
      </select></div>
    <div class="pf-field"><label>Modalità</label>
      <select name="legs">
        ${opt('SINGLE', cfg.legs, 'Girone singolo')}
        ${opt('HOME_AWAY', cfg.legs, 'Andata e ritorno')}
      </select></div>
    <div class="js-ko" style="display:${ko ? 'block' : 'none'}">
      <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
        <div class="pf-field" style="flex:1;margin-bottom:0"><label>N. gironi</label><input name="groupsCount" type="number" min="1" value="${cfg.groupsCount}" /></div>
        <div class="pf-field" style="flex:1;margin-bottom:0"><label>Qualificate per girone</label><input name="qualifiersPerGroup" type="number" min="1" value="${cfg.qualifiersPerGroup}" /></div>
      </div>
      <div class="pf-field"><label>Tipo finali</label>
        <select name="finalsType">
          ${opt('PLACEMENT', cfg.finalsType, 'Piazzamento')}
          ${opt('SINGLE_GROUP_CROSSOVER', cfg.finalsType, 'Crossover girone unico')}
          ${opt('SPLIT_GROUP_FINALS', cfg.finalsType, 'Split-group')}
        </select></div>
    </div>`
}

function readConfig(form: HTMLFormElement): CompetitionConfig {
  const d = new FormData(form)
  return {
    format: d.get('format') as CompetitionConfig['format'],
    legs: d.get('legs') as CompetitionConfig['legs'],
    groupsCount: Number(d.get('groupsCount')),
    qualifiersPerGroup: Number(d.get('qualifiersPerGroup')),
    finalsType: d.get('finalsType') as CompetitionConfig['finalsType'],
  }
}

function wireConditional(scope: HTMLElement): void {
  const fmt = scope.querySelector<HTMLSelectElement>('select[name="format"]')!
  const ko = scope.querySelector<HTMLElement>('.js-ko')!
  fmt.addEventListener('change', () => { ko.style.display = fmt.value === 'GROUPS_KNOCKOUT' ? 'block' : 'none' })
}

let uniform = allSame()
const toggle = document.getElementById('uniform') as HTMLInputElement
toggle.checked = uniform
toggle.addEventListener('change', () => { uniform = toggle.checked; render() })

function render(): void {
  const content = document.getElementById('content')!
  if (cats.length === 0) {
    content.innerHTML = `<div class="pf-card pf-muted">Nessuna categoria. Aggiungile prima nello step Categorie.</div>`
    return
  }
  if (uniform) {
    const shared = getCompetition(cats[0].id) ?? DEFAULT
    content.innerHTML = `
      <form class="pf-card" id="common">
        <h2>Schema comune</h2>
        ${configFields(shared)}
        <button class="pf-btn pf-btn--primary" type="submit">Applica a tutte le categorie</button>
      </form>
      <div class="pf-card">
        <h2>Categorie</h2>
        <p class="pf-muted">Applicato a: ${cats.map(c => c.name).join(', ')}</p>
      </div>`
    const form = document.getElementById('common') as HTMLFormElement
    wireConditional(form)
    form.addEventListener('submit', (e) => { e.preventDefault(); applyToAllCategories(id, readConfig(form)); render() })
  } else {
    content.innerHTML = cats.map(c => {
      const cfg = getCompetition(c.id) ?? DEFAULT
      return `<form class="pf-card js-catform" data-cat="${c.id}">
        <div class="pf-cat__label" style="margin-bottom:var(--space-3)">${c.name}</div>
        ${configFields(cfg)}
        <button class="pf-btn pf-btn--primary" type="submit">Salva ${c.name}</button>
      </form>`
    }).join('')
    document.querySelectorAll<HTMLFormElement>('.js-catform').forEach(form => {
      wireConditional(form)
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        upsertCompetition({ eventId: id, categoryId: form.dataset.cat!, ...readConfig(form) })
        render()
      })
    })
  }
}
render()
```

- [ ] **Step 5: Add the event-hub step in `apps/organizer/event-hub.ts`**

Change the import line

```ts
import { getEvent, getRegistrations } from '../../shared/mock/store'
```

to

```ts
import { getEvent, getRegistrations, getCategories, getCompetitions } from '../../shared/mock/store'
```

Then, immediately before the `const steps: Step[] = [` line, add:

```ts
const cats = getCategories(id)
const comps = getCompetitions(id)
const competitionConfigured = cats.length > 0 && cats.every(c => comps.some(k => k.categoryId === c.id))
```

And in the `steps` array, insert this entry between the `'Riscuoti quote'` object and the `'Genera calendario'` object:

```ts
  { label: 'Configura competizione', href: `/apps/organizer/competition.html?event=${id}`, done: competitionConfigured },
```

- [ ] **Step 6: Verify build and dev behaviour**

Run: `cd playfusion-web && npm run build`
Expected: build succeeds; `competition` appears among the emitted entries.

Then `npm run dev` and check: event hub shows the new enabled "Configura competizione" step; opening it shows the toggle ON (seed configs are identical) with one shared form; unchecking shows one form per category; changing "Formato" to "Girone all'italiana" hides the groups/finals block; "Applica a tutte" and per-category "Salva" persist on reload.
Expected: no console errors.

- [ ] **Step 7: Commit**

```bash
cd playfusion-web
git add vite.config.ts shared/ui.css apps/organizer/competition.html apps/organizer/competition.ts apps/organizer/event-hub.ts
git commit -m "feat: O6 'Configura competizione' screen + event-hub step (uniform/per-category)"
```

---

### Task 3: End-to-end verification + README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the full test suite**

Run: `cd playfusion-web && npm test`
Expected: PASS — all store + competition tests green (11 total).

- [ ] **Step 2: Manual walkthrough (acceptance)**

Run: `npm run dev`, then:
1. Hub → "Reset demo".
2. Organizer → Memorial event → the checklist now shows "Configura competizione" as an enabled, done step (seed is pre-configured).
3. Open it: toggle is ON, one shared form. Change "Tipo finali" to "Split-group" → "Applica a tutte le categorie".
4. Uncheck the toggle → three per-category forms, each showing Split-group. Change U14 to "Girone all'italiana" → the groups/finals block hides → "Salva U14".
5. Reload → U14 keeps "Girone all'italiana", the others keep Split-group.
Expected: matches spec success criteria 1–6.

- [ ] **Step 3: Update `README.md`**

In the `## Scope (first round)` section, add a line under E1:

```markdown
- **E1 Organizer** competition setup (`apps/organizer/competition.html`) — O6 structure per category (format, legs, groups, finals) with a same-for-all / per-category toggle.
```

- [ ] **Step 4: Commit**

```bash
cd playfusion-web
git add README.md
git commit -m "docs: note O6 competition config screen in README"
```

---

## Self-Review

**1. Spec coverage:**
- Screen `competition.html` reached from a new event-hub step → Task 2 (Steps 3-5). ✓
- Toggle uniform/per-category with conditional fields → Task 2 Step 4 (`render`, `wireConditional`). ✓
- Config per category: format, legs, groupsCount, qualifiersPerGroup, finalsType → Task 1 types + Task 2 `configFields`. ✓
- Model `Competition` per category + getCompetition(s)/upsertCompetition/applyToAllCategories → Task 1. ✓
- Seed identical defaults so toggle starts ON → Task 1 Step 2 + Task 2 `allSame`. ✓
- Category stays a label → no change to `Category`/`addCategory` beyond existing. ✓
- Blueprint decisions D-O6-1/D-O6-2 → registered separately in the Blueprint after implementation (not code; noted for the coordinator). ✓
- Success criteria 1-6 → Task 3 Step 2. ✓
- Out of scope (fields/calendar/match params) → not present. ✓

**2. Placeholder scan:** No TBD/TODO; every code step carries full code.

**3. Type consistency:** `CompetitionConfig` fields (`format`, `legs`, `groupsCount`, `qualifiersPerGroup`, `finalsType`) are identical across types.ts, seed rows, store functions, `configFields`, `readConfig`, and tests. Store fn names (`getCompetition`, `getCompetitions`, `upsertCompetition`, `applyToAllCategories`) match between Task 1 Interfaces, implementation, screen imports, event-hub import, and tests. Enum string values (`ROUND_ROBIN`/`GROUPS_KNOCKOUT`, `SINGLE`/`HOME_AWAY`, `PLACEMENT`/`SINGLE_GROUP_CROSSOVER`/`SPLIT_GROUP_FINALS`) consistent throughout.
