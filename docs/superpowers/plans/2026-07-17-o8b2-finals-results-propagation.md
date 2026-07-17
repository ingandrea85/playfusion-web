# O8b-2 — Finals results + winner propagation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record finals-bracket match results and propagate winners (`Vincente SF1` → the semifinal winner, up to the champion), with a multi-round demo event.

**Architecture:** `FinalMatch` gains nullable scores. `resolveFinals` becomes an iterative fixpoint that resolves both qualifier placeholders (`Nª Girone X`, unchanged) and winner placeholders (`Vincente <round><order>`) from decided matches in the same bracket. `recordFinalResult` records a bracket-match score and re-resolves. `renderBracket` shows scores + a champion line and (when editable) a per-match result button; the public bracket stays read-only.

**Tech Stack:** Vite MPA, vanilla TypeScript, Vitest + jsdom. Mock store in `shared/mock/`.

## Global Constraints

- No new dependencies; no framework.
- Winner placeholder form: `^Vincente (SF|QF|OF|F|T)(\d+)$`; the source match is the one in the SAME `eventId`+`categoryId`+`bracketLabel` whose `roundShort(round)` = the code and `order` = the number.
- A winner propagates ONLY when its source match has both participants resolved, both scores recorded, and the scores are NOT equal. A draw (equal scores) or an unplayed match propagates nothing (`null`).
- `roundShort` is single-sourced: exported from `shared/mock/finals.ts`, imported by `derive.ts`.
- `resolveFinals` re-derives from scratch each call and is idempotent; correcting a result re-propagates.
- The champion of a `bracketLabel` is the winner of its `Finale`-round match.
- Public standings/bracket stay read-only. No drag-and-drop.
- Italian UI copy.

---

### Task 1: `FinalMatch` scores + demo finals via `buildFinals` + multi-round demo event

**Files:**
- Modify: `shared/mock/types.ts` (`FinalMatch` gains `homeScore`/`awayScore`)
- Modify: `shared/mock/store.ts:161` (init the two fields to `null` in the `generateSchedule` finals push)
- Modify: `shared/mock/seed.ts` (`demoEvent` builds finals via `buildFinals` + gains a `qualifiers` param; add the `evt-finals` demo)
- Test: `shared/mock/finals-propagation.test.ts` (create — fixture-shape tests)

**Interfaces:**
- Produces: `FinalMatch.homeScore: number | null`, `FinalMatch.awayScore: number | null`; `demoEvent(id, name, teams, results, qualifiers = 2)`; new seed event `evt-finals` (category `evt-finals-cat`, bracket matches `evt-finals-f1/f2/f3`).

- [ ] **Step 1: Write the failing fixture test**

Create `shared/mock/finals-propagation.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getFinals } from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('finals bracket — demo fixture', () => {
  it('evt-finals seeds two semifinals and a final', () => {
    const f = getFinals('evt-finals')
    expect(f.filter(x => x.round === 'Semifinali')).toHaveLength(2)
    expect(f.filter(x => x.round === 'Finale')).toHaveLength(1)
  })

  it('the semifinals have resolved participants (group complete), the final does not yet', () => {
    const f = getFinals('evt-finals')
    const semis = f.filter(x => x.round === 'Semifinali')
    for (const s of semis) { expect(s.homeResolved).not.toBeNull(); expect(s.awayResolved).not.toBeNull() }
    const finale = f.find(x => x.round === 'Finale')!
    expect(finale.homeResolved).toBeNull() // "Vincente SF1" — no result yet
    expect(finale.awayResolved).toBeNull()
  })

  it('finals matches start with null scores', () => {
    for (const f of getFinals('evt-finals')) { expect(f.homeScore).toBeNull(); expect(f.awayScore).toBeNull() }
  })

  it('existing single-final demos are unchanged (evt-tie-open still 1ª vs 2ª)', () => {
    const f = getFinals('evt-tie-open')
    expect(f).toHaveLength(1)
    expect(f[0].home).toBe('1ª Girone A')
    expect(f[0].away).toBe('2ª Girone A')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- finals-propagation`
