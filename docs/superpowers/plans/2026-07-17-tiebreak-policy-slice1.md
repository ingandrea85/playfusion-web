# Tie-break policy — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the standings tie-break a per-event, sport-defaulted policy (scontri diretti/avulsa → differenza reti → reti fatte), with a deterministic ranking engine, unresolved-tie gating of finals qualification, and 5 demo events showing each case.

**Architecture:** A `TieBreakCriterion[]` policy on the Event (default per sport). `rankStanding` becomes `(rows, matches, policy) → { rows, unresolved }`: points first, then each policy criterion partitions tied groups (head-to-head builds a mini-league among the tied teams; the rest are scalar). `recomputeStandings`/`resolveFinals` move into a store-independent `derive.ts` so both the store and the seed can hydrate derived state. `resolveFinals` won't qualify a team whose position depends on an unresolved tie. Demo events seed raw matches and are hydrated through the real engine.

**Tech Stack:** Vite MPA, vanilla TypeScript, Vitest + jsdom. Mock store in `shared/mock/`. No framework, no backend.

## Global Constraints

- No new dependencies; no framework.
- Points is ALWAYS the primary criterion, implicit, not represented in the policy list.
- `TieBreakCriterion` is exactly `'HEAD_TO_HEAD' | 'GOAL_DIFFERENCE' | 'GOALS_FOR'`.
- Head-to-head order among a tied group: **mini-league points → mini goal-difference → mini goals-for**, computed from only the matches whose home AND away are both in the group and have a recorded score.
- `GOAL_DIFFERENCE` = overall `goalsFor − goalsAgainst`; `GOALS_FOR` = overall `goalsFor`.
- `rankStanding` always returns a total, stable order (teams left tied are ordered by team name) AND the list of unresolved groups (each an array of team names, ≥2, name-sorted).
- A finals qualifier slot resolves only when its group is complete AND the team at that position is not in any unresolved group.
- No drag-and-drop in any editor — reorder via up/down buttons (mobile-friendly).
- Italian UI copy.
- Default policy for `Calcio` = `['HEAD_TO_HEAD','GOAL_DIFFERENCE','GOALS_FOR']`; generic fallback = `['GOAL_DIFFERENCE','GOALS_FOR']`.

---

### Task 1: Policy type, sport defaults, event field, robust event id

**Files:**
- Modify: `shared/mock/types.ts` (add `TieBreakCriterion`; add `tieBreak` to `TournamentEvent`)
- Create: `shared/mock/tiebreak.ts`
- Modify: `shared/mock/store.ts` (`createEvent` sets `tieBreak` + robust numeric id)
- Modify: `shared/mock/seed.ts:5-10` (evt-1 gets `tieBreak`)
- Test: `shared/mock/tiebreak.test.ts` (create)

**Interfaces:**
- Produces: `type TieBreakCriterion`; `TIEBREAK_DEFAULTS: Record<string, TieBreakCriterion[]>`; `defaultTieBreak(sport: string): TieBreakCriterion[]`; `criterionLabel(c: TieBreakCriterion): string`; `TournamentEvent.tieBreak: TieBreakCriterion[]`. `createEvent` input gains optional `tieBreak?: TieBreakCriterion[]`.

- [ ] **Step 1: Write the failing test**

Create `shared/mock/tiebreak.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { defaultTieBreak, criterionLabel } from './tiebreak'

describe('tiebreak defaults', () => {
  it('Calcio default is head-to-head, then goal difference, then goals for', () => {
    expect(defaultTieBreak('Calcio')).toEqual(['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'])
  })
  it('unknown sport falls back to goal difference then goals for', () => {
    expect(defaultTieBreak('Curling')).toEqual(['GOAL_DIFFERENCE', 'GOALS_FOR'])
  })
  it('every criterion has a non-empty Italian label', () => {
    for (const c of ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'] as const) {
      expect(criterionLabel(c).length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tiebreak`
Expected: FAIL — cannot resolve `./tiebreak`.

- [ ] **Step 3: Add the type**

In `shared/mock/types.ts`, add just above `export interface TournamentEvent`:

```ts
export type TieBreakCriterion = 'HEAD_TO_HEAD' | 'GOAL_DIFFERENCE' | 'GOALS_FOR'
```

And add the field to `TournamentEvent` (after `registrationsOpen: boolean`):

```ts
  tieBreak: TieBreakCriterion[]
```

- [ ] **Step 4: Create `shared/mock/tiebreak.ts`**

```ts
import type { TieBreakCriterion } from './types'

export const TIEBREAK_DEFAULTS: Record<string, TieBreakCriterion[]> = {
  Calcio: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
}

const GENERIC_DEFAULT: TieBreakCriterion[] = ['GOAL_DIFFERENCE', 'GOALS_FOR']

export function defaultTieBreak(sport: string): TieBreakCriterion[] {
  return TIEBREAK_DEFAULTS[sport] ?? GENERIC_DEFAULT
}

export function criterionLabel(c: TieBreakCriterion): string {
  return c === 'HEAD_TO_HEAD' ? 'Scontri diretti / avulsa'
    : c === 'GOAL_DIFFERENCE' ? 'Differenza reti'
    : 'Reti fatte'
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm test -- tiebreak`
Expected: PASS (3 tests).

- [ ] **Step 6: Update `createEvent` (policy default + robust id)**

In `shared/mock/store.ts`, the `createEvent` function currently reads:

```ts
export function createEvent(input: { name: string; sport: string; location: string; startDate: string; startTime: string; endDate: string }): TournamentEvent {
  const state = load()
  const event: TournamentEvent = {
    id: `evt-${state.events.length + 1}`, organizationId: 'org-1', name: input.name, sport: input.sport, location: input.location,
    startDate: input.startDate, startTime: input.startTime, endDate: input.endDate, template: 'PB-1', registrationsOpen: false,
  }
  state.events.push(event); save(state); return event
}
```

Replace it with (adds `tieBreak`, and a numeric-max id so non-numeric demo ids don't shift it):

```ts
export function createEvent(input: { name: string; sport: string; location: string; startDate: string; startTime: string; endDate: string; tieBreak?: TieBreakCriterion[] }): TournamentEvent {
  const state = load()
  const nextNum = Math.max(1, ...state.events.map(e => Number(e.id.replace('evt-', '')) || 0)) + 1
  const event: TournamentEvent = {
    id: `evt-${nextNum}`, organizationId: 'org-1', name: input.name, sport: input.sport, location: input.location,
    startDate: input.startDate, startTime: input.startTime, endDate: input.endDate, template: 'PB-1', registrationsOpen: false,
    tieBreak: input.tieBreak ?? defaultTieBreak(input.sport),
  }
  state.events.push(event); save(state); return event
}
```

Add the imports at the top of `shared/mock/store.ts` (next to the other `./` imports):

```ts
import type { TieBreakCriterion } from './types'
import { defaultTieBreak } from './tiebreak'
```

(If `TournamentEvent` is not already imported as a type in store.ts, leave the existing import as-is — it is already used.)

- [ ] **Step 7: Give evt-1 a policy in the seed**

In `shared/mock/seed.ts`, the evt-1 object (lines 5-10) ends with `registrationsOpen: true,`. Add the field:

```ts
      registrationsOpen: true,
      tieBreak: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
```

- [ ] **Step 8: Run suite + tsc**

Run: `npm test && npx tsc --noEmit`
Expected: all pass (47 + 3 = 50), tsc clean. (The existing `createEvent` test still expects `evt-2` — the robust id yields `evt-2` because only `evt-1` is numeric.)

- [ ] **Step 9: Commit**

```bash
git add shared/mock/types.ts shared/mock/tiebreak.ts shared/mock/tiebreak.test.ts shared/mock/store.ts shared/mock/seed.ts
git commit -m "feat(tiebreak): TieBreakCriterion policy on Event with sport defaults"
```

---

### Task 2: `rankStanding` engine (policy + head-to-head/avulsa)

**Files:**
- Modify: `shared/mock/ranking.ts` (new signature + algorithm)
- Test: `shared/mock/ranking.test.ts` (rewrite for the new signature + 5 scenarios)

**Interfaces:**
- Consumes: `StandingRow`, `ScheduledMatch`, `TieBreakCriterion` from `./types`.
- Produces: `interface RankResult { rows: StandingRow[]; unresolved: string[][] }`; `rankStanding(rows: StandingRow[], matches: ScheduledMatch[], policy: TieBreakCriterion[]): RankResult`.

- [ ] **Step 1: Rewrite the ranking test**

Replace the entire contents of `shared/mock/ranking.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { rankStanding } from './ranking'
import type { StandingRow, ScheduledMatch, TieBreakCriterion } from './types'

const P: TieBreakCriterion[] = ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR']

const row = (team: string, points: number, goalsFor: number, goalsAgainst: number): StandingRow => ({
  eventId: 'e', categoryId: 'c', groupLabel: 'Girone A', team,
  played: 0, won: 0, drawn: 0, lost: 0, goalsFor, goalsAgainst, points,
})
let mseq = 0
const mt = (home: string, hs: number, away: string, as: number): ScheduledMatch => ({
  id: `m${++mseq}`, eventId: 'e', categoryId: 'c', groupLabel: 'Girone A',
  day: '2026-01-01', time: '09:00', field: 'Campo 1', home, away, homeScore: hs, awayScore: as,
})
const order = (r: StandingRow[], m: ScheduledMatch[]) => rankStanding(r, m, P).rows.map(x => x.team)

describe('rankStanding — policy engine', () => {
  it('head-to-head separates two teams tied on points, GD and GF', () => {
    const rows = [row('Alfa', 6, 2, 1), row('Bravo', 6, 2, 1)]
    const res = rankStanding(rows, [mt('Alfa', 1, 'Bravo', 0)], P)
    expect(res.rows.map(r => r.team)).toEqual(['Alfa', 'Bravo'])
    expect(res.unresolved).toEqual([])
  })

  it('classifica avulsa separates three tied teams (and can differ from overall goals-for)', () => {
    // Overall goals-for would put Bravo first (6); avulsa puts Alfa, Charlie, Bravo.
    const rows = [row('Alfa', 6, 4, 1), row('Bravo', 6, 6, 3), row('Charlie', 6, 4, 1)]
    const matches = [mt('Alfa', 3, 'Bravo', 0), mt('Bravo', 1, 'Charlie', 0), mt('Charlie', 1, 'Alfa', 0)]
    expect(order(rows, matches)).toEqual(['Alfa', 'Charlie', 'Bravo'])
  })

  it('falls through to goal difference when head-to-head is drawn', () => {
    const rows = [row('Alfa', 4, 4, 1), row('Bravo', 4, 2, 1)] // GD +3 vs +1
    expect(order(rows, [mt('Alfa', 1, 'Bravo', 1)])).toEqual(['Alfa', 'Bravo'])
  })

  it('falls through to goals for when head-to-head and GD are equal', () => {
    const rows = [row('Alfa', 4, 5, 3), row('Bravo', 4, 4, 2)] // GD both +2, GF 5 vs 4
    expect(order(rows, [mt('Alfa', 2, 'Bravo', 2)])).toEqual(['Alfa', 'Bravo'])
  })

  it('reports an unresolved group when every criterion ties', () => {
    const rows = [row('Bravo', 4, 3, 1), row('Alfa', 4, 3, 1)]
    const res = rankStanding(rows, [mt('Alfa', 1, 'Bravo', 1)], P)
    expect(res.rows.map(r => r.team)).toEqual(['Alfa', 'Bravo']) // name-stable
    expect(res.unresolved).toEqual([['Alfa', 'Bravo']])
  })

  it('does not mutate the input rows array', () => {
    const rows = [row('B', 1, 0, 0), row('A', 2, 0, 0)]
    const before = rows.map(r => r.team)
    rankStanding(rows, [], P)
    expect(rows.map(r => r.team)).toEqual(before)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- ranking`
Expected: FAIL — `rankStanding` old signature returns an array, `.rows`/`.unresolved` undefined.

- [ ] **Step 3: Rewrite `shared/mock/ranking.ts`**

```ts
import type { StandingRow, ScheduledMatch, TieBreakCriterion } from './types'

export interface RankResult {
  rows: StandingRow[]
  unresolved: string[][]
}

const cmpDesc = (a: number[], b: number[]): number => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i]
  return 0
}
const eqTuple = (a: number[], b: number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i])

// Bucket a group into ranked buckets by a per-row tuple (desc, lexicographic). Teams
// with an identical tuple land in the same bucket (still tied on this criterion).
function bucketByTuple(group: StandingRow[], tuple: (r: StandingRow) => number[]): StandingRow[][] {
  const arr = group.map(r => ({ r, t: tuple(r) })).sort((x, y) => cmpDesc(x.t, y.t))
  const buckets: StandingRow[][] = []
  let curT: number[] | null = null
  for (const { r, t } of arr) {
    if (curT && eqTuple(curT, t)) buckets[buckets.length - 1].push(r)
    else { buckets.push([r]); curT = t }
  }
  return buckets
}

// Mini-league over only the matches whose home AND away are both in the group.
function headToHeadTuple(group: StandingRow[], matches: ScheduledMatch[]): (r: StandingRow) => number[] {
  const names = new Set(group.map(r => r.team))
  const mini = new Map<string, { pts: number; gf: number; ga: number }>()
  for (const r of group) mini.set(r.team, { pts: 0, gf: 0, ga: 0 })
  for (const m of matches) {
    if (m.homeScore === null || m.awayScore === null) continue
    if (!names.has(m.home) || !names.has(m.away)) continue
    const h = mini.get(m.home)!, a = mini.get(m.away)!
    h.gf += m.homeScore; h.ga += m.awayScore; a.gf += m.awayScore; a.ga += m.homeScore
    if (m.homeScore > m.awayScore) h.pts += 3
    else if (m.homeScore < m.awayScore) a.pts += 3
    else { h.pts++; a.pts++ }
  }
  return r => { const s = mini.get(r.team)!; return [s.pts, s.gf - s.ga, s.gf] }
}

function tupleFor(crit: TieBreakCriterion, group: StandingRow[], matches: ScheduledMatch[]): (r: StandingRow) => number[] {
  if (crit === 'GOAL_DIFFERENCE') return r => [r.goalsFor - r.goalsAgainst]
  if (crit === 'GOALS_FOR') return r => [r.goalsFor]
  return headToHeadTuple(group, matches)
}

export function rankStanding(rows: StandingRow[], matches: ScheduledMatch[], policy: TieBreakCriterion[]): RankResult {
  const unresolved: string[][] = []

  const order = (group: StandingRow[], ci: number): StandingRow[] => {
    if (group.length <= 1) return group
    if (ci >= policy.length) {
      const sorted = [...group].sort((a, b) => a.team.localeCompare(b.team))
      unresolved.push(sorted.map(r => r.team))
      return sorted
    }
    const buckets = bucketByTuple(group, tupleFor(policy[ci], group, matches))
    const out: StandingRow[] = []
    for (const b of buckets) out.push(...(b.length > 1 ? order(b, ci + 1) : b))
    return out
  }

  // Primary criterion: points.
  const byPoints = bucketByTuple(rows, r => [r.points])
  const result: StandingRow[] = []
  for (const b of byPoints) result.push(...(b.length > 1 ? order(b, 0) : b))
  return { rows: result, unresolved }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- ranking`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/mock/ranking.ts shared/mock/ranking.test.ts
git commit -m "feat(tiebreak): rankStanding policy engine with head-to-head/avulsa"
```

Note: the suite is intentionally RED after this task (chrome.ts and store.ts still call the old `rankStanding(rows)` signature — fixed in Tasks 3 and 4). Run `npm test -- ranking` only; do not gate on the full suite here.

---

### Task 3: Extract `derive.ts`; policy-aware resolution + unresolved gating

**Files:**
- Create: `shared/mock/derive.ts` (move `recomputeStandings`, `groupComplete`, `resolveSlot`, `resolveFinals` out of store.ts; make resolution policy-aware + gated)
- Modify: `shared/mock/store.ts` (import from `derive.ts`; remove the moved functions)
- Test: `shared/mock/finals-resolve.test.ts` (add a gating test)

**Interfaces:**
- Consumes: `rankStanding` from `./ranking`; `State` from `./types`.
- Produces (from `derive.ts`): `recomputeStandings(state: State, eventId: string): void`; `resolveFinals(state: State, eventId: string): void`.

- [ ] **Step 1: Create `shared/mock/derive.ts`**

Move the four functions out of `store.ts` (currently `recomputeStandings` at store.ts:247-264, and `groupComplete`/`resolveSlot`/`resolveFinals` at store.ts:249-272 region from the O8b work) into a new file, updating `resolveSlot` to use the policy + gate on `unresolved`:

```ts
import type { State } from './types'
import { rankStanding } from './ranking'

export function recomputeStandings(state: State, eventId: string): void {
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

function groupComplete(state: State, eventId: string, categoryId: string, groupLabel: string): boolean {
  const ms = state.scheduledMatches.filter(m => m.eventId === eventId && m.categoryId === categoryId && m.groupLabel === groupLabel)
  return ms.length > 0 && ms.every(m => m.homeScore !== null && m.awayScore !== null)
}

function resolveSlot(state: State, eventId: string, categoryId: string, placeholder: string): string | null {
  const mt = /^(\d+)ª (Girone .+)$/.exec(placeholder)
  if (!mt) return null
  const pos = Number(mt[1])
  const group = mt[2]
  if (!groupComplete(state, eventId, categoryId, group)) return null
  const policy = state.events.find(e => e.id === eventId)?.tieBreak ?? []
  const rows = state.standings.filter(s => s.eventId === eventId && s.categoryId === categoryId && s.groupLabel === group)
  const matches = state.scheduledMatches.filter(m => m.eventId === eventId && m.categoryId === categoryId && m.groupLabel === group)
  const res = rankStanding(rows, matches, policy)
  const team = res.rows[pos - 1]?.team ?? null
  if (team === null) return null
  // Do not qualify a team whose exact position is still undecided.
  if (res.unresolved.some(g => g.includes(team))) return null
  return team
}

// Re-derive every finals slot for the event from current standings. Idempotent.
export function resolveFinals(state: State, eventId: string): void {
  for (const f of state.finals) {
    if (f.eventId !== eventId) continue
    f.homeResolved = resolveSlot(state, eventId, f.categoryId, f.home)
    f.awayResolved = resolveSlot(state, eventId, f.categoryId, f.away)
  }
}
```

- [ ] **Step 2: Remove the moved functions from `store.ts` and import them**

In `shared/mock/store.ts`: delete the `recomputeStandings`, `groupComplete`, `resolveSlot`, and `resolveFinals` function definitions (the block added in the O8a/O8b rounds, around lines 247-272 plus the earlier O8b helpers). Remove the now-unused `import { rankStanding } from './ranking'` line. Add:

```ts
import { recomputeStandings, resolveFinals } from './derive'
```

`generateSchedule` and `recordResult` keep their existing calls `resolveFinals(state, eventId)` / `recomputeStandings(state, m.eventId)` / `resolveFinals(state, m.eventId)` — now resolved from the import.

- [ ] **Step 3: Add a gating test**

Append to `shared/mock/finals-resolve.test.ts` inside the existing `describe(...)`:

```ts
  it('does not qualify a team whose position depends on an unresolved tie', () => {
    // Build a completed group where two teams are perfectly tied.
    // Uses the demo-style single-group flow via generateSchedule on cat-1 is not
    // deterministic enough here, so assert the store path leaves the slot null when
    // recorded results produce an exact tie for the qualifying position.
    generateSchedule('evt-1', config)
    const cat1 = getScheduledMatches('evt-1').filter(x => x.categoryId === 'cat-1')
    const gA = cat1[0].groupLabel
    const gAmatches = cat1.filter(x => x.groupLabel === gA)
    // Record every Girone A match as a 1-1 draw → all its teams tie on everything.
    for (const m of gAmatches) recordResult(m.id, 1, 1)
    // Every finals slot referencing Girone A must stay a placeholder (positions undecided).
    for (const f of getFinals('evt-1').filter(f => f.categoryId === 'cat-1')) {
      if (f.home === `1ª ${gA}` || f.home === `2ª ${gA}`) expect(f.homeResolved).toBeNull()
      if (f.away === `1ª ${gA}` || f.away === `2ª ${gA}`) expect(f.awayResolved).toBeNull()
    }
  })
```

- [ ] **Step 4: Run finals-resolve + ranking + full suite**

Run: `npm test && npx tsc --noEmit`
Expected: `chrome.ts` still fails to compile (old `renderStandings` internal call to `rankStanding(rows)`), so `npm test` may still be RED here. Run `npm test -- finals-resolve ranking tiebreak` → those PASS. Full green comes after Task 4. Do not commit if tsc fails on chrome.ts — proceed to Task 4 first, then commit both.

Actually, to keep commits clean: verify `npm test -- finals-resolve ranking tiebreak` PASS, then commit Task 3 (store/derive) even though chrome.ts is not yet updated — the commit compiles the mock layer; chrome fix lands in Task 4. If `npx tsc --noEmit` fails only on `shared/chrome.ts`, that is expected at this step.

- [ ] **Step 5: Commit**

```bash
git add shared/mock/derive.ts shared/mock/store.ts shared/mock/finals-resolve.test.ts
git commit -m "refactor(tiebreak): derive.ts; policy-aware finals resolution with unresolved gating"
```

---

### Task 4: `renderStandings` consumes policy + matches; unresolved badge; call sites

**Files:**
- Modify: `shared/chrome.ts` (renderStandings signature + internal rankStanding call + badge)
- Modify: `apps/organizer/schedule.ts:195` (pass matches + policy)
- Modify: `apps/public/standings.ts` (pass matches + policy at both call sites; import `getScheduledMatches`)
- Test: none new (covered by ranking + integration in Task 6); verified by build + tsc.

**Interfaces:**
- Consumes: `rankStanding`, `RankResult` from `./mock/ranking`; `ScheduledMatch`, `TieBreakCriterion` from `./mock/types`.
- Produces: `renderStandings(rows: StandingRow[], matches: ScheduledMatch[], policy: TieBreakCriterion[], catName: (id: string) => string): string`.

- [ ] **Step 1: Update imports in `chrome.ts`**

`shared/chrome.ts` line 6 imports types; ensure `ScheduledMatch`, `StandingRow`, `FinalMatch`, `TieBreakCriterion` are all imported:

```ts
import type { ScheduledMatch, StandingRow, FinalMatch, TieBreakCriterion } from './mock/types'
```

The value import `import { rankStanding } from './mock/ranking'` already exists from the O8b round — keep it.

- [ ] **Step 2: Rewrite `renderStandings`**

Replace the whole `renderStandings` function (chrome.ts:64-92) with:

```ts
export function renderStandings(rows: StandingRow[], matches: ScheduledMatch[], policy: TieBreakCriterion[], catName: (id: string) => string): string {
  if (!rows.length) return `<p class="pf-muted">Nessuna classifica.</p>`
  const catIds: string[] = []
  for (const r of rows) if (!catIds.includes(r.categoryId)) catIds.push(r.categoryId)
  return catIds.map(catId => {
    const catRows = rows.filter(r => r.categoryId === catId)
    const groups: string[] = []
    for (const r of catRows) if (!groups.includes(r.groupLabel)) groups.push(r.groupLabel)
    return groups.map(g => {
      const gm = matches.filter(m => m.categoryId === catId && m.groupLabel === g)
      const { rows: gr, unresolved } = rankStanding(catRows.filter(r => r.groupLabel === g), gm, policy)
      const tied = new Set(unresolved.flat())
      const body = gr.map((r, i) => `<tr>
        <td>${i + 1}${tied.has(r.team) ? ' <span class="pf-tiebadge" title="Parità da definire">≈</span>' : ''}</td>
        <td class="pf-stand__team">${r.team}</td>
        <td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td>
        <td>${r.goalsFor}</td><td>${r.goalsAgainst}</td><td>${r.goalsFor - r.goalsAgainst}</td><td><b>${r.points}</b></td>
      </tr>`).join('')
      const note = unresolved.length ? `<p class="pf-muted pf-tienote">≈ parità da definire tra: ${unresolved.map(grp => grp.join(', ')).join(' · ')}</p>` : ''
      return `<div class="pf-stand">
        <div class="pf-stand__head"><span class="pf-cat__label">${catName(catId)}</span><span class="pf-mono">${g}</span></div>
        <div class="pf-tablewrap"><table class="pf-standings">
          <thead><tr><th>#</th><th>Squadra</th><th>G</th><th>V</th><th>N</th><th>P</th><th>GF</th><th>GS</th><th>DR</th><th>Pt</th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>${note}
      </div>`
    }).join('')
  }).join('')
}
```

- [ ] **Step 3: Add minimal CSS for the badge**

In `shared/ui.css`, append:

```css
.pf-tiebadge { color: var(--pf-accent, #ff6b00); font-weight: 700; }
.pf-tienote { margin-top: 6px; font-size: 0.85em; }
```

(If `--pf-accent` is not the accent token name in `tokens.css`, use the accent variable already defined there — grep `--pf` in `shared/tokens.css` and use the orange accent token.)

- [ ] **Step 4: Update E1 call site**

In `apps/organizer/schedule.ts`, line 195 currently:

```ts
    + renderStandings(getStandings(id).filter(s => inSel(s.categoryId, s.groupLabel)), catName)
```

Change to:

```ts
    + renderStandings(getStandings(id).filter(s => inSel(s.categoryId, s.groupLabel)), getScheduledMatches(id), getEvent(id)?.tieBreak ?? [], catName)
```

Ensure `getEvent` is imported in schedule.ts — add it to the existing `from '../../shared/mock/store'` import if missing:

```ts
import { getCategories, getSchedule, getScheduledMatches, getStandings, getFinals, getEvent, generateSchedule, approveSchedule, publishSchedule, rescheduleMatch, recordResult } from '../../shared/mock/store'
```

- [ ] **Step 5: Update public standings call sites**

In `apps/public/standings.ts`:
- Add `getScheduledMatches` to the store import:
  ```ts
  import { getCategories, getEvent, getSchedule, getStandings, getScheduledMatches } from '../../shared/mock/store'
  ```
- The empty-state call `renderStandings([], catName)` becomes `renderStandings([], [], [], catName)`.
- The main call `renderStandings(rows, catName)` becomes:
  ```ts
  document.getElementById('standings')!.innerHTML = renderStandings(rows, getScheduledMatches(id), getEvent(id)?.tieBreak ?? [], catName)
  ```

- [ ] **Step 6: Verify full suite, build, tsc**

Run: `npm test && npm run build && npx tsc --noEmit`
Expected: all tests PASS (50), build OK, tsc clean.

- [ ] **Step 7: Commit**

```bash
git add shared/chrome.ts shared/ui.css apps/organizer/schedule.ts apps/public/standings.ts
git commit -m "feat(tiebreak): standings render via policy engine + unresolved badge"
```

---

### Task 5: Tie-break editor in create-event

**Files:**
- Modify: `apps/organizer/create-event.html` (add editor container)
- Modify: `apps/organizer/create-event.ts` (render + reorder + submit)

**Interfaces:**
- Consumes: `defaultTieBreak`, `criterionLabel` from `../../shared/mock/tiebreak`; `TieBreakCriterion` from `../../shared/mock/types`; `createEvent` (now accepts `tieBreak`).

- [ ] **Step 1: Add the editor container to the HTML**

In `apps/organizer/create-event.html`, insert this block just before the submit button (`<button ... >Crea evento</button>`):

```html
      <div class="pf-field">
        <label>Criteri di spareggio (i punti valgono sempre per primi)</label>
        <div id="tiebreak"></div>
      </div>
```

- [ ] **Step 2: Rewrite `create-event.ts`**

```ts
import { renderOrganizerTopbar } from '../../shared/chrome'
import { createEvent } from '../../shared/mock/store'
import { defaultTieBreak, criterionLabel } from '../../shared/mock/tiebreak'
import type { TieBreakCriterion } from '../../shared/mock/types'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')

const ALL: TieBreakCriterion[] = ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR']
// Ordered working list; `enabled` marks which criteria are active (in this order).
let policy: TieBreakCriterion[] = defaultTieBreak('Calcio')
let enabled = new Set(policy)
// Keep a stable ordered view of all criteria (active ones first, in policy order).
let ordered: TieBreakCriterion[] = [...policy, ...ALL.filter(c => !policy.includes(c))]

function collect(): TieBreakCriterion[] { return ordered.filter(c => enabled.has(c)) }

function renderEditor(): void {
  const host = document.getElementById('tiebreak')!
  host.innerHTML = `<ol class="pf-tblist">
    <li class="pf-tbrow pf-tbrow--fixed"><span class="pf-mono">1.</span> Punti <span class="pf-muted">(sempre, bloccato)</span></li>
    ${ordered.map((c, i) => `<li class="pf-tbrow">
      <label><input type="checkbox" data-c="${c}" ${enabled.has(c) ? 'checked' : ''}/> ${criterionLabel(c)}</label>
      <span class="pf-tbmove">
        <button type="button" class="pf-btn pf-btn--ghost" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="pf-btn pf-btn--ghost" data-down="${i}" ${i === ordered.length - 1 ? 'disabled' : ''}>↓</button>
      </span>
    </li>`).join('')}
  </ol>`
  host.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(cb =>
    cb.addEventListener('change', () => { const c = cb.dataset.c as TieBreakCriterion; if (cb.checked) enabled.add(c); else enabled.delete(c) }))
  host.querySelectorAll<HTMLButtonElement>('button[data-up]').forEach(b =>
    b.addEventListener('click', () => { const i = Number(b.dataset.up); [ordered[i - 1], ordered[i]] = [ordered[i], ordered[i - 1]]; renderEditor() }))
  host.querySelectorAll<HTMLButtonElement>('button[data-down]').forEach(b =>
    b.addEventListener('click', () => { const i = Number(b.dataset.down); [ordered[i + 1], ordered[i]] = [ordered[i], ordered[i + 1]]; renderEditor() }))
}

const sportInput = document.querySelector<HTMLInputElement>('input[name=sport]')!
sportInput.addEventListener('change', () => {
  policy = defaultTieBreak(sportInput.value)
  enabled = new Set(policy)
  ordered = [...policy, ...ALL.filter(c => !policy.includes(c))]
  renderEditor()
})

renderEditor()

document.getElementById('form')!.addEventListener('submit', (ev) => {
  ev.preventDefault()
  const f = ev.target as HTMLFormElement
  const data = new FormData(f)
  const event = createEvent({
    name: String(data.get('name')), sport: String(data.get('sport')), location: String(data.get('location')),
    startDate: String(data.get('startDate')), startTime: String(data.get('startTime')), endDate: String(data.get('endDate')),
    tieBreak: collect(),
  })
  location.href = `/apps/organizer/event-hub.html?event=${event.id}`
})
```

- [ ] **Step 3: Add minimal CSS**

Append to `shared/ui.css`:

```css
.pf-tblist { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.pf-tbrow { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding: 8px 10px; border: 1px solid var(--pf-border, #e2e6ee); border-radius: 8px; }
.pf-tbrow--fixed { opacity: 0.7; }
.pf-tbmove { display: inline-flex; gap: 4px; }
```

(Use the border token that exists in `tokens.css` if `--pf-border` differs.)

- [ ] **Step 4: Verify build + tsc + create the event manually**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: build OK, tsc clean, 50 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer/create-event.html apps/organizer/create-event.ts shared/ui.css
git commit -m "feat(tiebreak): tie-break editor in create-event (reorder + enable)"
```

---

### Task 6: Five demo events (one per tie case) + scenario tests

**Files:**
- Modify: `shared/mock/seed.ts` (demo events builder + 5 events, hydrated via `derive.ts`)
- Modify: `shared/mock/store.test.ts` (event count assertion 1 → 6)
- Test: `shared/mock/tiebreak-demo.test.ts` (create — one assertion per scenario)

**Interfaces:**
- Consumes: `recomputeStandings`, `resolveFinals` from `./derive`; `getEvents`, `getStandings`, `getFinals` from `./store`.

- [ ] **Step 1: Write the failing scenario test**

Create `shared/mock/tiebreak-demo.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getEvents, getStandings, getFinals } from './store'
import { rankStanding } from './ranking'
import { defaultTieBreak } from './tiebreak'
import { getScheduledMatches } from './store'

const rankOf = (eventId: string) => {
  const rows = getStandings(eventId)
  const matches = getScheduledMatches(eventId)
  return rankStanding(rows, matches, defaultTieBreak('Calcio'))
}

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('tie-break demo events', () => {
  it('seeds the five demo events alongside evt-1', () => {
    const ids = getEvents().map(e => e.id)
    expect(ids).toContain('evt-tie-h2h')
    expect(ids).toContain('evt-tie-avulsa')
    expect(ids).toContain('evt-tie-dr')
    expect(ids).toContain('evt-tie-gf')
    expect(ids).toContain('evt-tie-open')
  })

  it('head-to-head event ranks the direct-match winner first', () => {
    const res = rankOf('evt-tie-h2h')
    expect(res.rows.slice(0, 2).map(r => r.team)).toEqual(['Alfa', 'Bravo'])
    expect(res.unresolved).toEqual([])
  })

  it('avulsa event ranks by the mini-league among the three tied teams', () => {
    expect(rankOf('evt-tie-avulsa').rows.map(r => r.team)).toEqual(['Alfa', 'Charlie', 'Bravo', 'Delta'])
  })

  it('goal-difference event separates two drawn teams by overall GD', () => {
    expect(rankOf('evt-tie-dr').rows.slice(0, 2).map(r => r.team)).toEqual(['Alfa', 'Bravo'])
  })

  it('goals-for event separates two drawn, equal-GD teams by goals scored', () => {
    expect(rankOf('evt-tie-gf').rows.slice(0, 2).map(r => r.team)).toEqual(['Alfa', 'Bravo'])
  })

  it('unresolved event reports the tied pair and leaves both final slots as placeholders', () => {
    const res = rankOf('evt-tie-open')
    expect(res.unresolved).toEqual([['Alfa', 'Bravo']])
    const finals = getFinals('evt-tie-open')
    expect(finals).toHaveLength(1)
    expect(finals[0].homeResolved).toBeNull()
    expect(finals[0].awayResolved).toBeNull()
  })

  it('a resolved event fills its final slots from the standings', () => {
    const f = getFinals('evt-tie-h2h')[0]
    expect(f.homeResolved).toBe('Alfa')
    expect(f.awayResolved).toBe('Bravo')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tiebreak-demo`
Expected: FAIL — demo events not in seed.

- [ ] **Step 3: Add the demo builder + events to `seed.ts`**

At the top of `shared/mock/seed.ts`, update the import and add the builder. Change line 1 to:

```ts
import type { State, ScheduledMatch, StandingRow, FinalMatch, Competition, Schedule, GroupSlot, Category, TournamentEvent } from './types'
import { recomputeStandings, resolveFinals } from './derive'
```

Add this builder function above `export function buildSeed()`:

```ts
// One demo event: single category, single girone "Girone A", SINGLE_GROUP_CROSSOVER
// final (1ª vs 2ª). `results` are [homeIdx, homeScore, awayIdx, awayScore] over `teams`.
function demoEvent(id: string, name: string, teams: string[], results: [number, number, number, number][]): {
  event: TournamentEvent; category: Category; competition: Competition; schedule: Schedule;
  groupSlots: GroupSlot[]; matches: ScheduledMatch[]; standings: StandingRow[]; finals: FinalMatch[]
} {
  const catId = `${id}-cat`
  const event: TournamentEvent = {
    id, organizationId: 'org-1', name, sport: 'Calcio', location: 'Campo Demo',
    startDate: '2026-09-01', startTime: '09:00', endDate: '2026-09-01', template: 'PB-1',
    registrationsOpen: false, tieBreak: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
  }
  const category: Category = { id: catId, eventId: id, name: 'Unica', maxTeams: teams.length }
  const competition: Competition = {
    id: `${id}-comp`, eventId: id, categoryId: catId, format: 'GROUPS_KNOCKOUT', legs: 'SINGLE',
    groupsCount: 1, qualifiersPerGroup: 2, finalsType: 'SINGLE_GROUP_CROSSOVER', groupsLocked: true,
  }
  const schedule: Schedule = {
    eventId: id, status: 'PUBLISHED', config: {
      dailyStart: '09:00', slotsPerDay: 4, finalsDate: '2026-09-01',
      byCategory: { [catId]: { fields: ['Campo 1'], periods: 2, periodMinutes: 20, breakMinutes: 10 } },
    },
  }
  const groupSlots: GroupSlot[] = teams.map(t => ({ eventId: id, categoryId: catId, team: t, groupLabel: 'Girone A' }))
  const matches: ScheduledMatch[] = results.map((r, i) => ({
    id: `${id}-m${i + 1}`, eventId: id, categoryId: catId, groupLabel: 'Girone A',
    day: '2026-09-01', time: '09:00', field: 'Campo 1',
    home: teams[r[0]], away: teams[r[2]], homeScore: r[1], awayScore: r[3],
  }))
  const standings: StandingRow[] = teams.map(t => ({
    eventId: id, categoryId: catId, groupLabel: 'Girone A', team: t,
    played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
  }))
  const finals: FinalMatch[] = [{
    id: `${id}-f1`, eventId: id, categoryId: catId, bracketLabel: 'Tabellone', round: 'Finale', order: 1,
    home: '1ª Girone A', away: '2ª Girone A', day: '2026-09-01', time: '11:00', field: 'Campo 1',
    homeResolved: null, awayResolved: null,
  }]
  return { event, category, competition, schedule, groupSlots, matches, standings, finals }
}
```

- [ ] **Step 4: Wire the demo events into `buildSeed`**

The five demo specs (exact `results`, verified to isolate each criterion):

```ts
const DEMOS = [
  demoEvent('evt-tie-h2h', 'Demo · Scontri diretti', ['Alfa', 'Bravo', 'Charlie', 'Delta'],
    [[0, 1, 1, 0], [0, 1, 2, 0], [3, 1, 0, 0], [1, 1, 2, 0], [1, 1, 3, 0], [2, 1, 3, 0]]),
  demoEvent('evt-tie-avulsa', 'Demo · Classifica avulsa', ['Alfa', 'Bravo', 'Charlie', 'Delta'],
    [[0, 3, 1, 0], [1, 1, 2, 0], [2, 1, 0, 0], [0, 1, 3, 0], [1, 5, 3, 0], [2, 3, 3, 0]]),
  demoEvent('evt-tie-dr', 'Demo · Differenza reti', ['Alfa', 'Bravo', 'Charlie'],
    [[0, 1, 1, 1], [0, 3, 2, 0], [1, 1, 2, 0]]),
  demoEvent('evt-tie-gf', 'Demo · Reti fatte', ['Alfa', 'Bravo', 'Charlie'],
    [[0, 2, 1, 2], [0, 3, 2, 1], [1, 2, 2, 0]]),
  demoEvent('evt-tie-open', 'Demo · Parità irrisolta', ['Alfa', 'Bravo', 'Charlie'],
    [[0, 1, 1, 1], [0, 2, 2, 0], [1, 2, 2, 0]]),
]
```

In `buildSeed`, capture the base state in a `const state: State = { ... }` (it currently `return {...}` directly), then before returning, append the demo data and hydrate. Concretely:

1. Change `return {` (line 4) to `const state: State = {`.
2. After the object literal's closing `}` (currently line 73-74 `}\n}`), before the function's final `}`, add:

```ts
  for (const d of DEMOS) {
    state.events.push(d.event)
    state.categories.push(d.category)
    state.competitions.push(d.competition)
    state.schedules.push(d.schedule)
    state.groupSlots.push(...d.groupSlots)
    state.scheduledMatches.push(...d.matches)
    state.standings.push(...d.standings)
    state.finals.push(...d.finals)
  }
  for (const d of DEMOS) { recomputeStandings(state, d.event.id); resolveFinals(state, d.event.id) }
  return state
```

- [ ] **Step 5: Update the event-count assertion in `store.test.ts`**

In `shared/mock/store.test.ts`, the test `'seeds one event with three categories and three registrations'` asserts `expect(getEvents()).toHaveLength(1)`. Change to:

```ts
    expect(getEvents()).toHaveLength(6) // evt-1 + 5 tie-break demo events
```

(Leave `getEvent('evt-1')`, `getCategories('evt-1')` → 3, and `getRegistrations('evt-1')` → 12 assertions unchanged; the `createEvent` → `evt-2` test also stays green thanks to the numeric-max id.)

- [ ] **Step 6: Run the scenario tests + full suite + tsc**

Run: `npm test && npx tsc --noEmit`
Expected: `tiebreak-demo` PASS (7 tests); full suite PASS (57); tsc clean. If a scenario order assertion fails, the demo `results` math is wrong — fix the scores, not the test's documented expectation (the expectations encode the intended, sportingly-correct order).

- [ ] **Step 7: Commit**

```bash
git add shared/mock/seed.ts shared/mock/store.test.ts shared/mock/tiebreak-demo.test.ts
git commit -m "feat(tiebreak): five demo events, one per tie-break case"
```

---

### Task 7: Docs + full verification

**Files:**
- Modify: `README.md`

**Interfaces:** none.

- [ ] **Step 1: Update the README**

In `README.md`, add a bullet under the feature list (after the "Live results" bullet):

```md
- **Tie-break** — the standings order is a per-event policy (default per sport, editable in create-event): points → scontri diretti/avulsa → differenza reti → reti fatte. Teams left perfectly tied are flagged "parità da definire" and their finals qualification is withheld. Five **demo events** (dashboard) show each case: scontri diretti, classifica avulsa, differenza reti, reti fatte, parità irrisolta.
```

- [ ] **Step 2: Full verification**

Run: `npm test && npm run build && npx tsc --noEmit`
Expected: 57 tests PASS, build OK, tsc clean.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(tiebreak): note per-event tie-break policy + demo events"
```

---

## Self-Review

**Spec coverage:**
- `TieBreakCriterion` + `Event.tieBreak` + defaults per sport — Task 1. ✔
- `rankStanding(rows, matches, policy) → {rows, unresolved}` with h2h/avulsa/GD/GF — Task 2. ✔
- Policy-aware resolution + unresolved gating; derive.ts extraction — Task 3. ✔
- `renderStandings` consumes policy+matches, badge, both call sites — Task 4. ✔
- Create-event editor (reorder up/down + enable, sport default) — Task 5. ✔
- 5 demo events + per-scenario tests + consistency (hydrated via real engine) — Task 6. ✔
- Success criteria 1-5 — Tasks 1,2,3,4,6. ✔

**Placeholder scan:** none — all steps carry concrete code. (Demo match scores are concrete in Task 6.)

**Type consistency:** `rankStanding` new signature used identically in Task 2 (def), Task 3 (`resolveSlot`), Task 4 (`renderStandings`). `RankResult { rows, unresolved }` consumed consistently. `TieBreakCriterion` values fixed across tiebreak.ts, types.ts, engine, editor. `recomputeStandings`/`resolveFinals(state, eventId)` signatures identical in derive.ts, store.ts imports, and seed.ts hydration. Demo events use non-numeric ids so `createEvent`'s numeric-max id keeps yielding `evt-2` (store.test unchanged there).

**Note on Task 3 gating test:** it uses the existing `generateSchedule` flow on evt-1 with all-draw results (guaranteed exact ties for every team in a group), so the qualifying positions are undecided and the slots must stay null — a real end-to-end assertion of the gate, independent of demo seed data.

**Cross-task ordering:** the full suite is intentionally red between Task 2 and Task 4 (old call sites). Tasks 2 and 3 gate on targeted test files; Task 4 restores full green. This is called out in each task's verify step.
