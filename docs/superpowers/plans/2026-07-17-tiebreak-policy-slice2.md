# Tie-break policy — Slice 2 (manual residual-tie resolution) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the organizer manually order a group left perfectly tied by the policy; the override unblocks the standings order and finals qualification, and self-invalidates if the tied set later changes.

**Architecture:** A `tieOverrides` collection (keyed by event+category+group, value = ordered team list). `rankStanding` takes an optional `overrides` argument: at policy exhaustion it applies a matching override (exact team set) instead of marking the group unresolved. Store `setTieOverride` upserts and re-resolves finals. An E1-only panel orders the tied teams (up/down); the public surface stays read-only.

**Tech Stack:** Vite MPA, vanilla TypeScript, Vitest + jsdom. Mock store in `shared/mock/`.

## Global Constraints

- No new dependencies; no framework.
- `rankStanding`'s new `overrides` argument is `string[][]` (each an ordered team-name list) and defaults to `[]` — the signature stays backward compatible via the default.
- An override applies to a tied group ONLY when it covers the exact same set of teams (same length, same members). Otherwise it is ignored (self-invalidation).
- Override matching happens ONLY at policy exhaustion (a group the criteria could not separate) — never overrides a criterion that did separate teams.
- Manual ordering UI is E1-only (organizer). The public standings/bracket stay read-only. No drag-and-drop — up/down buttons.
- Italian UI copy.
- `RankResult` shape unchanged: `{ rows, unresolved }`; `unresolved` lists only groups with NO matching override.

---

### Task 1: `TieOverride` model + `rankStanding` override support

**Files:**
- Modify: `shared/mock/types.ts` (add `TieOverride`; add `tieOverrides` to `State`)
- Modify: `shared/mock/seed.ts` (add `tieOverrides: []` to the seed state)
- Modify: `shared/mock/ranking.ts` (add `overrides` param)
- Test: `shared/mock/ranking.test.ts` (append 2 override tests)

**Interfaces:**
- Produces: `interface TieOverride { eventId: string; categoryId: string; groupLabel: string; order: string[] }`; `State.tieOverrides: TieOverride[]`; `rankStanding(rows, matches, policy, overrides?: string[][]): RankResult`.

- [ ] **Step 1: Append the failing override tests**

Append to `shared/mock/ranking.test.ts`, inside the existing `describe('rankStanding — policy engine', ...)` block (before its closing `})`):

```ts
  it('applies a matching override to a fully-tied group instead of marking it unresolved', () => {
    const rows = [row('Alfa', 4, 3, 1), row('Bravo', 4, 3, 1)] // identical → tie
    const res = rankStanding(rows, [mt('Alfa', 1, 'Bravo', 1)], P, [['Bravo', 'Alfa']])
    expect(res.rows.map(r => r.team)).toEqual(['Bravo', 'Alfa'])
    expect(res.unresolved).toEqual([])
  })

  it('ignores an override whose team set does not match the tied group', () => {
    const rows = [row('Alfa', 4, 3, 1), row('Bravo', 4, 3, 1)]
    const res = rankStanding(rows, [mt('Alfa', 1, 'Bravo', 1)], P, [['Alfa', 'Charlie']])
    expect(res.rows.map(r => r.team)).toEqual(['Alfa', 'Bravo']) // name-stable fallback
    expect(res.unresolved).toEqual([['Alfa', 'Bravo']])
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- ranking`
Expected: FAIL — `rankStanding` ignores the 4th argument; the first new test gets `['Alfa','Bravo']` and a non-empty `unresolved`.

- [ ] **Step 3: Add `overrides` to `rankStanding`**

In `shared/mock/ranking.ts`, change the signature and the policy-exhaustion branch. The function header becomes:

```ts
export function rankStanding(rows: StandingRow[], matches: ScheduledMatch[], policy: TieBreakCriterion[], overrides: string[][] = []): RankResult {
```

And the `if (ci >= policy.length)` branch inside `order` becomes:

```ts
    if (ci >= policy.length) {
      const names = group.map(r => r.team)
      const ov = overrides.find(o => o.length === group.length && o.every(t => names.includes(t)))
      if (ov) return ov.map(t => group.find(r => r.team === t)!) // resolved manually — not unresolved
      const sorted = [...group].sort((a, b) => a.team.localeCompare(b.team))
      unresolved.push(sorted.map(r => r.team))
      return sorted
    }
```

(Everything else in `rankStanding` is unchanged.)

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- ranking`
Expected: PASS (8 tests).

- [ ] **Step 5: Add the `TieOverride` type + `State` field**

In `shared/mock/types.ts`, add near the other standings-related interfaces:

```ts
export interface TieOverride {
  eventId: string
  categoryId: string
  groupLabel: string
  order: string[]
}
```

And add to the `State` interface (after `groupSlots: GroupSlot[]`):

```ts
  tieOverrides: TieOverride[]
```

- [ ] **Step 6: Seed the empty collection**

In `shared/mock/seed.ts`, the base state literal has `groupSlots: [],`. Add right after it:

```ts
    tieOverrides: [],
```

(Note: `load()` shallow-merges `{ ...buildSeed(), ...parsed }`, so a cached state without this key keeps the seed's `[]` — no migration crash.)

- [ ] **Step 7: Run suite + tsc**

Run: `npm test && npx tsc --noEmit`
Expected: full suite PASS (62 + 2 = 64), tsc clean. (No consumer passes overrides yet — the default keeps everything working.)

- [ ] **Step 8: Commit**

```bash
git add shared/mock/types.ts shared/mock/seed.ts shared/mock/ranking.ts shared/mock/ranking.test.ts
git commit -m "feat(tiebreak): TieOverride model + rankStanding override support"
```

---

### Task 2: store `getTieOverrides`/`setTieOverride` + policy-aware resolution reads overrides

**Files:**
- Modify: `shared/mock/store.ts` (add `getTieOverrides`, `setTieOverride`; import `TieOverride`)
- Modify: `shared/mock/derive.ts` (`resolveSlot` passes overrides to `rankStanding`)
- Test: `shared/mock/tiebreak-demo.test.ts` (append override end-to-end tests)

**Interfaces:**
- Consumes: `resolveFinals` (already imported in store.ts), `TieOverride` from `./types`.
- Produces: `getTieOverrides(eventId: string): TieOverride[]`; `setTieOverride(eventId: string, categoryId: string, groupLabel: string, order: string[]): void`.

- [ ] **Step 1: Append the failing store tests**

Append to `shared/mock/tiebreak-demo.test.ts`, inside the `describe(...)` block. First ensure the import line pulls the new functions — change the store import at the top of the file to include them:

```ts
import { resetDemo, getEvents, getStandings, getFinals, getScheduledMatches, getTieOverrides, setTieOverride } from './store'
```

(If the file currently imports `getScheduledMatches` on a separate line, consolidate or add `getTieOverrides, setTieOverride` alongside the others — just make all named imports resolve.)

Then append these tests:

```ts
  it('a manual override resolves the open event finals slots in the chosen order', () => {
    const cat = 'evt-tie-open-cat'
    setTieOverride('evt-tie-open', cat, 'Girone A', ['Bravo', 'Alfa'])
    const f = getFinals('evt-tie-open')[0]
    expect(f.homeResolved).toBe('Bravo') // 1ª Girone A
    expect(f.awayResolved).toBe('Alfa')  // 2ª Girone A
    expect(getTieOverrides('evt-tie-open')).toHaveLength(1)
  })

  it('a non-matching override is ignored (slots stay placeholders)', () => {
    const cat = 'evt-tie-open-cat'
    setTieOverride('evt-tie-open', cat, 'Girone A', ['Alfa', 'Charlie']) // wrong set
    const f = getFinals('evt-tie-open')[0]
    expect(f.homeResolved).toBeNull()
    expect(f.awayResolved).toBeNull()
  })