Expected: FAIL — `evt-finals` not seeded.

- [ ] **Step 3: Add scores to `FinalMatch`**

In `shared/mock/types.ts`, the `FinalMatch` interface (ends with `homeResolved`/`awayResolved`). Add after them:

```ts
  homeScore: number | null
  awayScore: number | null
```

- [ ] **Step 4: Init scores in `generateSchedule`**

In `shared/mock/store.ts` line 161, the `finalsOut.push({ ... homeResolved: null, awayResolved: null })`. Add the two fields:

```ts
      finalsOut.push({ id: `fm-${++fseq}`, eventId, categoryId: cat.id, bracketLabel: d.bracketLabel, round: d.round, order: d.order, home: d.home, away: d.away, day: config.finalsDate, time: addMinutes(config.dailyStart, si * slotMinutes), field: fields[fi], homeResolved: null, awayResolved: null, homeScore: null, awayScore: null })
```

- [ ] **Step 5: Make `demoEvent` build finals via `buildFinals` + a `qualifiers` param**

In `shared/mock/seed.ts`, add the import (top of file, after the existing `./derive` import):

```ts
import { buildFinals } from './finals'
```

Change the `demoEvent` signature to accept `qualifiers`:

```ts
function demoEvent(id: string, name: string, teams: string[], results: [number, number, number, number][], qualifiers = 2): {
```

In `demoEvent`, set the competition's `qualifiersPerGroup` to the param (find `qualifiersPerGroup: 2` in the `competition` literal and change it to `qualifiersPerGroup: qualifiers,`). Then REPLACE the hardcoded `const finals: FinalMatch[] = [{ ... }]` block with:

```ts
  const finals: FinalMatch[] = buildFinals(['Girone A'], qualifiers, 'SINGLE_GROUP_CROSSOVER').map((d, i) => ({
    id: `${id}-f${i + 1}`, eventId: id, categoryId: catId, bracketLabel: d.bracketLabel, round: d.round, order: d.order,
    home: d.home, away: d.away, day: '2026-09-01', time: '11:00', field: 'Campo 1',
    homeResolved: null, awayResolved: null, homeScore: null, awayScore: null,
  }))
```

(For `qualifiers = 2` this yields exactly one final `1ª Girone A` vs `2ª Girone A` — identical to before — so the existing demos are unchanged.)

- [ ] **Step 6: Add the `evt-finals` demo to the `DEMOS` array**

In `shared/mock/seed.ts`, add a 6th entry to `DEMOS` (4 teams, a clean 1-2-3-4 finish, `qualifiers = 4`):

```ts
  demoEvent('evt-finals', 'Demo · Tabellone (semifinali)', ['Alfa', 'Bravo', 'Charlie', 'Delta'],
    [[0, 1, 1, 0], [0, 1, 2, 0], [0, 1, 3, 0], [1, 1, 2, 0], [1, 1, 3, 0], [2, 1, 3, 0]], 4),
```

(Alfa beats all → 1ª; Bravo beats C,D → 2ª; Charlie beats D → 3ª; Delta → 4ª. Crossover Q4 → SF1 `1ª vs 4ª`, SF2 `2ª vs 3ª`, Finale `Vincente SF1 vs Vincente SF2`.)

- [ ] **Step 7: Update the event-count assertion**

Adding one demo event grows the seed from 6 events to 7. In `shared/mock/store.test.ts`, the "seeds one event" test asserts `getEvents()).toHaveLength(6)` → change to `7`. In `shared/mock/organizations.test.ts`, the org-1 event count `toHaveLength(6)` → change to `7` (evt-finals also hardcodes `organizationId: 'org-1'`). The `createEvent` test id (`evt-2`) and count (`toHaveLength(7)`) — the count becomes `8` now (7 seed + 1 created); update it. The `addCategory` id test (`cat-9`) becomes `cat-10` (8 seed categories + evt-finals-cat = 9, next is cat-10). Read those tests and update each count/id to reflect one more event+category.

- [ ] **Step 8: Run tests + tsc**

