# Standings (classifiche) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On calendar generation, also create zero-point standings (`Standing`, Initialized) per group, and show them in E1 (under the calendar) and in a public E3 page gated on published.

**Architecture:** Extends O7 generation. A shared `buildGroups` helper (extracted from `buildFixtures`) is the single source of team→group assignment; `generateSchedule` uses it to store a `StandingRow` per team per group (all zeros). A shared `renderStandings` helper renders per-group tables in E1 and E3. No framework, no backend.

**Tech Stack:** Vite MPA, vanilla TypeScript, Vitest + jsdom, plain HTML/CSS.

## Global Constraints

- **No framework**; vanilla TS/HTML/CSS. No backend/network.
- **Deterministic**; no `Math.random`.
- **`buildGroups` is the only grouping source** — fixtures and standings must agree.
- **Standings stored on generate**, all fields 0 at init; DR (`goalsFor - goalsAgainst`) derived in view only.
- **Reuse Matchday classes**; standings tables scroll inside an `overflow-x` wrapper (no page horizontal scroll); no hardcoded hex in screens.
- **Public standings gated on `Schedule.status === 'PUBLISHED'`** (like the calendar).

---

## File Structure

```
shared/mock/types.ts        # + StandingRow; State gains standings[]
shared/mock/seed.ts         # + standings: []
shared/mock/fixtures.ts     # extract buildGroups (+ internal splitIntoGroups); buildFixtures refactored to use it
shared/mock/fixtures.test.ts# + buildGroups test (existing tests unchanged)
shared/mock/store.ts        # generateSchedule stores standings; + getStandings
shared/mock/schedule.test.ts# + standings assertions
shared/chrome.ts            # + renderStandings(rows, catName)
shared/ui.css               # + standings table styles (.pf-stand, .pf-standings, .pf-tablewrap)
apps/organizer/schedule.html/.ts  # + standings block under the calendar
apps/public/standings.html/.ts    # NEW public page
apps/public/landing.ts      # + "Classifiche" link when published
vite.config.ts              # + standings html input
```

---

### Task 1: StandingRow type + seed + `buildGroups` extraction (TDD)

**Files:**
- Modify: `shared/mock/types.ts`, `shared/mock/seed.ts`, `shared/mock/fixtures.ts`
- Test: `shared/mock/fixtures.test.ts`

**Interfaces:**
- Produces:
  - `interface StandingRow { eventId: string; categoryId: string; groupLabel: string; team: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number }`
  - `buildGroups(cats: FixtureCategory[]): Array<{ categoryId: string; groupLabel: string; teams: string[] }>`

- [ ] **Step 1: Add `StandingRow` + extend `State` in `shared/mock/types.ts`**

Append after `ScheduledMatch`:

```ts
export interface StandingRow {
  eventId: string
  categoryId: string
  groupLabel: string
  team: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
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
}
```

- [ ] **Step 2: Add `standings: []` to the seed in `shared/mock/seed.ts`**

After `scheduledMatches: [],` add:

```ts
    standings: [],
```

- [ ] **Step 3: Add the failing `buildGroups` test to `shared/mock/fixtures.test.ts`**

Add this import line at the top (extend the existing import):

```ts
import { buildFixtures, buildGroups } from './fixtures'
```

Add this test inside the `describe`:

```ts
  it('buildGroups splits each category into labelled groups (single source of grouping)', () => {
    const groups = buildGroups([
      cat({ id: 'c1', groupsCount: 2, teams: ['A', 'B', 'C', 'D'] }),
      cat({ id: 'c2', format: 'ROUND_ROBIN', groupsCount: 9, teams: ['X', 'Y', 'Z'] }),
    ])
    expect(groups).toEqual([
      { categoryId: 'c1', groupLabel: 'Girone A', teams: ['A', 'C'] },
      { categoryId: 'c1', groupLabel: 'Girone B', teams: ['B', 'D'] },
      { categoryId: 'c2', groupLabel: 'Girone A', teams: ['X', 'Y', 'Z'] },
    ])
  })
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd playfusion-web && npx vitest run shared/mock/fixtures.test.ts`
Expected: FAIL — `buildGroups` is not exported.