```

Note: the demo category id is `${id}-cat` per the Slice-1 `demoEvent` builder, i.e. `evt-tie-open-cat`. Confirm by reading `shared/mock/seed.ts` if unsure.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tiebreak-demo`
Expected: FAIL — `getTieOverrides`/`setTieOverride` not exported.

- [ ] **Step 3: Add the store API**

In `shared/mock/store.ts`, add the `TieOverride` type to the types import from `./types` (it already imports several types), then add these functions (near the other getters/mutators, e.g. after `getGroupSlots`):

```ts
export function getTieOverrides(eventId: string): TieOverride[] {
  return load().tieOverrides.filter(o => o.eventId === eventId)
}
export function setTieOverride(eventId: string, categoryId: string, groupLabel: string, order: string[]): void {
  const state = load()
  const existing = state.tieOverrides.find(o => o.eventId === eventId && o.categoryId === categoryId && o.groupLabel === groupLabel)
  if (existing) existing.order = order
  else state.tieOverrides.push({ eventId, categoryId, groupLabel, order })
  resolveFinals(state, eventId)
  save(state)
}
```

- [ ] **Step 4: Make `resolveSlot` read the overrides**

In `shared/mock/derive.ts`, in `resolveSlot`, after the `matches` line and before `const res = rankStanding(...)`, add:

```ts
  const overrides = state.tieOverrides.filter(o => o.eventId === eventId && o.categoryId === categoryId && o.groupLabel === group).map(o => o.order)
```

and change the `rankStanding` call to pass them:

```ts
  const res = rankStanding(rows, matches, policy, overrides)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- tiebreak-demo`
Expected: PASS (7 + 2 = 9 tests).

- [ ] **Step 6: Run suite + tsc**

Run: `npm test && npx tsc --noEmit`
Expected: full suite PASS (66), tsc clean.

- [ ] **Step 7: Commit**

```bash
git add shared/mock/store.ts shared/mock/derive.ts shared/mock/tiebreak-demo.test.ts
git commit -m "feat(tiebreak): setTieOverride/getTieOverrides; finals resolution reads overrides"
```

---

### Task 3: `renderStandings` reads overrides; E1 resolve panel

**Files:**
- Modify: `shared/chrome.ts` (`renderStandings` gains an `overrides` param, filters per girone)
- Modify: `apps/organizer/schedule.ts` (pass overrides; render resolve buttons; `openTiePanel`)
- Modify: `apps/organizer/schedule.html` (add `#tieactions` container)
- Modify: `apps/public/standings.ts` (pass overrides at both call sites)

**Interfaces:**
- Consumes: `rankStanding` from `./mock/ranking`; `getTieOverrides`, `setTieOverride` from store; `TieOverride` type.
- Produces: `renderStandings(rows, matches, policy, overrides: TieOverride[], catName)`.

- [ ] **Step 1: Update `renderStandings` signature + per-girone filter**

In `shared/chrome.ts`, add `TieOverride` to the type import (line 6 area). Change the function header:

```ts
export function renderStandings(rows: StandingRow[], matches: ScheduledMatch[], policy: TieBreakCriterion[], overrides: TieOverride[], catName: (id: string) => string): string {
```

Inside the per-girone body, the line that currently reads:

```ts
      const { rows: gr, unresolved } = rankStanding(catRows.filter(r => r.groupLabel === g), gm, policy)
```

becomes:

```ts
      const ov = overrides.filter(o => o.categoryId === catId && o.groupLabel === g).map(o => o.order)
      const { rows: gr, unresolved } = rankStanding(catRows.filter(r => r.groupLabel === g), gm, policy, ov)
```

- [ ] **Step 2: Update the public call sites**

In `apps/public/standings.ts`: add `getTieOverrides` to the store import. The empty-state call `renderStandings([], [], [], catName)` becomes `renderStandings([], [], [], [], catName)`. The main call becomes:

```ts
  document.getElementById('standings')!.innerHTML = renderStandings(rows, getScheduledMatches(id), getEvent(id)?.tieBreak ?? [], getTieOverrides(id), catName)
```

