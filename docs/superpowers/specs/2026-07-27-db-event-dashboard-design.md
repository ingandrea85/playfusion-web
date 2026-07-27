# Slice `db` — Event monitoring dashboard (phase-aware charts)

**Date:** 2026-07-27
**Experience:** E1 Organizer · Panoramica (event-hub)
**Status:** design approved, ready for plan

## Problem

The Panoramica already computes everything needed to answer "come sta andando l'evento?"
(`overview.ts`: phase, pendingActions, nextMatches, lastResults, groupLeaders), but shows it
as text lists/counters. There is nothing *visual* — no at-a-glance read of progress, fill, or
which pitch is behind. Request: add charts to monitor event status.

## Decisions (locked during brainstorming)

- **Phase-aware dashboard**, not a heavy analytics board. Each phase shows only its relevant
  charts. The band sits **at the top of the Panoramica** (`event-hub.html`), above the existing
  text widgets (which stay, as actionable detail).
- **No chart library** (self-hosted-only constraint) → **inline SVG + CSS bars**, Matchday palette.
- **Color language:** blue `#0b5fff` = progress/done, grey `#e6eaf0` = remaining, **green/amber
  reserved for status** (paid/unpaid, on-track/behind). Direct labels on numbers, thin marks.

### Charts per phase

- **PREP** ("siamo pronti a partire?")
  - *Iscrizioni per categoria* — horizontal capacity bars (count/max per category; full = accent).
  - *Quote d'iscrizione* — one stacked bar paid (green) vs da incassare (amber). **PB-2: omitted** (no fees).
- **LIVE** ("quanto manca?")
  - *Avanzamento partite* — donut ring, played/total + big %.
  - *Partite per giornata* — mini columns per day, played (blue) vs remaining (grey).
  - *Avanzamento per campo* — horizontal bars per field, played/total; a field flagged **"indietro"**
    (amber) when its completion % is ≥ 15 points below the overall completion %.
- **DONE** — *Riepilogo* stat tiles: partite giocate, gol totali, campione/i.

## Data — pure module `shared/mock/dashboard.ts`

Mirrors `overview.ts` (pure `(state, eventId) → data`, no DOM), so it is unit-tested and the page
only renders. Store wrappers (`getDashboard*`) added to `store.ts`.

```ts
enrollmentByCategory(state, eventId): { categoryId: string; count: number; max: number }[]
  // count = registrations of the category (any status); max = Category.maxTeams

paymentSplit(state, eventId): { paid: number; unpaid: number } | null
  // null when playbook === 'PB-2'; else over CONFIRMED registrations by paymentStatus

matchProgress(state, eventId): { played: number; total: number; pct: number }
  // played = scheduledMatches with both scores; pct = round(played/total*100), 0 when total 0

progressByDay(state, eventId): { day: string; played: number; total: number }[]      // sorted by day
progressByField(state, eventId): { field: string; played: number; total: number; behind: boolean }[]
  // behind = total>0 && (played/total)*100 <= overallPct - 15   (sorted by field name)

eventSummary(state, eventId): { matches: number; goals: number; champions: { categoryId: string; bracketLabel: string; team: string }[] }
  // matches = played group matches; goals = Σ(homeScore+awayScore) over played group matches;
  // champions via decideMatch on each 'Finale' FinalMatch
```

All derived from existing state (`scheduledMatches.field/day/homeScore/awayScore`,
`registrations`, `categories.maxTeams`, `finals`). No schema change, no new store mutations.

## Rendering — `apps/organizer/dashboard-charts.ts` (view helpers)

Pure string builders returning HTML (SVG/CSS), imported by `event-hub.ts`:

- `donut(pct, centerBig, centerSub)` — SVG ring (track + blue arc via stroke-dasharray).
- `capacityBars(rows, opts)` — labelled horizontal bars; `full`/`behind` modifier classes.
- `stackedStatusBar(paid, unpaid)` — two-segment bar + legend.
- `dayColumns(rows)` — mini stacked columns.
- `statTiles(tiles)` — figure tiles.

`event-hub.ts` composes the phase band and prepends it to the current `renderPrep/renderLive/
renderDone` output. New CSS in `ui.css` under a `/* dashboard */` block (donut, `.pf-capbar*`,
`.pf-daycol*`, `.pf-stattile*`), reusing tokens.

**Role note:** Panoramica is owner/organizer only (director has no overview tab), so no extra guard.
Charts are read-only.

## Testing (TDD, store-level; suite is 141/141 today)

`dashboard.test.ts` over seeded/derived events:
- `matchProgress` counts only fully-scored matches; pct rounding; 0/0 → pct 0.
- `progressByField` / `progressByDay` group correctly; `behind` flag trips only ≥15pts below overall.
- `paymentSplit` null for PB-2; correct paid/unpaid over CONFIRMED for PB-1.
- `enrollmentByCategory` count vs max per category.
- `eventSummary` goals sum + champion resolution on a finished demo (`evt-finals`).

Visual verification of the three phase bands via `npm run dev` (evt-1 LIVE, an evt in PREP, a DONE demo).

## Out of scope

- Historical/time-series analytics, trends, per-team stats, exports.
- Interactivity/tooltips beyond static labels (mid-fi; the dataviz hover layer is deferred).
- Any new domain entity or Blueprint decision — this is a presentation-only slice.