- [ ] **Step 5: Refactor `shared/mock/fixtures.ts` to extract `buildGroups`**

Add these two functions (after `groupLabel`), and rewrite `buildFixtures`'s per-category grouping to use `splitIntoGroups`:

```ts
function splitIntoGroups(cat: FixtureCategory): Array<{ groupLabel: string; teams: string[] }> {
  const groups = cat.format === 'ROUND_ROBIN' ? 1 : Math.max(1, cat.groupsCount)
  const buckets: string[][] = Array.from({ length: groups }, () => [])
  cat.teams.forEach((t, i) => buckets[i % groups].push(t))
  return buckets.map((teams, gi) => ({ groupLabel: groupLabel(gi), teams }))
}

export function buildGroups(cats: FixtureCategory[]): Array<{ categoryId: string; groupLabel: string; teams: string[] }> {
  return cats.flatMap(cat => splitIntoGroups(cat).map(g => ({ categoryId: cat.id, groupLabel: g.groupLabel, teams: g.teams })))
}
```

Then, inside `buildFixtures`, replace the inline grouping block

```ts
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
```

with

```ts
    const raw: Array<{ groupLabel: string; home: string; away: string }> = []
    for (const g of splitIntoGroups(cat)) {
      for (const [home, away] of pairs(g.teams)) {
        raw.push({ groupLabel: g.groupLabel, home, away })
        if (cat.legs === 'HOME_AWAY') raw.push({ groupLabel: g.groupLabel, home: away, away: home })
      }
    }
```

