# S11 — Tie-break policy + manual resolution (O8) (design)

- **Date:** 2026-08-19
- **Slice:** S11 — Tie-break policy + manual resolution · **Epic:** [#44](https://github.com/ingandrea85/playfusion-web/issues/44)
- **Issues:** [#101 backend](https://github.com/ingandrea85/playfusion-web/issues/101) ·
  [#102 rest-client](https://github.com/ingandrea85/playfusion-web/issues/102) ·
  [#103 e1-web](https://github.com/ingandrea85/playfusion-web/issues/103) ·
  [#104 E2E + collaudo](https://github.com/ingandrea85/playfusion-web/issues/104)
- **ADR:** ADR-002, ADR-008. Extends S6 (tieBreak config on o3) and S10 (standings engine on o7).
  Ports the mockup-era, brainstorm-approved designs
  `docs/superpowers/specs/2026-07-17-tiebreak-policy-slice1-design.md` and
  `…-slice2-design.md` into the real services.
- **Decision:** tie-break + manual resolution live on **o7** (standings are match data; no new BC —
  same call as S8/S10). Policy source is the o3 event's `tieBreak` (S6), read over HTTP (ADR-002).
- **Branch:** `feature/s11-tiebreak` (off `stage` @ S26).

## Goal
Group standings respect a **configurable tie-break policy** (per event, defaulted per sport), with
full deterministic ranking (head-to-head / classifica avulsa → goal-difference → goals-for). A
residual perfect tie is **flagged as unresolved**; the organizer resolves it with a tracked,
**auditable manual override** (who + when) that unlocks the ranking. Public (E3) stays read-only
and simply shows the ordered table the backend returns.

## Decisions locked in brainstorming (2026-08-19)
- **Audit model:** actor + timestamp on the record. Each `TieOverride` stores `resolvedBy`
  (organizer subject from the auth context) + `resolvedAt` (ISO). Latest state only, overwritten
  on re-resolve; surfaced on the standings read. Satisfies "registrato e auditabile" (#44).
- **Frontend scope:** **e1 only**. E3 public standings render whatever order the backend returns
  (they get correct policy ranking for free) but gain no tie badges / resolution UI this slice.

## Design by sub-issue

### S11.1 — o7 backend (#101)
- **`domain.ts`**
  - `TieBreakCriterion = 'HEAD_TO_HEAD' | 'GOAL_DIFFERENCE' | 'GOALS_FOR'` — defined locally
    (ADR-002 forbids importing o3's type). Points is always the implicit primary criterion, never
    in the list.
  - `TieOverride { sportEventId, categoryId, groupLabel, order: string[], resolvedBy: string, resolvedAt: string }`.
  - `GroupStanding` += `unresolved: string[][]` (groups still perfectly tied after the policy) and
    optional `override?: { order: string[]; resolvedBy: string; resolvedAt: string }` (audit of an
    applied override for that group).
- **`ranking.ts`** (new, pure) — ports `mockups/shared/mock/ranking.ts`:
  - `rankStanding(rows, groupMatches, policy, overrides?) → { rows, unresolved }`. Bucket by points
    desc; each tied bucket (≥2) resolves by applying the policy criteria in order, recursing on
    still-tied sub-buckets with the next criterion; when the policy is exhausted and a set is still
    tied, an override that covers **exactly** that set (same teams, no dups) orders it (and it is
    **not** unresolved), else it is name-sorted and pushed to `unresolved`. `rows` is always a total,
    stable order so the UI always renders.
  - Criteria: `HEAD_TO_HEAD` = mini-league over matches whose home AND away are both in the set
    (pts → GD → GF within the set); `GOAL_DIFFERENCE` = overall GD; `GOALS_FOR` = overall GF.
  - `defaultTieBreak(sport)` ported from `mockups/shared/mock/tiebreak.ts`
    (`Calcio → [H2H, GD, GF]`, generic `[GD, GF]`).
- **`ports.ts`**
  - `EventView` += `sport?: string`, `tieBreak?: TieBreakCriterion[]`.
  - `TieOverrideRepository { list(sportEventId): Promise<TieOverride[]>; upsert(o: TieOverride): Promise<void> }`.
- **adapters**
  - `dynamodb-tie-override-repository.ts` — one item per event holding the override array (mirrors
    `dynamodb-match-repository.ts`; upsert reads-modifies-writes the list keyed by cat+group).
  - `HttpEventSource.get` now also maps `sport` + `tieBreak` from the o3 event payload.
- **application**
  - `read.ts listStandings({ matches, overrides, events })(sportEventId)`: compute base rows per
    group (existing `computeStandings`), resolve policy = event `tieBreak` ?? `defaultTieBreak(sport)`,
    and per group apply `rankStanding` with that group's overrides → ranked rows + `unresolved` +
    embedded `override` audit.
  - `resolve-tie.ts setTieOverride({ overrides })({ sportEventId, categoryId, groupLabel, order, resolvedBy })`:
    validate `order` non-empty and unique (400 otherwise), upsert with `resolvedAt = new Date().toISOString()`,
    return the stored `TieOverride`. Self-invalidation is inherent — an override only *applies* when
    it exactly matches a still-tied set.
- **`handler.ts`**
  - `GET /events/:id/standings` (public) wires the new deps.
  - `PUT /events/:id/standings/:categoryId/:groupLabel/override` (organizer) body `{ order: string[] }`;
    `resolvedBy = getIdentity(c)?.subject ?? 'organizer'`. `categoryId`/`groupLabel` are URL-decoded
    path params (they contain spaces, e.g. `Girone A`).
- **Tests:** ranking per criterion (H2H 2 & 3+ teams, GD, GF), residual `unresolved`, override applied
  vs auto-invalidating on a changed set, `setTieOverride` validation + audit fields.

### S11.2 — rest-client (#102)
- `types.ts`: `GroupStanding` DTO += optional `unresolved?: string[][]` and
  `override?: { order: string[]; resolvedBy: string; resolvedAt: string }` (back-compatible — S10
  consumers ignore them).
- `o7.setTieOverride(sportEventId, categoryId, groupLabel, order: string[])` → PUT (URL-encoding the
  path segments); `getStandings` return type extended.
- Tests: path encoding, DTO passthrough.

### S11.3 — e1-web (#103, organizer only)
- `views/standings.ts`: rows in an `unresolved` group get a "parità da definire" badge; each such
  group gets a **Risolvi parità** panel (↑/↓ reorder, mobile-friendly, no drag&drop) →
  `o7.setTieOverride` → refresh. When a group carries an `override`, show an audit line
  ("Risolto da _resolvedBy_ il _resolvedAt_"). Panel reopenable to correct.
- Tests: badge appears only on `unresolved`; save calls the client with the chosen order; audit line
  renders when `override` present.

### S11.4 — E2E + collaudo (#104)
- E2E on stg: enter results producing a genuine tie → `GET standings` has `unresolved` non-empty;
  `setTieOverride` → rows ordered accordingly, `unresolved` empty, `override` audit present;
  correcting a result that changes the tied set → override no longer matches → tie reappears.
- `npm run build`; cdk deploy stg; merge `feature/s11-tiebreak` → `stage`; tag `stg-s11`; push;
  monitor `deploy-stage`. (Merge/tag/push require explicit per-epic authorization.)

## Out of scope
Finals qualification wiring (S12); E3 tie badges / resolution UI; explicit override deletion
(self-invalidation covers it); fair-play / auto-draw / third-place / best-losers.
