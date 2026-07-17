# Finale 3º/4º + rigori Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve knockout draws by penalty shootout, propagate the loser (`Perdente …`), and generate a third-place match when the competition opts in.

**Architecture:** `Competition` gains an optional `thirdPlace` flag; `FinalMatch` gains nullable shootout scores. `buildFinals` emits a "Finale 3º/4º" between the semifinal losers when `thirdPlace`. A single `decideMatch(match)` (regular time → shootout) drives both the `Vincente` (winner) and new `Perdente` (loser) placeholder resolution and the champion line. `recordFinalResult` accepts an optional shootout.

**Tech Stack:** Vite MPA, vanilla TypeScript, Vitest + jsdom. Mock store in `shared/mock/`.

## Global Constraints

- No new dependencies; no framework.
- `CompetitionConfig.thirdPlace?: boolean` (optional; treated as `false` when absent).
- `FinalMatch.homeShootout: number | null`, `awayShootout: number | null` (init `null`).
- Placeholder forms: `^Vincente (SF|QF|OF|F|T)(\d+)$` (winner), `^Perdente (SF|QF|OF|F|T)(\d+)$` (loser).
- `decideMatch`: needs both participants resolved + both regular scores; winner = higher regular score, else higher shootout, else `null` (undecided). Loser = the other side.
- Shootout scores are stored ONLY when regular time is a draw (`homeScore === awayScore`); otherwise cleared to `null`.
- Third-place match: emitted only for single-elimination brackets with a semifinal round (the round of exactly 2 matches). PLACEMENT and Q<4 crossover never emit one.
- Champion = winner (via `decideMatch`) of the `Finale`-round match; the `Finale 3º/4º` round never affects it.
- Public bracket read-only. Italian UI copy. No drag-and-drop.

---

### Task 1: `thirdPlace` option + shootout fields + third-place generation

**Files:**
- Modify: `shared/mock/types.ts` (`CompetitionConfig.thirdPlace?`, `FinalMatch` shootout)
- Modify: `shared/mock/finals.ts` (`buildFinals`/`singleElim` `thirdPlace`)
- Modify: `shared/mock/store.ts` (generateSchedule passes `thirdPlace`, inits shootout)
- Modify: `shared/mock/seed.ts` (`demoEvent` `thirdPlace` param + shootout init; `evt-finals` on)
- Modify: `apps/organizer/competition.ts` (checkbox + readConfig + sameConfig)
- Test: `shared/mock/finals.test.ts` (append third-place unit tests), `shared/mock/finals-propagation.test.ts` (append evt-finals fixture assertion)

**Interfaces:**
- Produces: `CompetitionConfig.thirdPlace?: boolean`; `FinalMatch.homeShootout/awayShootout: number | null`; `buildFinals(gironi, qualifiersPerGroup, finalsType, thirdPlace?)`; `demoEvent(id, name, teams, results, qualifiers?, thirdPlace?)`.

- [ ] **Step 1: Append failing tests**

In `shared/mock/finals.test.ts`, append (uses the existing `buildFinals` import):

```ts
describe('buildFinals — third place', () => {
  it('emits a Finale 3º/4º between the semifinal losers when thirdPlace is on (crossover Q4)', () => {
    const draws = buildFinals(['Girone A'], 4, 'SINGLE_GROUP_CROSSOVER', true)
    const tp = draws.find(d => d.round === 'Finale 3º/4º')
    expect(tp).toBeDefined()
    expect(tp!.home).toBe('Perdente SF1')
    expect(tp!.away).toBe('Perdente SF2')
  })
  it('emits no third place when thirdPlace is off', () => {
    expect(buildFinals(['Girone A'], 4, 'SINGLE_GROUP_CROSSOVER', false).some(d => d.round === 'Finale 3º/4º')).toBe(false)
  })
  it('emits no third place for a single final (Q2) even with thirdPlace on', () => {
    expect(buildFinals(['Girone A'], 2, 'SINGLE_GROUP_CROSSOVER', true).some(d => d.round === 'Finale 3º/4º')).toBe(false)
  })
})
```

In `shared/mock/finals-propagation.test.ts`, append inside the fixture `describe`:

```ts
  it('evt-finals includes a Finale 3º/4º (thirdPlace on)', () => {
    const f = getFinals('evt-finals')
    const tp = f.find(x => x.round === 'Finale 3º/4º')
    expect(tp).toBeDefined()
    expect(tp!.home).toBe('Perdente SF1')
    expect(tp!.away).toBe('Perdente SF2')
    expect(tp!.homeShootout).toBeNull()
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- finals`
Expected: FAIL — no `thirdPlace` param / no 3º/4º match / no shootout field.

- [ ] **Step 3: Types**

In `shared/mock/types.ts`: add to `CompetitionConfig` (after `finalsType`):

```ts
  thirdPlace?: boolean
```

Add to `FinalMatch` (after `awayResolved`):

```ts
  homeShootout: number | null
  awayShootout: number | null
```

- [ ] **Step 4: `buildFinals`/`singleElim` third place**

In `shared/mock/finals.ts`, change `singleElim` to accept `thirdPlace` and emit the 3º/4º when it processes the 2-match semifinal round:

```ts
function singleElim(slots: string[], bracketLabel: string, thirdPlace = false): FinalDraw[] {
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
    if (thirdPlace && current.length === 4) {
      draws.push({ bracketLabel, round: 'Finale 3º/4º', order: 1, home: `Perdente ${rs}1`, away: `Perdente ${rs}2` })
    }
    current = winners
  }
  return draws
}
```

Change `buildFinals` signature and pass `thirdPlace` into the `singleElim` calls:

```ts
export function buildFinals(gironi: string[], qualifiersPerGroup: number, finalsType: FinalsType, thirdPlace = false): FinalDraw[] {
```

- in `SINGLE_GROUP_CROSSOVER`, the `Q >= 4` branch: `return singleElim([slot(1, g), slot(4, g), slot(2, g), slot(3, g)], 'Tabellone', thirdPlace)`.
- in `SPLIT_GROUP_FINALS`, the loop body: `out.push(...singleElim(gironi.map(g => slot(p, g)), label, thirdPlace))`.
- PLACEMENT branch unchanged (ignores `thirdPlace`).

- [ ] **Step 5: `generateSchedule` — pass thirdPlace + init shootout**

In `shared/mock/store.ts` line ~182, the `buildFinals(...)` call becomes:

```ts
    const draws = buildFinals(groups.map(g => g.groupLabel), comp.qualifiersPerGroup, comp.finalsType, comp.thirdPlace ?? false)
```

In the finals push (line ~161) add the two shootout fields (init null):

```ts
      finalsOut.push({ id: `fm-${++fseq}`, eventId, categoryId: cat.id, bracketLabel: d.bracketLabel, round: d.round, order: d.order, home: d.home, away: d.away, day: config.finalsDate, time: addMinutes(config.dailyStart, si * slotMinutes), field: fields[fi], homeResolved: null, awayResolved: null, homeScore: null, awayScore: null, homeShootout: null, awayShootout: null })
```

- [ ] **Step 6: `demoEvent` — thirdPlace param + shootout init; evt-finals on**

In `shared/mock/seed.ts`, change `demoEvent` signature to add `thirdPlace = false`:

```ts
function demoEvent(id: string, name: string, teams: string[], results: [number, number, number, number][], qualifiers = 2, thirdPlace = false): {
```

Set the competition's `thirdPlace` (in the `competition` literal add `thirdPlace,`) and pass it to `buildFinals`; also init the shootout fields in the finals `.map`:

```ts
  const finals: FinalMatch[] = buildFinals(['Girone A'], qualifiers, 'SINGLE_GROUP_CROSSOVER', thirdPlace).map((d, i) => ({
    id: `${id}-f${i + 1}`, eventId: id, categoryId: catId, bracketLabel: d.bracketLabel, round: d.round, order: d.order,
    home: d.home, away: d.away, day: '2026-09-01', time: '11:00', field: 'Campo 1',
    homeResolved: null, awayResolved: null, homeScore: null, awayScore: null, homeShootout: null, awayShootout: null,
  }))
```

In the `DEMOS` array, the `evt-finals` entry gains `true` as the 6th arg:

```ts
  demoEvent('evt-finals', 'Demo · Tabellone (semifinali)', ['Alfa', 'Bravo', 'Charlie', 'Delta'],
    [[0, 1, 1, 0], [0, 1, 2, 0], [0, 1, 3, 0], [1, 1, 2, 0], [1, 1, 3, 0], [2, 1, 3, 0]], 4, true),
```