(The placement loop below — fields/slot/day cursor — is unchanged.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd playfusion-web && npx vitest run shared/mock/fixtures.test.ts`
Expected: PASS — the 5 existing fixtures tests plus the new `buildGroups` test are green (behaviour of `buildFixtures` unchanged).

- [ ] **Step 7: Commit**

```bash
cd playfusion-web
git add shared/mock/types.ts shared/mock/seed.ts shared/mock/fixtures.ts shared/mock/fixtures.test.ts
git commit -m "feat: StandingRow type + buildGroups extraction (shared grouping for fixtures + standings)"
```

---

### Task 2: `generateSchedule` stores standings + `getStandings` (TDD)

**Files:**
- Modify: `shared/mock/store.ts`, `shared/mock/schedule.test.ts`

**Interfaces:**
- Consumes: `buildGroups`, `StandingRow` from Task 1.
- Produces: `getStandings(eventId: string): StandingRow[]`; `generateSchedule` also (re)creates the event's standings.

- [ ] **Step 1: Add standings assertions to `shared/mock/schedule.test.ts`**

Add `getStandings` to the import:

```ts
import { resetDemo, getSchedule, getScheduledMatches, getStandings, generateSchedule, approveSchedule, publishSchedule } from './store'
```

Add this test inside the `describe`:

```ts
  it('generate initializes zero-point standings per group; reset clears them', () => {
    expect(getStandings('evt-1')).toHaveLength(0)
    generateSchedule('evt-1', config)
    const s = getStandings('evt-1')
    expect(s.length).toBeGreaterThan(0)
    expect(s.every(r => r.points === 0 && r.played === 0)).toBe(true)
    resetDemo()
    expect(getStandings('evt-1')).toHaveLength(0)
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd playfusion-web && npx vitest run shared/mock/schedule.test.ts`
Expected: FAIL — `getStandings` not exported.

- [ ] **Step 3: Update `shared/mock/store.ts`**

Extend the top type import to include `StandingRow`, and the fixtures import to include `buildGroups`:

```ts
import type { Category, Competition, CompetitionConfig, Registration, Schedule, ScheduleConfig, ScheduledMatch, StandingRow, FixtureCategory, State, TournamentEvent } from './types'
import { buildFixtures, buildGroups } from './fixtures'
```

Inside `generateSchedule`, immediately after the line `state.scheduledMatches = state.scheduledMatches.filter(m => m.eventId !== eventId).concat(matches)`, add:

```ts
  const groups = buildGroups(cats)
  state.standings = state.standings.filter(s => s.eventId !== eventId)
  for (const g of groups) for (const team of g.teams) {
    state.standings.push({ eventId, categoryId: g.categoryId, groupLabel: g.groupLabel, team,
      played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 })
  }
```

Append the getter at the end of the file:

```ts
export function getStandings(eventId: string): StandingRow[] {
  return load().standings.filter(s => s.eventId === eventId)
}
```

- [ ] **Step 4: Run the full suite**

Run: `cd playfusion-web && npm test`
Expected: PASS — fixtures (6) + schedule (5) + store (7) + competition (4) all green.

- [ ] **Step 5: Commit**

```bash
cd playfusion-web
git add shared/mock/store.ts shared/mock/schedule.test.ts
git commit -m "feat: generateSchedule stores zero-point standings; getStandings (O6 Standing initialized)"
```

---

### Task 3: `renderStandings` helper + styles + E1 standings block

**Files:**
- Modify: `shared/chrome.ts`, `shared/ui.css`, `apps/organizer/schedule.html`, `apps/organizer/schedule.ts`

**Interfaces:**
- Consumes: `getStandings` (store), `StandingRow` (types).
- Produces: `renderStandings(rows: StandingRow[], catName: (id: string) => string): string` (reused by E3 in Task 4).

- [ ] **Step 1: Add `renderStandings` to `shared/chrome.ts`**

Extend the type import at the top:

```ts
import type { ScheduledMatch, StandingRow } from './mock/types'
```

Append at the end:

```ts
// Standings tables — grouped by category → girone; zero-point rows. Shared by E1 and E3.
export function renderStandings(rows: StandingRow[], catName: (id: string) => string): string {
  if (!rows.length) return `<p class="pf-muted">Nessuna classifica.</p>`
  const catIds: string[] = []
  for (const r of rows) if (!catIds.includes(r.categoryId)) catIds.push(r.categoryId)
  return catIds.map(catId => {
    const catRows = rows.filter(r => r.categoryId === catId)
    const groups: string[] = []
    for (const r of catRows) if (!groups.includes(r.groupLabel)) groups.push(r.groupLabel)
    return groups.map(g => {
      const gr = catRows.filter(r => r.groupLabel === g)
      const body = gr.map((r, i) => `<tr>
        <td>${i + 1}</td><td class="pf-stand__team">${r.team}</td>
        <td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td>
        <td>${r.goalsFor}</td><td>${r.goalsAgainst}</td><td>${r.goalsFor - r.goalsAgainst}</td><td><b>${r.points}</b></td>
      </tr>`).join('')
      return `<div class="pf-stand">
        <div class="pf-stand__head"><span class="pf-cat__label">${catName(catId)}</span><span class="pf-mono">${g}</span></div>
        <div class="pf-tablewrap"><table class="pf-standings">
          <thead><tr><th>#</th><th>Squadra</th><th>G</th><th>V</th><th>N</th><th>P</th><th>GF</th><th>GS</th><th>DR</th><th>Pt</th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>
      </div>`
    }).join('')
  }).join('')
}
```

- [ ] **Step 2: Add standings styles to `shared/ui.css`**

Append:

```css
/* ---------- Standings ---------- */
.pf-tablewrap { overflow-x: auto; }
.pf-stand { margin-bottom: var(--space-5); }
.pf-stand__head { display: flex; align-items: baseline; gap: var(--space-3); margin-bottom: var(--space-2); }
.pf-standings { width: 100%; border-collapse: collapse; font-size: 13px; white-space: nowrap; }
.pf-standings th { font-family: var(--font-mono); font-size: 11px; font-weight: 500; text-transform: uppercase;
  color: var(--color-text-muted); text-align: right; padding: var(--space-2); border-bottom: 2px solid var(--color-border); }
.pf-standings th:nth-child(2) { text-align: left; }
.pf-standings td { font-family: var(--font-mono); text-align: right; padding: var(--space-2); border-bottom: 1px solid var(--color-border); }
.pf-standings td.pf-stand__team { font-family: var(--font-sans); font-weight: 700; text-align: left; }
.pf-standings td:first-child { color: var(--color-text-muted); }
.pf-standings tr:last-child td { border-bottom: none; }
```

- [ ] **Step 3: Add a standings container to `apps/organizer/schedule.html`**

After the `<div id="calendar"></div>` line, add:

```html
    <div id="standings"></div>
```

- [ ] **Step 4: Render standings in `apps/organizer/schedule.ts`**

Extend the chrome import and the store import:

```ts
import { renderOrganizerTopbar, renderCalendar, renderStandings } from '../../shared/chrome'
```
```ts
import { getCategories, getSchedule, getScheduledMatches, getStandings, generateSchedule, approveSchedule, publishSchedule } from '../../shared/mock/store'
```

In `render()`, after the line that sets `#calendar`'s innerHTML, add:

```ts
  document.getElementById('standings')!.innerHTML = schedule().status === 'NONE' ? ''
    : `<div class="pf-pagehead" style="margin:var(--space-6) 0 var(--space-4)"><div class="pf-eyebrow">Classifiche</div><h2>Classifiche di girone</h2></div>`
      + `<p class="pf-muted" style="margin-top:calc(-1*var(--space-2));margin-bottom:var(--space-4)">Classifica iniziale · nessuna partita giocata.</p>`
      + renderStandings(getStandings(id), catName)
```

Also handle the empty-categories branch: in the `if (cats.length === 0)` block of `render()`, add `document.getElementById('standings')!.innerHTML = ''` alongside the other resets.

- [ ] **Step 5: Verify build + behaviour**

Run: `cd playfusion-web && npm run build`
Expected: build succeeds; `npm test` still green (22 tests).

`npm run dev`: on the schedule page, after "Genera calendario" the calendar appears and below it the standings tables per girone (all zeros). On a narrow window the standings table scrolls horizontally inside its card (page does not scroll sideways).

- [ ] **Step 6: Commit**

```bash
cd playfusion-web
git add shared/chrome.ts shared/ui.css apps/organizer/schedule.html apps/organizer/schedule.ts
git commit -m "feat: renderStandings helper + standings styles + E1 standings under the calendar"
```

---

### Task 4: E3 public standings page + landing link

**Files:**
- Modify: `vite.config.ts`, `apps/public/landing.ts`
- Create: `apps/public/standings.html`, `apps/public/standings.ts`

**Interfaces:**
- Consumes: `renderStandings`, `renderPublicTopbar` (chrome); `getCategories`, `getEvent`, `getSchedule`, `getStandings` (store).

- [ ] **Step 1: Register the page in `vite.config.ts`**

After the `calendar` entry, add:

```ts
        standings: r('apps/public/standings.html'),
```

- [ ] **Step 2: Create `apps/public/standings.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PlayFusion · Classifiche</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-publicbar" id="topbar"></header>
  <main class="pf-container pf-container--narrow">
    <a class="pf-back" id="back" href="#">← Torna all'evento</a>
    <div class="pf-pagehead"><div class="pf-eyebrow" id="eyebrow">Torneo</div><h1>Classifiche</h1></div>
    <div class="pf-card" id="standings"></div>
  </main>
  <script type="module" src="./standings.ts"></script>
</body>
</html>
```

- [ ] **Step 3: Create `apps/public/standings.ts`**

```ts
import { renderPublicTopbar, renderStandings } from '../../shared/chrome'
import { getCategories, getEvent, getSchedule, getStandings } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)
document.getElementById('eyebrow')!.textContent = getEvent(id)?.name ?? 'Torneo'

const catName = (catId: string) => getCategories(id).find(c => c.id === catId)?.name ?? '—'
const published = getSchedule(id)?.status === 'PUBLISHED'
document.getElementById('standings')!.innerHTML = published
  ? renderStandings(getStandings(id), catName)
  : `<p class="pf-muted">Le classifiche non sono ancora state pubblicate.</p>`
```

- [ ] **Step 4: Add the "Classifiche" link to `apps/public/landing.ts`**

Replace the published-CTA block

```ts
const published = getSchedule(id)?.status === 'PUBLISHED'
document.getElementById('cta')!.innerHTML = `
  ${open
    ? `<a class="pf-btn pf-btn--primary pf-btn--lg" href="/apps/public/enroll.html?event=${id}">Iscrivi la squadra</a>`
    : `<p class="pf-muted">Le iscrizioni sono chiuse.</p>`}
  ${published ? `<a class="pf-btn pf-btn--lg" style="margin-left:var(--space-2)" href="/apps/public/calendar.html?event=${id}">Calendario</a>` : ''}`
```

with

```ts
const published = getSchedule(id)?.status === 'PUBLISHED'
document.getElementById('cta')!.innerHTML = `
  ${open
    ? `<a class="pf-btn pf-btn--primary pf-btn--lg" href="/apps/public/enroll.html?event=${id}">Iscrivi la squadra</a>`
    : `<p class="pf-muted">Le iscrizioni sono chiuse.</p>`}
  ${published ? `<a class="pf-btn pf-btn--lg" style="margin-left:var(--space-2)" href="/apps/public/calendar.html?event=${id}">Calendario</a>
    <a class="pf-btn pf-btn--lg" style="margin-left:var(--space-2)" href="/apps/public/standings.html?event=${id}">Classifiche</a>` : ''}`
```

- [ ] **Step 5: Verify**

Run: `cd playfusion-web && npm run build` → succeeds with a `standings` entry; `npm test` green (22).
`npm run dev`: before publishing, the landing shows no "Classifiche" link and `standings.html` shows the "non ancora pubblicate" message. After generating + approving + publishing in E1, the landing shows "Classifiche" and the public page lists zero-point tables per girone.

- [ ] **Step 6: Commit**

```bash
cd playfusion-web
git add vite.config.ts apps/public/standings.html apps/public/standings.ts apps/public/landing.ts
git commit -m "feat: E3 public standings page + landing link when published"
```

---

### Task 5: End-to-end verification + README

**Files:** `README.md`

- [ ] **Step 1: Full suite**

Run: `cd playfusion-web && npm test`
Expected: PASS — 22 tests (fixtures 6, schedule 5, store 7, competition 4).

- [ ] **Step 2: Manual walkthrough (acceptance)**

`npm run dev`: Hub → Reset → Organizer → Memorial → Genera calendario → verify standings tables appear under the calendar, one per girone, all zeros, matching the fixtures' groups. Approva → Pubblica → public landing shows "Classifiche" → open it → same zero-point tables.
Expected: spec success criteria 1–6.

- [ ] **Step 3: Update `README.md`**

Under `## Scope`, add:

```markdown
- **Standings** — generating the calendar also creates zero-point group standings (O6 `Standing`), shown in E1 under the calendar and on the public E3 `standings.html` once published.
```

- [ ] **Step 4: Commit**

```bash
cd playfusion-web
git add README.md
git commit -m "docs: note standings in README"
```

---

## Self-Review

**1. Spec coverage:**
- `StandingRow` + `State.standings` + seed `[]` → Task 1. ✓
- `buildGroups` single grouping source; `buildFixtures` refactored, unchanged behaviour → Task 1 Step 5 + tests. ✓
- Standings stored on generate (zero) + `getStandings` → Task 2. ✓
- `renderStandings` helper + E1 under calendar → Task 3. ✓
- E3 public page gated on PUBLISHED + landing link → Task 4. ✓
- Reset clears standings (seed `[]`, generate replaces) → Task 2 test. ✓
- Responsive table (overflow-x wrapper, no page scroll) → Task 3 Step 2. ✓
- Blueprint D-O6-3 → coordinator post-step. ✓
- Success criteria 1–6 → Task 5. ✓
- Out of scope (points/results/ordering, finals) → absent. ✓

**2. Placeholder scan:** No TBD/TODO; full code in every step.

**3. Type consistency:** `StandingRow` fields identical across types, store push, `renderStandings`, tests. `buildGroups` return shape `{categoryId, groupLabel, teams}` identical in fixtures, its test, and store usage. `getStandings(eventId)` name consistent across store, schedule.test, E1, E3. `renderStandings(rows, catName)` signature matches both call sites (E1 Task 3, E3 Task 4).