Run: `npm test && npx tsc --noEmit`
Expected: `finals-propagation` 4 tests PASS; full suite PASS (67 + 4 = 71, minus none); tsc clean. Fix any count assertion the run flags in store.test.ts / organizations.test.ts.

- [ ] **Step 9: Commit**

```bash
git add shared/mock/types.ts shared/mock/store.ts shared/mock/seed.ts shared/mock/finals-propagation.test.ts shared/mock/store.test.ts shared/mock/organizations.test.ts
git commit -m "feat(o8b2): FinalMatch scores + demo finals via buildFinals + multi-round demo event"
```

---

### Task 2: Winner propagation engine + `recordFinalResult`

**Files:**
- Modify: `shared/mock/finals.ts` (export `roundShort`)
- Modify: `shared/mock/derive.ts` (`resolveFinals` fixpoint; `resolveSlot` gains `bracketLabel` + winner resolution)
- Modify: `shared/mock/store.ts` (add `recordFinalResult`)
- Test: `shared/mock/finals-propagation.test.ts` (append propagation tests)

**Interfaces:**
- Consumes: `roundShort` from `./finals`.
- Produces: `recordFinalResult(finalMatchId: string, homeScore: number, awayScore: number): void`. `resolveSlot(state, eventId, categoryId, bracketLabel, placeholder)` (internal, new arg).

- [ ] **Step 1: Append the failing propagation tests**

Append to `shared/mock/finals-propagation.test.ts` — add `recordFinalResult` to the store import at the top:

```ts
import { resetDemo, getFinals, recordFinalResult } from './store'
```

and add a second `describe`:

```ts
describe('finals bracket — winner propagation', () => {
  const finale = () => getFinals('evt-finals').find(f => f.round === 'Finale')!
  const semi = (order: number) => getFinals('evt-finals').find(f => f.round === 'Semifinali' && f.order === order)!

  it('propagates semifinal winners into the final', () => {
    recordFinalResult(semi(1).id, 2, 0) // SF1 home wins
    recordFinalResult(semi(2).id, 1, 0) // SF2 home wins
    expect(finale().homeResolved).toBe(semi(1).homeResolved) // Vincente SF1
    expect(finale().awayResolved).toBe(semi(2).homeResolved) // Vincente SF2
  })

  it('a drawn knockout match propagates no winner', () => {
    recordFinalResult(semi(1).id, 1, 1) // draw
    expect(finale().homeResolved).toBeNull()
  })

  it('correcting a result re-propagates', () => {
    recordFinalResult(semi(1).id, 2, 0) // home wins
    recordFinalResult(semi(2).id, 1, 0)
    expect(finale().homeResolved).toBe(semi(1).homeResolved)
    recordFinalResult(semi(1).id, 0, 2) // now away wins
    expect(finale().homeResolved).toBe(semi(1).awayResolved)
  })

  it('the final winner is determined once the final is played', () => {
    recordFinalResult(semi(1).id, 2, 0)
    recordFinalResult(semi(2).id, 1, 0)
    const f = finale()
    recordFinalResult(f.id, 3, 1) // home wins the final
    const played = getFinals('evt-finals').find(x => x.round === 'Finale')!
    expect(played.homeScore).toBe(3)
    expect(played.homeScore! > played.awayScore!).toBe(true) // home (Vincente SF1) is champion
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- finals-propagation`
Expected: FAIL — `recordFinalResult` not exported / no propagation.

- [ ] **Step 3: Export `roundShort` from `finals.ts`**

In `shared/mock/finals.ts`, change `function roundShort(round: string): string {` to `export function roundShort(round: string): string {`.

- [ ] **Step 4: Extend `resolveSlot` + make `resolveFinals` a fixpoint**

In `shared/mock/derive.ts`, add the import:

```ts
import { roundShort } from './finals'
```

Replace the `resolveSlot` signature and body so it takes `bracketLabel` and also resolves winner placeholders:

