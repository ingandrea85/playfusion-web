# Category/girone tabs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add category + girone tabs to filter the calendar and standings in E1 (`schedule.html`, shared selector) and E3 (`calendar.html`, `standings.html`).

**Architecture:** A shared `renderTabs` helper renders a pill tab bar. Each screen keeps `selCat`/`selGir` state, derives categories/gironi from the generated data, wires tab clicks to re-render, and passes the filtered matches/standings to the existing `renderCalendar`/`renderStandings` (unchanged). UI only — no store/type/domain change.

**Tech Stack:** Vite MPA, vanilla TypeScript, plain HTML/CSS.

## Global Constraints

- **No framework**; vanilla TS/HTML/CSS. No store/type/domain change; existing tests must stay green (22).
- **`renderCalendar`/`renderStandings` unchanged** — screens filter their inputs.
- **Filter**: `categoryId === selCat && (selGir === 'ALL' || groupLabel === selGir)`.
- **Defaults**: `selCat` = first category present in the generated data; `selGir = 'ALL'`. Changing category resets girone to `'ALL'`.
- **Tabs only when there is data** (E1: status ≠ NONE; E3: published); else current messages unchanged.
- **Reuse tokens**; tab bar scrolls horizontally on mobile (no page horizontal scroll); no hardcoded hex in screens.

---

## File Structure

```
shared/chrome.ts            # + renderTabs(items, activeKey)
shared/ui.css               # + .pf-tabs / .pf-tab styles
apps/organizer/schedule.html/.ts   # + shared cat/girone tabs controlling calendar + standings
apps/public/calendar.html/.ts      # + cat/girone tabs (calendar)
apps/public/standings.html/.ts     # + cat/girone tabs (standings)
```

---

### Task 1: `renderTabs` helper + tab styles

**Files:**
- Modify: `shared/chrome.ts`, `shared/ui.css`

**Interfaces:**
- Produces: `renderTabs(items: Array<{ key: string; label: string }>, activeKey: string): string` — a `.pf-tabs` bar of `.pf-tab` buttons carrying `data-key`; the active one has `aria-selected="true"`.

- [ ] **Step 1: Add `renderTabs` to `shared/chrome.ts`**

Append at the end:

```ts
// Pill tab bar. Screens read data-key on click and re-render. Shared by calendar + standings views.
export function renderTabs(items: Array<{ key: string; label: string }>, activeKey: string): string {
  return `<div class="pf-tabs">${items.map(t =>
    `<button class="pf-tab" type="button" data-key="${t.key}"${t.key === activeKey ? ' aria-selected="true"' : ''}>${t.label}</button>`,
  ).join('')}</div>`
}
```

- [ ] **Step 2: Add tab styles to `shared/ui.css`**

Append:

```css
/* ---------- Tabs ---------- */
.pf-tabs { display: flex; gap: var(--space-2); overflow-x: auto; padding-bottom: var(--space-2); margin-bottom: var(--space-3); -webkit-overflow-scrolling: touch; }
.pf-tab { flex: none; padding: 8px var(--space-4); border-radius: var(--radius-pill); border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-muted); font-family: var(--font-sans); font-weight: 700; font-size: 13px;
  cursor: pointer; white-space: nowrap; }
.pf-tab:hover { border-color: var(--color-border-strong); }
.pf-tab[aria-selected="true"] { background: var(--color-action-primary); color: #fff; border-color: transparent; }
```

- [ ] **Step 3: Verify build**

Run: `cd playfusion-web && npm run build`
Expected: build succeeds; `npm test` still green (22, unchanged).

- [ ] **Step 4: Commit**

```bash
cd playfusion-web
git add shared/chrome.ts shared/ui.css
git commit -m "feat: renderTabs helper + tab styles"
```

---

### Task 2: E1 `schedule.html` — shared category/girone tabs over calendar + standings

**Files:**
- Modify: `apps/organizer/schedule.html`, `apps/organizer/schedule.ts`

**Interfaces:**
- Consumes: `renderTabs` (Task 1); existing `renderCalendar`, `renderStandings`, `getScheduledMatches`, `getStandings`.

- [ ] **Step 1: Add a `#viewtabs` container in `apps/organizer/schedule.html`**

Change the line `<div id="calendar"></div>` to:

```html
    <div id="viewtabs"></div>
    <div id="calendar"></div>
```