- [ ] **Step 7: competition.ts — checkbox + read + compare**

In `apps/organizer/competition.ts`:
- `sameConfig`: add `&& (a.thirdPlace ?? false) === (b.thirdPlace ?? false)` to the boolean expression.
- `configFields`: inside the `js-ko` block, after the `finalsType` field, add:
  ```ts
      <div class="pf-field"><label><input type="checkbox" name="thirdPlace" ${cfg.thirdPlace ? 'checked' : ''} /> Finale 3º/4º</label></div>
  ```
- `readConfig`: add to the returned object:
  ```ts
    thirdPlace: (form.querySelector('input[name=thirdPlace]') as HTMLInputElement | null)?.checked ?? false,
  ```
- The `DEFAULT` const may optionally add `thirdPlace: false` (harmless; not required since the field is optional).

- [ ] **Step 8: Run tests + tsc**

Run: `npm test && npx tsc --noEmit`
Expected: `finals` + `finals-propagation` new tests PASS; full suite PASS (80 + 4 = 84); tsc clean. (Existing Competition literals compile because `thirdPlace` is optional.)

- [ ] **Step 9: Commit**

```bash
git add shared/mock/types.ts shared/mock/finals.ts shared/mock/store.ts shared/mock/seed.ts apps/organizer/competition.ts shared/mock/finals.test.ts shared/mock/finals-propagation.test.ts
git commit -m "feat(o8b3): thirdPlace option + shootout fields + Finale 3º/4º generation"
```

---

### Task 2: `decideMatch` engine (shootout) + loser propagation + recordFinalResult shootout

**Files:**
- Modify: `shared/mock/derive.ts` (`decideMatch`; `resolveSlot` Vincente/Perdente)
- Modify: `shared/mock/store.ts` (`recordFinalResult` shootout)
- Test: `shared/mock/finals-propagation.test.ts` (append shootout + third-place propagation tests)

**Interfaces:**
- Produces: `decideMatch(m: FinalMatch): { winner: string; loser: string } | null` (exported); `recordFinalResult(finalMatchId, homeScore, awayScore, shootout?: { home: number; away: number })`.

- [ ] **Step 1: Append failing tests**

In `shared/mock/finals-propagation.test.ts` (winner-propagation `describe`), append:

```ts
  it('a drawn semifinal is decided by the shootout and propagates the winner', () => {
    recordFinalResult(semi(1).id, 1, 1, { home: 5, away: 4 }) // draw, home wins on penalties
    recordFinalResult(semi(2).id, 2, 0)
    expect(finale().homeResolved).toBe(semi(1).homeResolved) // shootout winner advances
  })

  it('propagates the loser into the Finale 3º/4º', () => {
    recordFinalResult(semi(1).id, 2, 0) // home wins SF1 → away is loser
    recordFinalResult(semi(2).id, 0, 1) // away wins SF2 → home is loser
    const tp = getFinals('evt-finals').find(f => f.round === 'Finale 3º/4º')!
    expect(tp.homeResolved).toBe(semi(1).awayResolved) // Perdente SF1
    expect(tp.awayResolved).toBe(semi(2).homeResolved) // Perdente SF2
  })

  it('a shootout is ignored when regular time is not a draw', () => {
    recordFinalResult(semi(1).id, 2, 1, { home: 1, away: 9 }) // home won in regular time
    expect(semi(1).homeShootout).toBeNull()
    expect(finale().homeResolved).toBe(semi(1).homeResolved) // regular-time winner, not the shootout
  })
```

