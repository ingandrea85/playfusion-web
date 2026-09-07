# Festival (non-competitive) event format — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Add a fourth event format `festival` — rotation-generated N matches per team, no standings, no finals, calendar-only.

**Architecture:** `festival` joins the o3 event `format` union and is special-cased like `bracket`. A new pure `rotationPairs` generates N-per-team pairings (circle method); the greedy placement loop is extracted from `buildFixtures` into `placeMatches` and reused. Festival matches carry `phase:'FESTIVAL'`, which `computeStandings` skips; the festival generate-branch never builds finals. Views gate to calendar-only.

**Tech Stack:** TypeScript (ESM), o7-scheduling service, o3-sport-events, rest-client, E1/E3 apps, app-shell, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-festival-format-design.md`

## Global Constraints

- Format union value is exactly `'festival'`. Match phase is exactly `'FESTIVAL'`. UI label: `'Festival (non competitivo)'`.
- Default matches-per-team is `3` when unset. Config field name: `festivalMatchesPerTeam` (top-level default + per-category `byCategory` override).
- The existing round-robin (`buildFixtures`) output must remain **byte-identical** after the `placeMatches` extraction (existing o7 schedule tests are the regression guard).
- Festival matches: `phase:'FESTIVAL'`, `groupLabel:''`, no bracket fields; results recordable but never ranked.
- Branch: `feature/festival-format`. Commit locally; no push/merge/tag until the (already-authorized) deploy step.

---

### Task 1: `rotationPairs` pure generator

**Files:**
- Modify: `services/o7-scheduling/src/fixtures.ts`
- Test: `services/o7-scheduling/test/rotation-pairs.test.ts` (create)

**Interfaces:**
- Produces: `export function rotationPairs(teams: string[], n: number): Array<[string, string]>`

- [ ] **Step 1: failing test**

```ts
// services/o7-scheduling/test/rotation-pairs.test.ts
import { describe, it, expect } from 'vitest';
import { rotationPairs } from '../src/fixtures.js';

const count = (pairs: Array<[string,string]>, team: string) => pairs.filter(([a,b]) => a===team||b===team).length;