- [ ] **Step 2: Import `renderTabs` in `apps/organizer/schedule.ts`**

Change:

```ts
import { renderOrganizerTopbar, renderCalendar, renderStandings } from '../../shared/chrome'
```

to:

```ts
import { renderOrganizerTopbar, renderCalendar, renderStandings, renderTabs } from '../../shared/chrome'
```

- [ ] **Step 3: Add selection state + `renderViews` in `apps/organizer/schedule.ts`**

Immediately BEFORE the existing `function render(): void {` line, add:

```ts
let selCat = ''
let selGir = 'ALL'

function presentCats(): string[] {
  const seen: string[] = []
  for (const m of getScheduledMatches(id)) if (!seen.includes(m.categoryId)) seen.push(m.categoryId)
  return seen
}
function gironiOf(catId: string): string[] {
  const seen: string[] = []
  for (const m of getScheduledMatches(id)) if (m.categoryId === catId && !seen.includes(m.groupLabel)) seen.push(m.groupLabel)
  return seen
}
function renderViews(): void {
  const catsPresent = presentCats()
  if (!catsPresent.includes(selCat)) selCat = catsPresent[0]
  const gironi = gironiOf(selCat)
  if (selGir !== 'ALL' && !gironi.includes(selGir)) selGir = 'ALL'
  const catTabs = renderTabs(catsPresent.map(c => ({ key: c, label: catName(c) })), selCat)
  const girTabs = renderTabs([{ key: 'ALL', label: 'Tutti i gironi' }, ...gironi.map(g => ({ key: g, label: g }))], selGir)
  document.getElementById('viewtabs')!.innerHTML = catTabs + girTabs
  const bars = document.querySelectorAll<HTMLElement>('#viewtabs .pf-tabs')
  bars[0].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b =>
    b.addEventListener('click', () => { selCat = b.dataset.key!; selGir = 'ALL'; renderViews() }))
  bars[1].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b =>
    b.addEventListener('click', () => { selGir = b.dataset.key!; renderViews() }))
  const inSel = (categoryId: string, groupLabel: string) => categoryId === selCat && (selGir === 'ALL' || groupLabel === selGir)
  document.getElementById('calendar')!.innerHTML = renderCalendar(getScheduledMatches(id).filter(m => inSel(m.categoryId, m.groupLabel)), catName)
  document.getElementById('standings')!.innerHTML =
    `<div class="pf-pagehead" style="margin:var(--space-6) 0 var(--space-4)"><div class="pf-eyebrow">Classifiche</div><h2>Classifiche di girone</h2></div>`
    + `<p class="pf-muted" style="margin-top:calc(-1*var(--space-2));margin-bottom:var(--space-4)">Classifica iniziale · nessuna partita giocata.</p>`
    + renderStandings(getStandings(id).filter(s => inSel(s.categoryId, s.groupLabel)), catName)
}
```

- [ ] **Step 4: Rewrite the tail of `render()` in `apps/organizer/schedule.ts`**

Replace the current body of `render()` (from `document.getElementById('flash')...` through the two lines that set `#calendar` and `#standings`) with:

```ts
function render(): void {
  document.getElementById('flash')!.innerHTML = ''
  if (cats.length === 0) {
    document.getElementById('window')!.innerHTML = ''
    document.getElementById('configarea')!.innerHTML = `<div class="pf-card pf-muted">Nessuna categoria. Aggiungile prima nello step Categorie.</div>`
    document.getElementById('actions')!.innerHTML = ''
    document.getElementById('viewtabs')!.innerHTML = ''
    document.getElementById('calendar')!.innerHTML = ''
    document.getElementById('standings')!.innerHTML = ''
    return
  }
  renderWindow()
  renderConfigArea()
  renderActions()
  if (schedule().status === 'NONE') {
    document.getElementById('viewtabs')!.innerHTML = ''
    document.getElementById('calendar')!.innerHTML = ''
    document.getElementById('standings')!.innerHTML = ''
  } else {
    renderViews()
  }
}
```

- [ ] **Step 5: Verify build + behaviour**

Run: `cd playfusion-web && npm run build`
Expected: succeeds; `npm test` green (22).

`npm run dev`: after "Genera calendario", a category tab bar + girone tab bar appear above the calendar. Selecting a category filters BOTH the calendar and the standings to that category; selecting a girone narrows both; switching category resets girone to "Tutti i gironi".