(Note: `semi(1)` re-reads state each call, so `semi(1).homeResolved` after a result is still the resolved participant.)

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- finals-propagation`
Expected: FAIL — `recordFinalResult` takes no shootout / `Perdente` unresolved.

- [ ] **Step 3: `decideMatch` + resolveSlot in derive.ts**

In `shared/mock/derive.ts`, add the exported helper (above `resolveSlot`), importing `FinalMatch` if needed:

```ts
export function decideMatch(m: FinalMatch): { winner: string; loser: string } | null {
  if (m.homeResolved === null || m.awayResolved === null) return null
  if (m.homeScore === null || m.awayScore === null) return null
  let homeWins: boolean
  if (m.homeScore !== m.awayScore) homeWins = m.homeScore > m.awayScore
  else if (m.homeShootout !== null && m.awayShootout !== null && m.homeShootout !== m.awayShootout) homeWins = m.homeShootout > m.awayShootout
  else return null
  return homeWins ? { winner: m.homeResolved, loser: m.awayResolved } : { winner: m.awayResolved, loser: m.homeResolved }
}
```

Replace the `Vincente` branch of `resolveSlot` (and add the `Perdente` branch) so both use `decideMatch`:

```ts
  const w = /^(Vincente|Perdente) (SF|QF|OF|F|T)(\d+)$/.exec(placeholder)
  if (w) {
    const src = state.finals.find(f => f.eventId === eventId && f.categoryId === categoryId && f.bracketLabel === bracketLabel && roundShort(f.round) === w[2] && f.order === Number(w[3]))
    if (!src) return null
    const d = decideMatch(src)
    if (!d) return null
    return w[1] === 'Vincente' ? d.winner : d.loser
  }
  return null
```

Ensure `FinalMatch` is imported in derive.ts (`import type { State, FinalMatch } from './types'` — extend the existing type import).

- [ ] **Step 4: `recordFinalResult` shootout**

In `shared/mock/store.ts`, replace `recordFinalResult`:

```ts
export function recordFinalResult(finalMatchId: string, homeScore: number, awayScore: number, shootout?: { home: number; away: number }): void {
  const state = load()
  const f = state.finals.find(x => x.id === finalMatchId)
  if (!f) { save(state); return }
  f.homeScore = homeScore; f.awayScore = awayScore
  if (shootout && homeScore === awayScore) { f.homeShootout = shootout.home; f.awayShootout = shootout.away }
  else { f.homeShootout = null; f.awayShootout = null }
  resolveFinals(state, f.eventId)
  save(state)
}
```

- [ ] **Step 5: Run tests**

Run: `npm test -- finals-propagation`
Expected: PASS (existing + 3 new).

- [ ] **Step 6: Full suite + tsc**

Run: `npm test && npx tsc --noEmit`
Expected: full suite PASS (87), tsc clean.

- [ ] **Step 7: Commit**

```bash
git add shared/mock/derive.ts shared/mock/store.ts shared/mock/finals-propagation.test.ts
git commit -m "feat(o8b3): decideMatch (regular→shootout); loser propagation; recordFinalResult shootout"
```

---

### Task 3: Bracket shootout display + shootout-aware champion + E1 rigori panel

**Files:**
- Modify: `shared/chrome.ts` (`renderBracket`: d.c.r. + champion via `decideMatch`)
- Modify: `apps/organizer/schedule.ts` (`openFinalResultPanel` rigori fields)

**Interfaces:** Consumes `decideMatch` from `./mock/derive`; `recordFinalResult` (4-arg) from store.

- [ ] **Step 1: renderBracket — shootout + champion**

In `shared/chrome.ts`, add the import (next to the ranking import):

```ts
import { decideMatch } from './mock/derive'
```

In `renderBracket`, change the `score` computation to include shootout, and the champion to use `decideMatch`:

- score line:
  ```ts
        const played = m.homeScore !== null && m.awayScore !== null
        const dcr = m.homeShootout !== null && m.awayShootout !== null ? ` <span class="pf-final__dcr pf-mono">d.c.r. ${m.homeShootout}-${m.awayShootout}</span>` : ''
        const score = played ? `<span class="pf-final__score pf-mono">${m.homeScore} – ${m.awayScore}</span>${dcr}` : `<b>vs</b>`
  ```
- champion block — replace the manual computation with:
  ```ts
    const fin = lf.find(f => f.round === 'Finale')
    const champ = fin ? (decideMatch(fin) ? `<div class="pf-champion">🏆 Campione: <b>${decideMatch(fin)!.winner}</b></div>` : '') : ''
  ```
  (Remove the old `let champ = ''` + `if (...)` block.)

- [ ] **Step 2: CSS for d.c.r.**

Append to `shared/ui.css`:

```css
.pf-final__dcr { color: var(--color-text-muted); font-size: 12px; }
```

- [ ] **Step 3: E1 rigori panel**

In `apps/organizer/schedule.ts`, in `openFinalResultPanel`, add rigori inputs below the regular-score row (before the save/cancel row):

```ts
    <p class="pf-muted" style="margin:var(--space-3) 0 4px">Rigori — solo in caso di parità</p>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${home} (d.c.r.)</label><input id="ff-sh-home" type="number" min="0" value="${f.homeShootout ?? ''}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${away} (d.c.r.)</label><input id="ff-sh-away" type="number" min="0" value="${f.awayShootout ?? ''}" /></div>
    </div>
