# S10 — Standings live (O8) (design)

- **Date:** 2026-08-19
- **Slice:** S10 — Standings live (O8) · **Epic:** [#43](https://github.com/ingandrea85/playfusion-web/issues/43)
- **Issues:** [#75 backend](https://github.com/ingandrea85/playfusion-web/issues/75) ·
  [#76 rest-client](https://github.com/ingandrea85/playfusion-web/issues/76) ·
  [#77 e1-web](https://github.com/ingandrea85/playfusion-web/issues/77) ·
  [#78 e3-web](https://github.com/ingandrea85/playfusion-web/issues/78) ·
  [#79 E2E + collaudo](https://github.com/ingandrea85/playfusion-web/issues/79)
- **ADR:** ADR-002, ADR-008. Extends S7/S8/S9 (o7). Reference mockup:
  `docs/superpowers/specs/2026-07-17-o8-results-standings-design.md`.
- **Decision:** O8 results + standings live on **o7** (scores are match data; no new BC — user-confirmed, per S6/S8 precedent).
- **Branch:** `feature/s10-standings` (off `stage` @ S22).

## Goal
Enter group-match results in E1 → live-recomputed standings (points 3/1/0, ordered), visible to
organizer and public. Configurable tie-break is **S11**; S10 uses the basic order
points → goal-difference → goals-for → name.

## Design by sub-issue
### S10.1 — o7 backend
- `domain.ts`: `ScheduledMatch` += `homeScore?: number | null`, `awayScore?: number | null`
  (null = not played). `StandingRow { team, played, won, drawn, lost, goalsFor, goalsAgainst, goalDiff, points }`, `GroupStanding { categoryId, groupLabel, rows }`.
- `standings.ts` (pure): `computeStandings(matches): GroupStanding[]` — one row per team seen in a
  group (played or not), aggregate played matches (both scores non-null), 3/1/0; sort points →
  goalDiff → goalsFor → team asc. Deterministic.
- `application/record-result.ts`: find match (404), set scores, `matches.replace`.
- `application/read.ts`: `listStandings` = computeStandings(matches.list).
- `handler.ts`: `POST /events/:id/matches/:matchId/result` (organizer, body `{homeScore, awayScore}` int ≥0), `GET /events/:id/standings` (public).

### S10.2 — rest-client
- `o7.recordResult(id, matchId, {homeScore, awayScore})`, `o7.getStandings(id)`; `ScheduledMatchView` += optional scores; `StandingRow`/`GroupStanding` DTOs.

### S10.3 — e1-web
- `renderCalendar` (app-shell): show `home S–S away` when played; a **Risultato** button when editable.
- `renderStandings` (app-shell): shared standings table (Pos, squadra, PG, V, N, P, GF, GS, DR, Pti).
- schedule view: a Risultato panel (score inputs) reusing `#editmatch` → `o7.recordResult` → refresh.
- **Classifiche** workspace tab (`views/standings.ts`) rendering `o7.getStandings`.

### S10.4 — e3-web
- Public calendar shows scores (renderCalendar editable=false already renders them).
- Public **Classifiche** view (`views/standings.ts`) + landing link.

### S10.5 — E2E + collaudo
- Record results → `GET standings` reflects points/order; correcting a result recomputes. cdk deploy stg; merge/tag `stg-s10`/push.

## Out of scope
Configurable tie-break (S11); finals advancement (S12); live minute-by-minute; cards/discipline; E2 mobile referee.