- [ ] **Step 3: Add the `#tieactions` container to schedule.html**

In `apps/organizer/schedule.html`, between `<div id="standings"></div>` and `<div id="finals"></div>`, insert:

```html
    <div id="tieactions"></div>
```

- [ ] **Step 4: Update schedule.ts imports + standings call + resolve buttons + panel**

In `apps/organizer/schedule.ts`:

Add to the store import: `getTieOverrides`, `setTieOverride`. Add to the chrome import nothing new. Add a value import of `rankStanding` and a type import of `TieOverride`:

```ts
import { rankStanding } from '../../shared/mock/ranking'
import type { CategorySchedule, ScheduleConfig, TieOverride } from '../../shared/mock/types'
```

Change the standings render call (currently line ~195) to pass overrides:

```ts
    + renderStandings(getStandings(id).filter(s => inSel(s.categoryId, s.groupLabel)), getScheduledMatches(id), getEvent(id)?.tieBreak ?? [], getTieOverrides(id), catName)
```

Immediately AFTER the block that sets `document.getElementById('standings')!.innerHTML = ...` (and before or after the finals block — placement under standings is fine), add the resolve-buttons rendering. Add this inside `renderViews()`:

```ts
  // Manual tie resolution (E1 only): a button per still-unresolved group in view.
  const tieEl = document.getElementById('tieactions')!
  const visRows = getStandings(id).filter(s => inSel(s.categoryId, s.groupLabel))
  const ovAll = getTieOverrides(id)
  const seenG: Array<{ cat: string; g: string }> = []
  for (const s of visRows) if (!seenG.some(x => x.cat === s.categoryId && x.g === s.groupLabel)) seenG.push({ cat: s.categoryId, g: s.groupLabel })
  const tieGroups: Array<{ cat: string; g: string; teams: string[] }> = []
  for (const { cat, g } of seenG) {
    const grows = visRows.filter(s => s.categoryId === cat && s.groupLabel === g)
    const gms = getScheduledMatches(id).filter(m => m.categoryId === cat && m.groupLabel === g)
    const ov = ovAll.filter(o => o.categoryId === cat && o.groupLabel === g).map(o => o.order)
    const res = rankStanding(grows, gms, getEvent(id)?.tieBreak ?? [], ov)
    for (const grp of res.unresolved) tieGroups.push({ cat, g, teams: grp })
  }
  tieEl.innerHTML = tieGroups.map((u, i) => `<button class="pf-btn" data-tie="${i}">Risolvi parità · ${u.g}: ${u.teams.join(', ')}</button>`).join('')
  tieEl.querySelectorAll<HTMLButtonElement>('button[data-tie]').forEach(b =>
    b.addEventListener('click', () => { const u = tieGroups[Number(b.dataset.tie)]; openTiePanel(u.cat, u.g, u.teams) }))
```

Add the `openTiePanel` function (near `openResultPanel`):

```ts
function openTiePanel(categoryId: string, groupLabel: string, teams: string[]): void {
  const panel = document.getElementById('editmatch')!
  const order = [...teams]
  const draw = (): void => {
    panel.innerHTML = `<div class="pf-card">
      <h2>Risolvi parità</h2>
      <p class="pf-muted">${groupLabel} · ordina le squadre a pari merito</p>
      <ol class="pf-tblist">${order.map((t, i) => `<li class="pf-tbrow">
        <span>${i + 1}. ${t}</span>
        <span class="pf-tbmove">
          <button type="button" class="pf-btn pf-btn--ghost" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="pf-btn pf-btn--ghost" data-down="${i}" ${i === order.length - 1 ? 'disabled' : ''}>↓</button>
        </span></li>`).join('')}</ol>
      <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="tie-save">Salva</button><button class="pf-btn" id="tie-cancel">Annulla</button></div>
    </div>`
    panel.querySelectorAll<HTMLButtonElement>('button[data-up]').forEach(b =>
      b.addEventListener('click', () => { const i = Number(b.dataset.up); [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw() }))
    panel.querySelectorAll<HTMLButtonElement>('button[data-down]').forEach(b =>
      b.addEventListener('click', () => { const i = Number(b.dataset.down); [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw() }))
    document.getElementById('tie-save')!.addEventListener('click', () => { setTieOverride(id, categoryId, groupLabel, order); panel.innerHTML = ''; renderViews() })
    document.getElementById('tie-cancel')!.addEventListener('click', () => { panel.innerHTML = '' })
  }
  draw()
}
```