- [ ] **Step 6: Commit**

```bash
cd playfusion-web
git add apps/organizer/schedule.html apps/organizer/schedule.ts
git commit -m "feat: E1 category/girone tabs filtering calendar + standings"
```

---

### Task 3: E3 `calendar.html` and `standings.html` — category/girone tabs

**Files:**
- Modify: `apps/public/calendar.html`, `apps/public/calendar.ts`, `apps/public/standings.html`, `apps/public/standings.ts`

**Interfaces:**
- Consumes: `renderTabs`; existing `renderCalendar`/`renderStandings`, `getScheduledMatches`/`getStandings`, `getSchedule`.

- [ ] **Step 1: Add a `#viewtabs` container to `apps/public/calendar.html`**

Change `<div class="pf-card" id="calendar"></div>` to:

```html
    <div id="viewtabs"></div>
    <div class="pf-card" id="calendar"></div>
```

- [ ] **Step 2: Rewrite `apps/public/calendar.ts`**

```ts
import { renderPublicTopbar, renderCalendar, renderTabs } from '../../shared/chrome'
import { getCategories, getEvent, getSchedule, getScheduledMatches } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)
document.getElementById('eyebrow')!.textContent = getEvent(id)?.name ?? 'Torneo'

const catName = (catId: string) => getCategories(id).find(c => c.id === catId)?.name ?? '—'
const published = getSchedule(id)?.status === 'PUBLISHED'

let selCat = ''
let selGir = 'ALL'

function presentCats(): string[] {
  const seen: string[] = []
  for (const m of getScheduledMatches(id)) if (!seen.includes(m.categoryId)) seen.push(m.categoryId)
  return seen
}
function gironiOf(catId: string): string[] {
  const seen: string[] = []
  for (const m of getScheduledMatches(id)) if (m.categoryId === catId && !seen.includes(m.groupLabel)) seen.push(m.groupLabel)
  return seen
}
function renderViews(): void {
  const catsPresent = presentCats()
  if (!catsPresent.length) { document.getElementById('calendar')!.innerHTML = renderCalendar([], catName); return }
  if (!catsPresent.includes(selCat)) selCat = catsPresent[0]
  const gironi = gironiOf(selCat)
  if (selGir !== 'ALL' && !gironi.includes(selGir)) selGir = 'ALL'
  document.getElementById('viewtabs')!.innerHTML =
    renderTabs(catsPresent.map(c => ({ key: c, label: catName(c) })), selCat)
    + renderTabs([{ key: 'ALL', label: 'Tutti i gironi' }, ...gironi.map(g => ({ key: g, label: g }))], selGir)
  const bars = document.querySelectorAll<HTMLElement>('#viewtabs .pf-tabs')
  bars[0].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b =>
    b.addEventListener('click', () => { selCat = b.dataset.key!; selGir = 'ALL'; renderViews() }))
  bars[1].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b =>
    b.addEventListener('click', () => { selGir = b.dataset.key!; renderViews() }))
  const rows = getScheduledMatches(id).filter(m => m.categoryId === selCat && (selGir === 'ALL' || m.groupLabel === selGir))
  document.getElementById('calendar')!.innerHTML = renderCalendar(rows, catName)
}

if (!published) {
  document.getElementById('calendar')!.innerHTML = `<p class="pf-muted">Il calendario non è ancora stato pubblicato.</p>`
} else {
  renderViews()
}
```

- [ ] **Step 3: Add a `#viewtabs` container to `apps/public/standings.html`**

Change `<div class="pf-card" id="standings"></div>` to:

```html
    <div id="viewtabs"></div>
    <div class="pf-card" id="standings"></div>
```

- [ ] **Step 4: Rewrite `apps/public/standings.ts`**

