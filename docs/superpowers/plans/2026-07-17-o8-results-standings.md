# O8a — live results + standings recompute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record group-match scores in E1 and recompute standings live (points/W-D-L/goals/ranking); show scores in the calendar (E1 + public E3).

**Architecture:** `ScheduledMatch` gains nullable scores. `recordResult` sets them and recomputes the event's `StandingRow`s (3/1/0 + goals). `renderStandings` sorts by ranking; `renderCalendar` shows the score and (when editable) a "Risultato" button; E1 gets a result-entry panel. No framework.

**Tech Stack:** Vite MPA, vanilla TypeScript, Vitest + jsdom, plain HTML/CSS.

## Global Constraints

- **No framework**; vanilla TS/HTML/CSS; no backend/network; deterministic.
- Points: **win 3, draw 1, loss 0**; tie-break: **points → goal difference → goals for → team name**.
- Scores are **nullable** on the match; only played matches (both scores non-null) count.
- **Finals matches are NOT affected** (they live in `finals`, not `scheduledMatches`).
- E3 stays read-only (shows scores + live standings). Reuse Matchday classes; no hardcoded hex in screens; existing tests stay green; `tsc --noEmit` stays clean.

---

## File Structure

```
shared/mock/types.ts        # ScheduledMatch + homeScore/awayScore (number | null)
shared/mock/fixtures.ts     # buildFixtures sets homeScore/awayScore null
shared/mock/store.ts        # + recordResult + recomputeStandings (internal)
shared/mock/results.test.ts # NEW
shared/chrome.ts            # renderCalendar shows score + Risultato button; renderStandings sorts
apps/organizer/schedule.ts  # openResultPanel + wire .js-resultmatch
```

---

### Task 1: Nullable scores + `recordResult`/recompute (TDD)

**Files:**
- Modify: `shared/mock/types.ts`, `shared/mock/fixtures.ts`, `shared/mock/store.ts`
- Test: `shared/mock/results.test.ts` (new)

**Interfaces:**
- Produces: `ScheduledMatch.homeScore: number | null`, `ScheduledMatch.awayScore: number | null`; `recordResult(matchId: string, homeScore: number, awayScore: number): void`.

- [ ] **Step 1: Add the score fields in `shared/mock/types.ts`**

Add to the `ScheduledMatch` interface (after `away: string`):

```ts
  homeScore: number | null
  awayScore: number | null
```

- [ ] **Step 2: Initialise scores to null in `shared/mock/fixtures.ts`**

In `buildFixtures`, the `out.push({ ... })` object that builds a `ScheduledMatch`: add `homeScore: null, awayScore: null,` to it (e.g. right after `away: r.away`).

- [ ] **Step 3: Write the failing test `shared/mock/results.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, generateSchedule, getScheduledMatches, getStandings, recordResult } from './store'
import type { ScheduleConfig } from './types'

const config: ScheduleConfig = {
  dailyStart: '09:00', slotsPerDay: 8, finalsDate: '2026-08-30',
  byCategory: {
    'cat-1': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
    'cat-2': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
    'cat-3': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
  },
}
const rowFor = (eventId: string, m: { categoryId: string; team: string }) =>
  getStandings(eventId).find(s => s.categoryId === m.categoryId && s.team === m.team)!

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('results + standings recompute', () => {
  it('unplayed → all standings zero', () => {
    generateSchedule('evt-1', config)
    expect(getStandings('evt-1').every(s => s.played === 0 && s.points === 0)).toBe(true)
  })

  it('a win gives 3 pts to home, 0 to away, with goals', () => {
    generateSchedule('evt-1', config)
    const m = getScheduledMatches('evt-1')[0]
    recordResult(m.id, 2, 1)
    expect(rowFor('evt-1', { categoryId: m.categoryId, team: m.home })).toMatchObject({ played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 1, points: 3 })
    expect(rowFor('evt-1', { categoryId: m.categoryId, team: m.away })).toMatchObject({ played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 1, goalsAgainst: 2, points: 0 })
  })

  it('re-recording as a draw recomputes to 1 pt each', () => {
    generateSchedule('evt-1', config)
    const m = getScheduledMatches('evt-1')[0]
    recordResult(m.id, 2, 1)
    recordResult(m.id, 1, 1)
    expect(rowFor('evt-1', { categoryId: m.categoryId, team: m.home })).toMatchObject({ played: 1, won: 0, drawn: 1, lost: 0, points: 1 })
    expect(rowFor('evt-1', { categoryId: m.categoryId, team: m.away })).toMatchObject({ played: 1, drawn: 1, points: 1 })
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd playfusion-web && npx vitest run shared/mock/results.test.ts`
Expected: FAIL — `recordResult` not exported.