Also ensure the `#tieactions` element is cleared on the not-generated / empty branches where `#standings` is cleared (search for `document.getElementById('standings')!.innerHTML = ''` — there are a couple; add `document.getElementById('tieactions')!.innerHTML = ''` next to each so stale buttons don't linger).

- [ ] **Step 5: Verify full suite, build, tsc**

Run: `npm test && npm run build && npx tsc --noEmit`
Expected: 66 tests PASS, build OK, tsc clean.

- [ ] **Step 6: Manual smoke (optional)**

`npm run dev` → open the "Demo · Parità irrisolta" event → schedule → a "Risolvi parità" button appears under the standings → open it, reorder, save → badge disappears, standings reorder, bracket slots fill.

- [ ] **Step 7: Commit**

```bash
git add shared/chrome.ts apps/organizer/schedule.ts apps/organizer/schedule.html apps/public/standings.ts
git commit -m "feat(tiebreak): E1 manual tie-resolution panel; standings render reads overrides"
```

---

### Task 4: Docs + verification

**Files:**
- Modify: `README.md`

**Interfaces:** none.

- [ ] **Step 1: Update the README**

In `README.md`, extend the existing **Tie-break** bullet by appending a sentence:

Find the line starting `- **Tie-break** —` and append at its end:

```md
 A group left perfectly tied can be ordered manually by the organizer in E1 ("Risolvi parità"); the manual order unblocks qualification and self-invalidates if a later result changes who is tied.
```

- [ ] **Step 2: Full verification**

Run: `npm test && npm run build && npx tsc --noEmit`
Expected: 66 tests PASS, build OK, tsc clean.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(tiebreak): note manual residual-tie resolution"
```

---

## Self-Review

**Spec coverage:**
- `tieOverrides` collection keyed by group, self-invalidating — Task 1 (model) + the exact-set match in `rankStanding` (Task 1 Step 3) + `resolveSlot` (Task 2). ✔
- `rankStanding(rows, matches, policy, overrides)` applies matching override, else unresolved — Task 1. ✔
- store `getTieOverrides`/`setTieOverride` (+ resolveFinals) — Task 2. ✔
- `renderStandings` reads overrides on both surfaces — Task 3 (chrome + both call sites). ✔
- E1 resolve panel (up/down, no DnD), public read-only — Task 3. ✔
- Demo (`evt-tie-open`) end-to-end + non-matching ignored — Task 2 tests. ✔
- Success criteria 1-4 — Tasks 1,2,3. ✔

**Placeholder scan:** none — all steps carry concrete code.

**Type consistency:** `rankStanding(..., overrides: string[][] = [])` — callers pass `string[][]` (chrome/schedule map `TieOverride.order`; resolveSlot maps `.order`). `renderStandings(..., overrides: TieOverride[], catName)` used identically in both call sites. `setTieOverride(eventId, categoryId, groupLabel, order: string[])` and `getTieOverrides(eventId): TieOverride[]` consistent across store, schedule.ts, tests. `TieOverride` fields (`eventId/categoryId/groupLabel/order`) stable everywhere. Demo category id `evt-tie-open-cat` matches the Slice-1 `demoEvent` `${id}-cat` scheme.

**Note:** `openTiePanel` reuses the shared `#editmatch` panel slot (same as `openResultPanel`/`openEditPanel`); the `#tieactions` container only holds the trigger buttons. Clearing `#tieactions` on the empty branches prevents stale buttons.