```

and change the save handler to pass the shootout when both fields are filled:

```ts
  document.getElementById('ff-save')!.addEventListener('click', () => {
    const hs = (document.getElementById('ff-sh-home') as HTMLInputElement).value
    const as = (document.getElementById('ff-sh-away') as HTMLInputElement).value
    const shootout = hs !== '' && as !== '' ? { home: Number(hs), away: Number(as) } : undefined
    recordFinalResult(finalMatchId, Number((document.getElementById('ff-home') as HTMLInputElement).value), Number((document.getElementById('ff-away') as HTMLInputElement).value), shootout)
    panel.innerHTML = ''
    renderViews()
  })
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run build && npx tsc --noEmit`
Expected: 87 tests PASS, build OK, tsc clean.

- [ ] **Step 5: Manual smoke (optional)**

`npm run dev` → "Demo · Tabellone (semifinali)" → Finali: record SF1 as 1-1 with rigori 5-4 → winner advances, bracket shows "d.c.r. 5-4"; record SF2 → final + Finale 3º/4º populate; record the final → champion.

- [ ] **Step 6: Commit**

```bash
git add shared/chrome.ts shared/ui.css apps/organizer/schedule.ts
git commit -m "feat(o8b3): bracket shows d.c.r.; shootout-aware champion; E1 rigori panel"
```

---

### Task 4: Docs + verification

**Files:**
- Modify: `README.md`

**Interfaces:** none.

- [ ] **Step 1: README**

Extend the **Finals** bullet by appending:

```md
 Knockout draws are decided by penalty shootout (d.c.r.), and a competition can opt into a third-place match (Finale 3º/4º) between the semifinal losers.
```

- [ ] **Step 2: Full verification**

Run: `npm test && npm run build && npx tsc --noEmit`
Expected: 87 tests PASS, build OK, tsc clean.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(o8b3): note penalty shootout + third-place match"
```

---

## Self-Review

**Spec coverage:**
- `CompetitionConfig.thirdPlace?` + `FinalMatch` shootout — Task 1. ✔
- `buildFinals` Finale 3º/4º (Perdente slots) — Task 1. ✔
- `decideMatch` (regular→shootout), Vincente/Perdente resolution — Task 2. ✔
- `recordFinalResult` shootout (stored only on a draw) — Task 2. ✔
- Bracket d.c.r. + shootout-aware champion + E1 rigori panel — Task 3. ✔
- competition.ts thirdPlace checkbox — Task 1. ✔
- evt-finals thirdPlace on — Task 1. ✔
- Success criteria 1-4 — Tasks 1,2,3. ✔

**Placeholder scan:** none — all steps carry concrete code.

**Type consistency:** `thirdPlace?: boolean` optional → existing Competition literals still compile; `comp.thirdPlace ?? false` at the one generation use-site; `buildFinals(..., thirdPlace = false)` default keeps other callers valid. `FinalMatch.homeShootout/awayShootout: number | null` init at both creation sites (generateSchedule, demoEvent). `decideMatch(m): {winner,loser}|null` used by resolveSlot (both placeholders) and chrome's champion. `recordFinalResult(id, home, away, shootout?)` — the 3-arg calls elsewhere remain valid (optional 4th). `roundShort` already exported.

**Note on champion + shootout:** switching the champion to `decideMatch(fin)` means a final drawn in regular time but decided on penalties now correctly shows a champion (the old code showed none). The `Finale 3º/4º` round is never matched by the `round === 'Finale'` champion lookup, so it cannot be mistaken for the title.

**Note on the fixpoint:** `Perdente` slots resolve in the same iterative `resolveFinals` pass structure as `Vincente` (both via `decideMatch` on a decided source); no convergence change — a third-place match depends only on the two semifinals, which resolve first.