```ts
import { renderPublicTopbar, renderStandings, renderTabs } from '../../shared/chrome'
import { getCategories, getEvent, getSchedule, getStandings } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)
document.getElementById('eyebrow')!.textContent = getEvent(id)?.name ?? 'Torneo'

const catName = (catId: string) => getCategories(id).find(c => c.id === catId)?.name ?? '—'
const published = getSchedule(id)?.status === 'PUBLISHED'

let selCat = ''
let selGir = 'ALL'

function presentCats(): string[] {
  const seen: string[] = []
  for (const s of getStandings(id)) if (!seen.includes(s.categoryId)) seen.push(s.categoryId)
  return seen
}
function gironiOf(catId: string): string[] {
  const seen: string[] = []
  for (const s of getStandings(id)) if (s.categoryId === catId && !seen.includes(s.groupLabel)) seen.push(s.groupLabel)
  return seen
}
function renderViews(): void {
  const catsPresent = presentCats()
  if (!catsPresent.length) { document.getElementById('standings')!.innerHTML = renderStandings([], catName); return }
  if (!catsPresent.includes(selCat)) selCat = catsPresent[0]
  const gironi = gironiOf(selCat)
  if (selGir !== 'ALL' && !gironi.includes(selGir)) selGir = 'ALL'
  document.getElementById('viewtabs')!.innerHTML =
    renderTabs(catsPresent.map(c => ({ key: c, label: catName(c) })), selCat)
    + renderTabs([{ key: 'ALL', label: 'Tutti i gironi' }, ...gironi.map(g => ({ key: g, label: g }))], selGir)
  const bars = document.querySelectorAll<HTMLElement>('#viewtabs .pf-tabs')
  bars[0].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b =>
    b.addEventListener('click', () => { selCat = b.dataset.key!; selGir = 'ALL'; renderViews() }))
  bars[1].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b =>
    b.addEventListener('click', () => { selGir = b.dataset.key!; renderViews() }))
  const rows = getStandings(id).filter(s => s.categoryId === selCat && (selGir === 'ALL' || s.groupLabel === selGir))
  document.getElementById('standings')!.innerHTML = renderStandings(rows, catName)
}

if (!published) {
  document.getElementById('standings')!.innerHTML = `<p class="pf-muted">Le classifiche non sono ancora state pubblicate.</p>`
} else {
  renderViews()
}
```

- [ ] **Step 5: Verify build + behaviour**

Run: `cd playfusion-web && npm run build`
Expected: succeeds; `npm test` green (22).

`npm run dev`: after publishing, open the public calendar and standings — each shows category + girone tabs and filters accordingly; before publishing, the "non ancora pubblicato/pubblicate" messages are unchanged (no tabs).

- [ ] **Step 6: Commit**

```bash
cd playfusion-web
git add apps/public/calendar.html apps/public/calendar.ts apps/public/standings.html apps/public/standings.ts
git commit -m "feat: E3 public calendar + standings category/girone tabs"
```

---

### Task 4: End-to-end verification

**Files:** none.

- [ ] **Step 1: Full suite + build**

Run: `cd playfusion-web && npm test && npm run build`
Expected: 22 tests pass; build succeeds.

- [ ] **Step 2: Manual walkthrough (acceptance)**

`npm run dev`: Hub → Reset → Organizer → Memorial → Genera calendario. Above the calendar, category tabs (U10/U12/U14) + girone tabs appear; picking U12 filters both calendar and standings to U12; picking "Girone A" narrows both; switching to U14 resets girone to "Tutti". Approva → Pubblica → open public calendar and standings from the landing → the same tabs filter each view. On a narrow window the tab bars scroll horizontally; the page does not scroll sideways.
Expected: spec success criteria 1–5.

---

## Self-Review

**1. Spec coverage:**
- `renderTabs` component + styles → Task 1. ✓
- Selection state + filter (default first category, girone ALL, reset on category change) → Tasks 2/3 (`renderViews`). ✓
- E1 shared selector over calendar + standings → Task 2. ✓
- E3 calendar tabs + E3 standings tabs → Task 3. ✓
- Tabs only when data (status ≠ NONE / published) → Task 2 render() branch + Task 3 `published` guard. ✓
- `renderCalendar`/`renderStandings` unchanged (filtered inputs) → Tasks 2/3. ✓
- Mobile-scroll tab bar, no page horizontal scroll → Task 1 CSS (`overflow-x: auto`). ✓
- No store/type/domain change; tests stay green (22) → verified each task. ✓
- Success criteria 1–5 → Task 4. ✓

**2. Placeholder scan:** No TBD/TODO; full code in every step.

**3. Type consistency:** `renderTabs(items: {key,label}[], activeKey)` signature identical across chrome.ts and all three call sites. `selCat`/`selGir` semantics and the `inSel` filter (`categoryId === selCat && (selGir === 'ALL' || groupLabel === selGir)`) identical across E1 + E3. `#viewtabs` container id present in all three HTML files; `.pf-tabs`/`.pf-tab` classes match the CSS.