describe('rotationPairs (circle method)', () => {
  it('even teams: each team plays exactly n, no repeated opponent', () => {
    const teams = ['A','B','C','D','E','F'];
    const pairs = rotationPairs(teams, 3);
    for (const t of teams) expect(count(pairs, t)).toBe(3);
    const seen = new Set(pairs.map(([a,b]) => [a,b].sort().join('-')));
    expect(seen.size).toBe(pairs.length); // no duplicate matchup
  });
  it('caps n at teams-1', () => {
    const pairs = rotationPairs(['A','B','C','D'], 9);
    for (const t of ['A','B','C','D']) expect(count(pairs, t)).toBe(3);
  });
  it('odd teams: a rotating bye, each team plays at most n', () => {
    const teams = ['A','B','C','D','E'];
    const pairs = rotationPairs(teams, 3);
    for (const t of teams) expect(count(pairs, t)).toBeLessThanOrEqual(3);
    expect(pairs.every(([a,b]) => a !== '__BYE__' && b !== '__BYE__')).toBe(true);
    const seen = new Set(pairs.map(([a,b]) => [a,b].sort().join('-')));
    expect(seen.size).toBe(pairs.length);
  });
  it('fewer than 2 teams: no matches', () => {
    expect(rotationPairs(['A'], 3)).toEqual([]);
    expect(rotationPairs([], 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: run → fail** — `npx vitest run services/o7-scheduling/test/rotation-pairs.test.ts` (rotationPairs not exported).

- [ ] **Step 3: implement** — add to `services/o7-scheduling/src/fixtures.ts` (after `pairs`):

```ts
/** Festival pairing (circle method): `n` rounds where each team meets distinct opponents. Even team
 *  counts give each team exactly min(n, teams-1) matches; odd counts add a rotating bye, so a team
 *  plays at most that many. Returns unordered pairs; ordering (home/away) is arbitrary (no legs). */
export function rotationPairs(teams: string[], n: number): Array<[string, string]> {
  if (teams.length < 2 || n < 1) return [];
  const t = [...teams];
  if (t.length % 2 === 1) t.push('__BYE__');
  const m = t.length;                 // even
  const rounds = Math.min(Math.floor(n), m - 1);
  const out: Array<[string, string]> = [];
  let arr = [...t];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < m / 2; i++) {
      const a = arr[i]!, b = arr[m - 1 - i]!;
      if (a !== '__BYE__' && b !== '__BYE__') out.push([a, b]);
    }
    arr = [arr[0]!, arr[m - 1]!, ...arr.slice(1, m - 1)]; // fix first, rotate the rest
  }
  return out;
}
```

- [ ] **Step 4: run → pass.**
- [ ] **Step 5: commit** — `git add services/o7-scheduling/src/fixtures.ts services/o7-scheduling/test/rotation-pairs.test.ts && git commit -m "feat(o7): rotationPairs — circle-method N-per-team pairings"`

---

### Task 2: Types & config scaffold (`festival` + `FESTIVAL` + `festivalMatchesPerTeam`)

**Files:**
- Modify: `libs/rest-client/src/types.ts` (the `EventFormat` union)
- Modify: `services/o3-sport-events/src/domain.ts` (SportEvent.format), `services/o3-sport-events/src/handler.ts:43` (zod enum)
- Modify: `services/o7-scheduling/src/ports.ts` (EventView.format)
- Modify: `services/o7-scheduling/src/domain.ts` (MatchPhase, ScheduleConfig, CategorySchedule, categoryConfig)
- Modify: `services/o7-scheduling/src/handler.ts` (scheduleConfigBody + categorySchedule zod)
- Test: `services/o7-scheduling/test/festival-config.test.ts` (create)

**Interfaces:**
- Produces: `MatchPhase` now `'GROUP' | 'FINAL' | 'FINAL_GROUP' | 'FESTIVAL'`; `ScheduleConfig.festivalMatchesPerTeam?: number`; `CategorySchedule.festivalMatchesPerTeam?: number`; `categoryConfig` resolves it.

- [ ] **Step 1: add `'festival'` to every `format` union**
  - `libs/rest-client/src/types.ts`: find `EventFormat` (grep `type EventFormat`) and add `| 'festival'`.
  - `services/o3-sport-events/src/domain.ts`: `format?: 'groups' | 'groups+bracket' | 'bracket' | 'festival';`
  - `services/o3-sport-events/src/handler.ts:43`: `format: z.enum(['groups', 'groups+bracket', 'bracket', 'festival']).optional(),`
  - `services/o7-scheduling/src/ports.ts`: extend `EventView.format` union with `| 'festival'`.

- [ ] **Step 2: `MatchPhase` gains `'FESTIVAL'`** — `services/o7-scheduling/src/domain.ts:97`:

```ts
export type MatchPhase = 'GROUP' | 'FINAL' | 'FINAL_GROUP' | 'FESTIVAL';
```

- [ ] **Step 3: `festivalMatchesPerTeam` on config + categoryConfig** — in `services/o7-scheduling/src/domain.ts`:
  - add to `CategorySchedule` (after finals fields): `festivalMatchesPerTeam?: number;`
  - add to `ScheduleConfig` (after finals defaults): `/** Festival: matches each team plays (default 3). Per-category via byCategory. */ festivalMatchesPerTeam?: number;`
  - in `categoryConfig`'s default-branch object add: `festivalMatchesPerTeam: config.festivalMatchesPerTeam,`

- [ ] **Step 4: zod** — `services/o7-scheduling/src/handler.ts`: add `festivalMatchesPerTeam: z.number().int().positive().optional(),` to BOTH `categorySchedule` (line ~55) and `scheduleConfigBody` (line ~63).

- [ ] **Step 5: failing test**

```ts
// services/o7-scheduling/test/festival-config.test.ts
import { describe, it, expect } from 'vitest';
import { categoryConfig, defaultConfig } from '../src/domain.js';

describe('festivalMatchesPerTeam resolution', () => {
  it('per-category override wins; else the top-level default', () => {
    const cfg = { ...defaultConfig(), festivalMatchesPerTeam: 4, byCategory: { U10: { fields: ['C1'], periods: 1, periodMinutes: 10, breakMinutes: 2, legs: 'SINGLE' as const, festivalMatchesPerTeam: 2 } } };
    expect(categoryConfig(cfg, 'U10').festivalMatchesPerTeam).toBe(2);
    expect(categoryConfig(cfg, 'U8').festivalMatchesPerTeam).toBe(4); // default
  });
});
```

- [ ] **Step 6: run → pass; verify tsc** — `npx vitest run services/o7-scheduling/test/festival-config.test.ts` and `npx tsc -p services/o7-scheduling/tsconfig.json --noEmit` (clean). Also tsc rest-client + o3.

- [ ] **Step 7: commit** — `git commit -m "feat(o7,o3): festival format value + FESTIVAL phase + festivalMatchesPerTeam config"`

---

### Task 3: Extract `placeMatches` (round-robin byte-identical)

**Files:**
- Modify: `services/o7-scheduling/src/fixtures.ts`
- Test: existing `services/o7-scheduling/test/*schedule*`/`*fixtures*` are the regression guard.

**Interfaces:**
- Produces: `placeMatches(raw, startDate, endDate, dailyStart, eventId): ScheduledMatch[]` where `raw: Array<{ categoryId: string; groupLabel: string; home: string; away: string; place: { fields: string[]; slotMinutes: number }; phase?: MatchPhase }>`.

- [ ] **Step 1: refactor** — replace the body of `buildFixtures` so it builds the `raw` array (unchanged logic: category → group → `pairs`, HOME_AWAY doubling) and then `return placeMatches(raw, startDate, endDate, dailyStart, eventId)`. Move the greedy placement loop (current lines ~62-89) verbatim into a new exported `placeMatches`, adding `...(r.phase ? { phase: r.phase } : {})` to the emitted match object. `RawMatch` entries built by `buildFixtures` set no `phase` (group fixtures stay phase-absent → identical output). Keep `pairs`, `dateRange`, `addMinutes`, `Placement`, `Slot`, `placeKey` as-is. Import `MatchPhase` type from `./domain.js`.

- [ ] **Step 2: run the full o7 suite** — `npx vitest run services/o7-scheduling` — all existing schedule/fixtures tests must still pass (byte-identical placement). If any fail, the extraction changed behavior — fix until identical.

- [ ] **Step 3: tsc** — `npx tsc -p services/o7-scheduling/tsconfig.json --noEmit` clean.

- [ ] **Step 4: commit** — `git commit -m "refactor(o7): extract placeMatches from buildFixtures (round-robin unchanged)"`

---

### Task 4: `buildFestivalFixtures`

**Files:**
- Modify: `services/o7-scheduling/src/fixtures.ts`
- Test: `services/o7-scheduling/test/festival-fixtures.test.ts` (create)

**Interfaces:**
- Consumes: `rotationPairs`, `placeMatches`.
- Produces: `interface FestivalCategory { id: string; teams: string[]; matchesPerTeam: number; fields: string[]; periods: number; periodMinutes: number; breakMinutes: number }` and `buildFestivalFixtures(eventId, startDate, endDate, dailyStart, cats: FestivalCategory[]): ScheduledMatch[]`.

- [ ] **Step 1: failing test**

```ts
// services/o7-scheduling/test/festival-fixtures.test.ts
import { describe, it, expect } from 'vitest';
import { buildFestivalFixtures, type FestivalCategory } from '../src/fixtures.js';

const cat = (over: Partial<FestivalCategory> = {}): FestivalCategory =>
  ({ id: 'U10', teams: ['A','B','C','D'], matchesPerTeam: 3, fields: ['C1','C2'], periods: 1, periodMinutes: 10, breakMinutes: 2, ...over });

describe('buildFestivalFixtures', () => {
  it('generates FESTIVAL matches, N per team, empty groupLabel, no finals fields', () => {
    const ms = buildFestivalFixtures('e1', '2026-06-01', '2026-06-01', '09:00', [cat()]);
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.every(m => m.phase === 'FESTIVAL')).toBe(true);
    expect(ms.every(m => m.groupLabel === '')).toBe(true);
    expect(ms.every(m => m.bracketLabel === undefined && m.round === undefined)).toBe(true);
    for (const t of ['A','B','C','D']) expect(ms.filter(m => m.home===t||m.away===t).length).toBe(3);
  });
  it('no team is on two fields at the same day+time', () => {
    const ms = buildFestivalFixtures('e1', '2026-06-01', '2026-06-02', '09:00', [cat()]);
    const seen = new Set<string>();
    for (const m of ms) for (const team of [m.home, m.away]) {
      const k = `${team}@${m.day} ${m.time}`;
      expect(seen.has(k)).toBe(false); seen.add(k);
    }
  });
});
```

- [ ] **Step 2: run → fail.**

- [ ] **Step 3: implement** — add to `fixtures.ts`:

```ts
export interface FestivalCategory {
  id: string; teams: string[]; matchesPerTeam: number;
  fields: string[]; periods: number; periodMinutes: number; breakMinutes: number;
}

/** Festival (non-competitive): each category's teams play `matchesPerTeam` rotation matches, placed
 *  on the shared grid (same engine as buildFixtures). No groups, no finals; phase = FESTIVAL. */
export function buildFestivalFixtures(
  eventId: string, startDate: string, endDate: string, dailyStart: string, cats: FestivalCategory[],
): ScheduledMatch[] {
  const raw = [];
  for (const cat of cats) {
    const slotMinutes = cat.periods * cat.periodMinutes + cat.breakMinutes;
    const fields = cat.fields.length ? cat.fields : ['Campo 1'];
    const place = { fields, slotMinutes };
    for (const [home, away] of rotationPairs(cat.teams, cat.matchesPerTeam)) {
      raw.push({ categoryId: cat.id, groupLabel: '', home, away, place, phase: 'FESTIVAL' as const });
    }
  }
  return placeMatches(raw, startDate, endDate, dailyStart, eventId);
}
```

- [ ] **Step 4: run → pass.**
- [ ] **Step 5: commit** — `git commit -m "feat(o7): buildFestivalFixtures (rotation matches, FESTIVAL phase)"`

---

### Task 5: `generateSchedule` festival branch

**Files:**
- Modify: `services/o7-scheduling/src/application/generate-schedule.ts`
- Test: `services/o7-scheduling/test/generate-festival.test.ts` (create) — mirror an existing generate-schedule test's deps setup.

**Interfaces:**
- Consumes: `buildFestivalFixtures`, `FestivalCategory`, `categoryConfig`.

- [ ] **Step 1: failing test** — copy the deps/mocks shape from the existing `generate-schedule` test file (find it: `services/o7-scheduling/test/*generate*`), set `event.format = 'festival'`, `event.categorie = ['U10']`, 4 confirmed teams, assert: all returned matches `phase==='FESTIVAL'`, zero `phase==='FINAL'`, each team appears in 3 matches.

- [ ] **Step 2: run → fail.**

- [ ] **Step 3: implement** — in `generate-schedule.ts`, add the import `buildFestivalFixtures, type FestivalCategory` from `../fixtures.js`, and a branch before the else:

```ts
    if (event.format === 'bracket') {
      allMatches = buildBracketMatches(/* …unchanged… */);
    } else if (event.format === 'festival') {
      // Festival (non-competitive): each category's confirmed teams play N rotation matches; no groups,
      // no standings (phase FESTIVAL), no finals.
      const festCats: FestivalCategory[] = event.categorie.map((categoria) => {
        const cc = categoryConfig(input.config, categoria);
        return {
          id: categoria, teams: byCategory.get(categoria) ?? [],
          matchesPerTeam: cc.festivalMatchesPerTeam ?? 3,
          fields: cc.fields, periods: cc.periods, periodMinutes: cc.periodMinutes, breakMinutes: cc.breakMinutes,
        };
      });
      allMatches = buildFestivalFixtures(input.sportEventId, event.dates.from, event.dates.to, input.config.dailyStart, festCats);
    } else {
      /* …unchanged groups + finals path… */
    }
```

- [ ] **Step 4: run → pass; full o7 suite green.**
- [ ] **Step 5: commit** — `git commit -m "feat(o7): generate festival schedule (rotation, no finals)"`

---

### Task 6: `computeStandings` skips FESTIVAL

**Files:**
- Modify: `services/o7-scheduling/src/standings.ts:33`
- Test: `services/o7-scheduling/test/standings.test.ts` (extend, or create `standings-festival.test.ts`)

- [ ] **Step 1: failing test**

```ts
// services/o7-scheduling/test/standings-festival.test.ts
import { describe, it, expect } from 'vitest';
import { computeStandings } from '../src/standings.js';
import type { ScheduledMatch } from '../src/domain.js';

const fest = (over: Partial<ScheduledMatch>): ScheduledMatch =>
  ({ id: 'x', sportEventId: 'e', categoryId: 'U10', groupLabel: '', day: '2026-06-01', time: '09:00', field: 'C1', home: 'A', away: 'B', phase: 'FESTIVAL', status: 'FINISHED', homeScore: 3, awayScore: 1, ...over });

it('festival matches never produce standings, even when finished with scores', () => {
  expect(computeStandings([fest({})])).toEqual([]);
});
```

- [ ] **Step 2: run → fail** (festival match currently creates a group row).

- [ ] **Step 3: implement** — `services/o7-scheduling/src/standings.ts:33` change:

```ts
    if (m.phase === 'FINAL' || m.phase === 'FESTIVAL') continue; // finals & festival never feed the table
```

- [ ] **Step 4: run → pass; full o7 suite green.**
- [ ] **Step 5: commit** — `git commit -m "feat(o7): festival matches excluded from standings"`

---

### Task 7: E1 views — tabs gate + create-event label

**Files:**
- Modify: `apps/e1-web/src/views/workspace.ts:36`, `apps/e1-web/src/views/create-event.ts:11-15`
- Test: `apps/e1-web/test/workspace.test.ts` (extend or create) + existing create-event test.

- [ ] **Step 1: failing test**

```ts
// apps/e1-web/test/workspace-festival.test.ts
import { describe, it, expect } from 'vitest';
import { workspaceTabs } from '../src/views/workspace';
it('festival hides gironi, standings and finals', () => {
  const keys = workspaceTabs({ sportEventId: 'e', format: 'festival' }).map(t => t.key);
  expect(keys).not.toContain('gironi');
  expect(keys).not.toContain('standings');
  expect(keys).not.toContain('finals');
  expect(keys).toContain('schedule');
  expect(keys).toContain('resources');
});
```

- [ ] **Step 2: run → fail.**

- [ ] **Step 3: implement**
  - `workspace.ts:36` replace with:
    ```ts
    const hide: Record<string, string[]> = { bracket: ['gironi', 'standings'], festival: ['gironi', 'standings', 'finals'] }
    const hidden = hide[event.format ?? ''] ?? []
    return tabs.filter((t) => !hidden.includes(t.key))
    ```
  - `create-event.ts` FORMAT_LABEL add: `'festival': 'Festival (non competitivo)',`

- [ ] **Step 4: run → pass; e1 tsc clean.**
- [ ] **Step 5: commit** — `git commit -m "feat(e1): festival tabs gate (calendar-only) + create-event label"`

---

### Task 8: E3 public views — calendar-only for festival

**Files:**
- Modify: `apps/e3-web/src/views/landing.ts:20` (standings CTA), `apps/e3-web/src/main.ts:92` (redirects), and the calendar phase-filter suppression (`apps/e3-web/src/views/calendar.ts` + `libs/app-shell/src/chrome.ts` `calendarGironeTabs`).
- Test: `apps/e3-web/test/landing.test.ts` (extend) / a calendar test.

- [ ] **Step 1: failing test** — assert `renderLanding`/`navButtons` for a `festival` event does NOT contain a "Classifiche" link nor a "Tabellone/Formula" link (only Calendario + Squadre/Avvisi).

- [ ] **Step 2: implement**
  - `landing.ts:20`: `const standingsCta = (event.format === 'bracket' || event.format === 'festival') ? '' : \`…Classifiche…\``; and likewise suppress the bracket/formula CTA for `festival`.
  - `main.ts`: for `festival`, redirect the `standings` and `bracket` routes to the calendar (mirror the `format === 'bracket'` redirect at line 92 — add `|| ev.format === 'festival'` and, for the standings route, also redirect festival to `/calendar`).
  - Calendar phase filter: in `apps/e3-web/src/views/calendar.ts`, when `event.format === 'festival'`, render the plain day/field match list without the `Gironi | Finali` sub-filter (pass a `hidePhaseFilter` flag to the shared `calendarGironeTabs` helper in `libs/app-shell/src/chrome.ts`, or short-circuit the tabs when festival). Festival matches (groupLabel `''`, no FINAL) already collapse to a single list; ensure no empty "Gironi/Finali" tabs render.

- [ ] **Step 3: run → pass; e3 tsc clean.**
- [ ] **Step 4: commit** — `git commit -m "feat(e3): festival public view is calendar-only (no standings/bracket/phase-filter)"`

---

### Task 9: Full verification

- [ ] **Step 1: full suite** — `npm test` — all green.
- [ ] **Step 2: full build** — `npm run build` — all projects build (needed for the deploy).
- [ ] **Step 3: (optional) synth sanity** — no infra changed, so skip.
- [ ] **Step 4:** ready for deploy (merge `feature/festival-format` → stage + tag `stg-festival`, pre-authorized).

## Self-Review

**Spec coverage:** §1 config → Task 2 (+7 label); §2 generation → Tasks 1,3,4,5; §3 standings off → Task 6; §4 finals off → Task 5 (no buildFinalMatches); §5 views → Tasks 7,8; §6 testing → per-task tests + Task 9. All covered.

**Placeholder scan:** the only soft spots are Task 5/8 pointing at "the existing test's deps shape" and the e3 calendar helper — these reference real code to read in-repo, not invented types. No TBD/TODO.

**Type consistency:** `rotationPairs`, `placeMatches` (+ RawMatch.phase), `buildFestivalFixtures`/`FestivalCategory`, `MatchPhase 'FESTIVAL'`, `festivalMatchesPerTeam`, `EventFormat 'festival'` are defined in Tasks 1-4 and reused verbatim in 5-8.

**Out of scope:** squadre a colori, age-category templates, referto/participation.