- [ ] **Step 5: Implement in `shared/mock/store.ts`**

Append:

```ts
function recomputeStandings(state: State, eventId: string): void {
  for (const s of state.standings) {
    if (s.eventId !== eventId) continue
    s.played = 0; s.won = 0; s.drawn = 0; s.lost = 0; s.goalsFor = 0; s.goalsAgainst = 0; s.points = 0
  }
  for (const m of state.scheduledMatches) {
    if (m.eventId !== eventId || m.homeScore === null || m.awayScore === null) continue
    const h = state.standings.find(s => s.eventId === eventId && s.categoryId === m.categoryId && s.team === m.home)
    const a = state.standings.find(s => s.eventId === eventId && s.categoryId === m.categoryId && s.team === m.away)
    if (!h || !a) continue
    h.played++; a.played++
    h.goalsFor += m.homeScore; h.goalsAgainst += m.awayScore
    a.goalsFor += m.awayScore; a.goalsAgainst += m.homeScore
    if (m.homeScore > m.awayScore) { h.won++; h.points += 3; a.lost++ }
    else if (m.homeScore < m.awayScore) { a.won++; a.points += 3; h.lost++ }
    else { h.drawn++; a.drawn++; h.points++; a.points++ }
  }
}
export function recordResult(matchId: string, homeScore: number, awayScore: number): void {
  const state = load()
  const m = state.scheduledMatches.find(x => x.id === matchId)
  if (!m) { save(state); return }
  m.homeScore = homeScore; m.awayScore = awayScore
  recomputeStandings(state, m.eventId)
  save(state)
}
```

- [ ] **Step 6: Run the full suite**

Run: `cd playfusion-web && npm test && npx tsc --noEmit`
Expected: PASS — 42 tests green (39 + 3 new); tsc clean.

- [ ] **Step 7: Commit**

```bash
cd playfusion-web
git add shared/mock/types.ts shared/mock/fixtures.ts shared/mock/store.ts shared/mock/results.test.ts
git commit -m "feat: match scores + recordResult/recompute standings (O8→O6)"
```

---

### Task 2: Show scores + sort standings + E1 result entry

**Files:**
- Modify: `shared/chrome.ts`, `apps/organizer/schedule.ts`

**Interfaces:**
- Consumes: `recordResult`, `getScheduledMatches` (store).
- Produces: `renderCalendar` shows the score + a `.js-resultmatch` button when editable; `renderStandings` renders rows sorted by ranking.

- [ ] **Step 1: Update `renderCalendar` in `shared/chrome.ts`**

Replace the row template in `renderCalendar` so it shows the score when played and adds the result button when editable:

```ts
      .map(m => {
        const played = m.homeScore !== null && m.awayScore !== null
        const teams = played
          ? `${m.home} <b>${m.homeScore}–${m.awayScore}</b> ${m.away}`
          : `${m.home} <b>vs</b> ${m.away}`
        const actions = editable
          ? `<button class="pf-btn js-editmatch" data-match="${m.id}" style="margin-top:6px">Modifica</button>
             <button class="pf-btn js-resultmatch" data-match="${m.id}" style="margin-top:6px">Risultato</button>`
          : ''
        return `<li class="pf-match">
          <span class="pf-match__time">${m.time}</span>
          <span class="pf-match__field">${m.field}</span>
          <span class="pf-match__cat">${catName(m.categoryId)} · ${m.groupLabel}</span>
          <span class="pf-match__teams">${teams}</span>
          ${actions}
        </li>`
      }).join('')
```

- [ ] **Step 2: Sort standings by ranking in `renderStandings` (`shared/chrome.ts`)**

In `renderStandings`, where the per-group rows `gr` are computed, sort them before mapping:

```ts
      const gr = catRows.filter(r => r.groupLabel === g)
        .sort((a, b) => b.points - a.points
          || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
          || b.goalsFor - a.goalsFor
          || a.team.localeCompare(b.team))
```

(The `i + 1` position now reflects the ranking. No other change to the table markup.)

- [ ] **Step 3: Add `openResultPanel` + wiring in `apps/organizer/schedule.ts`**

Add `recordResult` to the store import. Add this function next to `openEditPanel`:

```ts
function openResultPanel(matchId: string): void {
  const m = getScheduledMatches(id).find(x => x.id === matchId)
  if (!m) return
  const panel = document.getElementById('editmatch')!
  panel.innerHTML = `<div class="pf-card">
    <h2>Risultato</h2>
    <p class="pf-muted">${m.home} vs ${m.away}</p>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${m.home}</label><input id="rs-home" type="number" min="0" value="${m.homeScore ?? 0}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${m.away}</label><input id="rs-away" type="number" min="0" value="${m.awayScore ?? 0}" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="rs-save">Salva</button><button class="pf-btn" id="rs-cancel">Annulla</button></div>
  </div>`
  document.getElementById('rs-save')!.addEventListener('click', () => {
    recordResult(matchId, Number((document.getElementById('rs-home') as HTMLInputElement).value), Number((document.getElementById('rs-away') as HTMLInputElement).value))
    renderViews()
  })
  document.getElementById('rs-cancel')!.addEventListener('click', () => { panel.innerHTML = '' })
}
```

In `renderViews`, where `.js-editmatch` buttons are wired (after the `#calendar` innerHTML is set), add wiring for the result buttons:

```ts
  document.querySelectorAll<HTMLButtonElement>('#calendar .js-resultmatch').forEach(b =>
    b.addEventListener('click', () => openResultPanel(b.dataset.match!)))
```

- [ ] **Step 4: Verify build + behaviour**

Run: `cd playfusion-web && npm run build && npm test && npx tsc --noEmit`
Expected: build succeeds; 42 tests green; tsc clean.

`npm run dev`: after generating, each calendar match shows "Modifica" + "Risultato". Enter a score → the row shows "A 2–1 B" and the standings section re-orders with real points. Public `standings.html` / `calendar.html` reflect the scores + ranking.

- [ ] **Step 5: Commit**

```bash
cd playfusion-web
git add shared/chrome.ts apps/organizer/schedule.ts
git commit -m "feat: show match scores + result entry (E1) + ranked standings"
```

---

### Task 3: End-to-end verification + README

**Files:** `README.md`

- [ ] **Step 1: Full suite + build + tsc**

Run: `cd playfusion-web && npm test && npm run build && npx tsc --noEmit`
Expected: 42 tests pass; build succeeds; tsc clean.

- [ ] **Step 2: Manual walkthrough (acceptance)**

`npm run dev`: Hub → Reset → Organizer → Memorial → Componi gironi → Genera calendario → open the Finali/calendario; record a couple of group results for U10 via "Risultato" → the U10 standings re-order with real points and the match rows show scores. Approva → Pubblica → the public calendar shows scores and the public standings show the live ranking.
Expected: spec success criteria 1–4.

- [ ] **Step 3: Update `README.md`**

Under `## Scope`, add:

```markdown
- **Live results** — record group-match scores in E1 (O8); standings recompute (points 3/1/0, tie-break) and re-rank; scores show in the calendar (E1 + public).
```

- [ ] **Step 4: Commit**

```bash
cd playfusion-web
git add README.md
git commit -m "docs: note live results in README"
```

---

## Self-Review

**1. Spec coverage:**
- Nullable scores on `ScheduledMatch` (init null) → Task 1. ✓
- `recordResult` + recompute (3/1/0, goals, only played) → Task 1 + tests. ✓
- Ranking sort (points→DR→GF→name) in `renderStandings` → Task 2 Step 2. ✓
- Score display in `renderCalendar` (E1 + E3) → Task 2 Step 1. ✓
- E1 result entry panel → Task 2 Step 3. ✓
- Finals unaffected (they're in `finals`, not `scheduledMatches`) → recompute iterates scheduledMatches only. ✓
- Correction recomputes; reset zeroes → Task 1 (re-record test) + seed. ✓
- Blueprint D-O8-1 → coordinator post-step. ✓
- Success criteria 1–4 → Task 3. ✓

**2. Placeholder scan:** No TBD/TODO; full code in every step.

**3. Type consistency:** `ScheduledMatch.homeScore/awayScore: number | null` set in buildFixtures, read in recompute + renderCalendar + result panel. `recordResult(matchId, homeScore, awayScore)` identical in store, test, and `openResultPanel` call. `renderCalendar`/`renderStandings` remain the same exported signatures (internal changes only) — E3 call sites unaffected. Standing stat fields (played/won/drawn/lost/goalsFor/goalsAgainst/points) consistent between recompute and renderStandings.