```ts
function resolveSlot(state: State, eventId: string, categoryId: string, bracketLabel: string, placeholder: string): string | null {
  const mt = /^(\d+)ª (Girone .+)$/.exec(placeholder)
  if (mt) {
    const pos = Number(mt[1])
    const group = mt[2]
    if (!groupComplete(state, eventId, categoryId, group)) return null
    const policy = state.events.find(e => e.id === eventId)?.tieBreak ?? []
    const rows = state.standings.filter(s => s.eventId === eventId && s.categoryId === categoryId && s.groupLabel === group)
    const matches = state.scheduledMatches.filter(m => m.eventId === eventId && m.categoryId === categoryId && m.groupLabel === group)
    const overrides = state.tieOverrides.filter(o => o.eventId === eventId && o.categoryId === categoryId && o.groupLabel === group).map(o => o.order)
    const res = rankStanding(rows, matches, policy, overrides)
    const team = res.rows[pos - 1]?.team ?? null
    if (team === null) return null
    if (res.unresolved.some(g => g.includes(team))) return null
    return team
  }
  const w = /^Vincente (SF|QF|OF|F|T)(\d+)$/.exec(placeholder)
  if (w) {
    const code = w[1]
    const ord = Number(w[2])
    const src = state.finals.find(f => f.eventId === eventId && f.categoryId === categoryId && f.bracketLabel === bracketLabel && roundShort(f.round) === code && f.order === ord)
    if (!src || src.homeScore === null || src.awayScore === null) return null
    if (src.homeResolved === null || src.awayResolved === null) return null
    if (src.homeScore === src.awayScore) return null // no winner on a draw
    return src.homeScore > src.awayScore ? src.homeResolved : src.awayResolved
  }
  return null
}
```

Replace `resolveFinals` with the fixpoint form:

```ts
// Re-derive every finals slot for the event from current standings + recorded
// bracket results. Iterative: a decided match feeds the next round's winner slot.
export function resolveFinals(state: State, eventId: string): void {
  const evFinals = state.finals.filter(f => f.eventId === eventId)
  for (let pass = 0; pass < 8; pass++) { // fixpoint; cap well above any bracket depth
    let changed = false
    for (const f of evFinals) {
      const h = resolveSlot(state, eventId, f.categoryId, f.bracketLabel, f.home)
      const a = resolveSlot(state, eventId, f.categoryId, f.bracketLabel, f.away)
      if (h !== f.homeResolved) { f.homeResolved = h; changed = true }
      if (a !== f.awayResolved) { f.awayResolved = a; changed = true }
    }
    if (!changed) break
  }
}
```

- [ ] **Step 5: Add `recordFinalResult` to the store**

In `shared/mock/store.ts`, near `recordResult`, add:

```ts
export function recordFinalResult(finalMatchId: string, homeScore: number, awayScore: number): void {
  const state = load()
  const f = state.finals.find(x => x.id === finalMatchId)
  if (!f) { save(state); return }
  f.homeScore = homeScore; f.awayScore = awayScore
  resolveFinals(state, f.eventId)
  save(state)
}
```

- [ ] **Step 6: Run the propagation tests**

Run: `npm test -- finals-propagation`
Expected: PASS (4 + 4 = 8 tests).

- [ ] **Step 7: Run full suite + tsc**

Run: `npm test && npx tsc --noEmit`
Expected: full suite PASS (75), tsc clean. (Existing O8b `finals-resolve` tests still green: PLACEMENT/qualifier resolution is unchanged; the fixpoint converges in one effective pass for qualifier-only brackets.)

- [ ] **Step 8: Commit**

```bash
git add shared/mock/finals.ts shared/mock/derive.ts shared/mock/store.ts shared/mock/finals-propagation.test.ts
git commit -m "feat(o8b2): winner propagation in resolveFinals; recordFinalResult"
```

---

### Task 3: `renderBracket` scores + champion + E1 result panel

**Files:**
- Modify: `shared/chrome.ts` (`renderBracket(finals, editable=false)`: scores, champion, result button)
- Modify: `apps/organizer/schedule.ts` (pass `editable`, wire result buttons, `openFinalResultPanel`)
- Test: none new (behavior covered by Task 2); verified by build + tsc.

**Interfaces:**
- Consumes: `recordFinalResult` from store.
- Produces: `renderBracket(finals: FinalMatch[], editable?: boolean): string`.

- [ ] **Step 1: Rewrite `renderBracket`**

In `shared/chrome.ts`, replace the `renderBracket` function with:

```ts
// Finals bracket — grouped by bracketLabel → round. Shows resolved teams, scores,
// a champion line, and (when editable) a result button per playable match.
export function renderBracket(finals: FinalMatch[], editable = false): string {
  if (!finals.length) return `<p class="pf-muted">Nessuna fase finale.</p>`
  const labels: string[] = []
  for (const f of finals) if (!labels.includes(f.bracketLabel)) labels.push(f.bracketLabel)
  return labels.map(lb => {
    const lf = finals.filter(f => f.bracketLabel === lb)
    const rounds: string[] = []
    for (const f of lf) if (!rounds.includes(f.round)) rounds.push(f.round)
    const roundsHtml = rounds.map(r => {
      const rows = lf.filter(f => f.round === r).sort((a, b) => a.order - b.order).map(m => {
        const home = m.homeResolved ?? m.home
        const away = m.awayResolved ?? m.away
        const played = m.homeScore !== null && m.awayScore !== null
        const score = played ? `<span class="pf-final__score pf-mono">${m.homeScore} – ${m.awayScore}</span>` : `<b>vs</b>`
        const canPlay = editable && m.homeResolved !== null && m.awayResolved !== null
        const btn = canPlay ? `<button class="pf-btn pf-btn--ghost" data-final="${m.id}">Risultato</button>` : ''
        return `<li class="pf-final">
          <span class="pf-final__meta pf-mono">${m.day} · ${m.time} · ${m.field}</span>
          <span class="pf-final__teams">${home} ${score} ${away}</span>
          ${btn}
        </li>`
      }).join('')
      return `<div class="pf-final-round"><div class="pf-final-round__head pf-mono">${r}</div><ul class="pf-finallist">${rows}</ul></div>`
    }).join('')
    const fin = lf.find(f => f.round === 'Finale')
    let champ = ''
    if (fin && fin.homeResolved !== null && fin.awayResolved !== null && fin.homeScore !== null && fin.awayScore !== null && fin.homeScore !== fin.awayScore) {
      const winner = fin.homeScore > fin.awayScore ? fin.homeResolved : fin.awayResolved
      champ = `<div class="pf-champion">🏆 Campione: <b>${winner}</b></div>`
    }
    return `<div class="pf-bracket"><div class="pf-bracket__head"><span class="pf-cat__label">${lb}</span></div>${roundsHtml}${champ}</div>`
  }).join('')
}
```

- [ ] **Step 2: Add minimal CSS**

Append to `shared/ui.css`:

```css
.pf-final__score { font-weight: 700; padding: 0 6px; }
.pf-champion { margin-top: 10px; font-weight: 700; }
```

- [ ] **Step 3: Wire the E1 finals result panel**

In `apps/organizer/schedule.ts`, add `recordFinalResult` to the store import. Change the finals render (line ~242) to pass `editable = true`:

```ts
      + renderBracket(getFinals(id).filter(f => f.categoryId === selCat), true)
```

Immediately after the block that sets `document.getElementById('finals')!.innerHTML = ...`, wire the buttons (add inside `renderViews`, after the finals innerHTML assignment):

```ts
  document.querySelectorAll<HTMLButtonElement>('#finals button[data-final]').forEach(b =>
    b.addEventListener('click', () => openFinalResultPanel(b.dataset.final!)))
```

Add the panel function (near `openResultPanel`):

```ts
function openFinalResultPanel(finalMatchId: string): void {
  const f = getFinals(id).find(x => x.id === finalMatchId)
  if (!f) return
  const home = f.homeResolved ?? f.home
  const away = f.awayResolved ?? f.away
  const panel = document.getElementById('editmatch')!
  panel.innerHTML = `<div class="pf-card">
    <h2>Risultato · ${f.round}</h2>
    <p class="pf-muted">${home} vs ${away}</p>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${home}</label><input id="ff-home" type="number" min="0" value="${f.homeScore ?? 0}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${away}</label><input id="ff-away" type="number" min="0" value="${f.awayScore ?? 0}" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="ff-save">Salva</button><button class="pf-btn" id="ff-cancel">Annulla</button></div>
  </div>`
  document.getElementById('ff-save')!.addEventListener('click', () => {
    recordFinalResult(finalMatchId, Number((document.getElementById('ff-home') as HTMLInputElement).value), Number((document.getElementById('ff-away') as HTMLInputElement).value))
    panel.innerHTML = ''
    renderViews()
  })
  document.getElementById('ff-cancel')!.addEventListener('click', () => { panel.innerHTML = '' })
}
```

- [ ] **Step 4: Verify full suite, build, tsc**

Run: `npm test && npm run build && npx tsc --noEmit`
Expected: 75 tests PASS, build OK, tsc clean.

- [ ] **Step 5: Manual smoke (optional)**

`npm run dev` → "Demo · Tabellone (semifinali)" → schedule → Finali: two semifinals with "Risultato" buttons; record both → the final fills with the two winners → record the final → "🏆 Campione" appears. Public `bracket.html?event=evt-finals` shows the same, read-only.

- [ ] **Step 6: Commit**

```bash
git add shared/chrome.ts shared/ui.css apps/organizer/schedule.ts
git commit -m "feat(o8b2): bracket scores + champion; E1 finals result panel"
```

---

### Task 4: Docs + verification

**Files:**
- Modify: `README.md`

**Interfaces:** none.

- [ ] **Step 1: Update the README**

In `README.md`, extend the **Finals** bullet by appending:

```md
 Bracket-match results are recorded in E1 (O8b-2): winners propagate through the rounds (`Vincente …` → the actual winner) up to the champion (🏆); a demo event "Tabellone (semifinali)" shows semifinals → final → champion.
```

- [ ] **Step 2: Full verification**

Run: `npm test && npm run build && npx tsc --noEmit`
Expected: 75 tests PASS, build OK, tsc clean.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(o8b2): note finals results + winner propagation"
```

---

## Self-Review

**Spec coverage:**
- `FinalMatch` scores — Task 1. ✔
- Winner propagation in `resolveFinals` (iterative), `Vincente` regex, draw = no winner, `roundShort` single-sourced — Task 2. ✔
- `recordFinalResult` — Task 2. ✔
- `renderBracket` scores + champion + editable result button; E1 panel; public read-only — Task 3. ✔
- Multi-round demo `evt-finals` — Task 1. ✔
- Success criteria 1-4 — Tasks 1,2,3. ✔

**Placeholder scan:** none — all steps carry concrete code (including demo scores).

**Type consistency:** `FinalMatch.homeScore/awayScore: number | null` added in Task 1, initialized in `generateSchedule` and `demoEvent` (Task 1) and `buildFinals`-mapped finals; read in `resolveSlot`/`renderBracket`/`recordFinalResult`. `resolveSlot(state, eventId, categoryId, bracketLabel, placeholder)` — the new `bracketLabel` arg is passed by `resolveFinals` for every call. `roundShort` exported once (finals.ts), imported once (derive.ts). `renderBracket(finals, editable=false)` — public call sites keep the default (read-only); E1 passes `true`. `recordFinalResult(finalMatchId, homeScore, awayScore)` consistent across store/schedule/tests.

**Note on the fixpoint:** for qualifier-only brackets (PLACEMENT, and the existing O8b tests) the loop converges after one effective pass then breaks — behavior identical to the previous single-pass `resolveFinals`. For crossover/split brackets, each pass resolves one deeper round; cap of 8 exceeds any MVP bracket depth.

**Note on demo ordering:** `buildFinals` SINGLE_GROUP_CROSSOVER with `qualifiers = 4` emits draws in order [SF order1, SF order2, Finale order1], so `evt-finals-f1/f2/f3` map to SF1/SF2/Finale — the tests key on `round`/`order`, not id, so they are robust regardless.
