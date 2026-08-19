# S13 — Finals realigned to Playfusion 1 semantics + winner propagation (O8) (design)

- **Date:** 2026-08-19
- **Slice:** S13 · **Epic:** [#46](https://github.com/ingandrea85/playfusion-web/issues/46)
- **Issues:** #111 (o7 buildFinals v1) · #112 (o7 propagation + FINAL_GROUP standings) · #113 (o3 config)
  · #114 (rest-client) · #115 (e1/e3 UI) · #116 (E2E + collaudo).
- **ADR:** ADR-002/008. Extends S12 (finals as unified ScheduledMatch), S8 (gironi), S10/S11 (standings).
  Research source: the **v1 TS/GraphQL backend** `playfusion-backend/playfuse-infra` (AppSync + Lambda).
- **Branch:** `feature/s13-finals-v1` (off `stage` @ S12).

## Goal
Realign the three `FinalsType` to the **real Playfusion 1 semantics** (S12 had ported different
mockup semantics under the same names), and add **winner propagation** (which v1 left un-wired).

## Decisions locked in brainstorming (2026-08-19)
- **Realign to v1 semantics** (reworks S12's `buildFinals` + config).
- **Winner propagation on-read** (extend S12's resolver to `Vincente <slot>`), done properly — v1's
  `updateFinalsFromResults` Lambda is orphaned/unwired.
- **Third place (3º/4º) and shootout/rigori are OUT of this slice** (absent in v1 too) → follow-up.
- **No dedicated finals playbook** — `finalsType` stays competition config, orthogonal to PB-1/PB-2.

## v1 semantics (authoritative) — the three formats
- **PLACEMENT** — multi-group single-elim **bracket per finishing tier**: tier 0 = 1st-of-each-group,
  tier 1 = 2nd-of-each-group, … up to `teamsPerGroup`. `#groups` truncated to the largest power of 2
  (`effectiveGroups`); <2 groups ⇒ no finals. Round 0 crosses adjacent groups (G0×G1, G2×G3); later
  rounds pair the previous round's winners. Round labels tail of `[R64,R32,R16,QF,SF,F]`.
- **SINGLE_GROUP_CROSSOVER** — exactly **1 group**; consecutive-rank pairs (1ª-2ª, 3ª-4ª, …), each a
  single FINAL deciding two adjacent placements. Odd last team dropped.
- **SPLIT_GROUP_FINALS** — a bracket for the top `finalsTeamsToBracket` **plus** a round-robin
  **final group** (`FINAL_GROUP`) for the rest. Single group ⇒ consecutive pairs for the top-N; even
  multi-group ⇒ cross same-rank teams of paired groups. Non-bracket teams play the FINAL_GROUP.

## Model (o7 `domain.ts`)
- `MatchPhase` += `FINAL_GROUP`. `ScheduledMatch` += `slot?` (e.g. `SF1`, `F1`, `T2-SF1`, `FG1`),
  `placementFrom?`, `placementTo?` (the ranks a match decides). Keep `bracketLabel`/`round` for display.
- Placeholders (our convention, kept from S12): qualifier seed `Nª Girone X`; **winner link
  `Vincente <slot>`** (S13 resolves it). Loser links / `Perdente` are out (3º/4º = follow-up).

## S13.1 — o7 `finals.ts` rewrite (#111)
`buildFinals(groups: {label,size}[], finalsType, opts:{finalsTeamsToBracket?}) → FinalDraw[]`, where
`FinalDraw = {bracketLabel, round, order, slot, home, away, placementFrom, placementTo, phase}`
(phase FINAL or FINAL_GROUP). Implement the three v1 shapes above with a `singleElim` helper that emits
`slot`s and `Vincente <slot>` links, and `roundRobinPairs` for the FINAL_GROUP. Deterministic; pure.

## S13.2 — o7 propagation + standings (#112)
- `resolve-finals.resolvePlaceholders(matches, standings)` also resolves `Vincente <slot>` → the
  winner (higher score) of the FINISHED FINAL match with that `slot`; a drawn/unfinished match leaves
  the placeholder (idempotent; recomputed on every read). Qualifier `Nª Girone X` resolution unchanged.
- `computeStandings` **includes `FINAL_GROUP`** (its own mini-table by groupLabel) and keeps excluding
  `FINAL` (knockout). Propagation stays consistent through `listMatches` deps (S12 wiring).

## S13.3 — o3 config (#113)
- `SportEvent` += `finalsTeamsToBracket?`, `finalsEnabled?` (v1 knobs). `finalsType` kept;
  `qualifiersPerGroup` retained but **deprecated/unused** by the v1 formats. `PUT /finals-config`
  accepts the new fields; read-model exposes them.

## S13.4 — rest-client (#114)
`ScheduledMatchView` += `slot`/`placementFrom`/`placementTo` + phase `'FINAL_GROUP'`; finals-config
input/DTO += `finalsTeamsToBracket`/`finalsEnabled`.

## S13.5 — e1/e3 UI (#115)
- e1 Competizione editor: `finalsTeamsToBracket` (for SPLIT) + `finalsEnabled`; regenerate hint.
- app-shell `renderBracket`: round/placement labels derived from `placementFrom/placementTo`
  ("Finale 1º-2º"), show propagated winners; **FINAL_GROUP** rendered as a mini group (standings /
  round-robin rows). e3 public Tabellone + director reflect propagation + FINAL_GROUP.

## S13.6 — E2E + collaudo (#116)
generate v1 finals → seed from confirmed standings → finish a round → the next round's `Vincente <slot>`
resolves to the winner; SPLIT → FINAL_GROUP yields its own standings. build; deploy stg; merge; tag
`stg-s13`; push; monitor.

## Out of scope (follow-up slice)
Third-place (3º/4º) match, shootout/penalties tie-break for knockout draws, best-losers/ripescaggio,
graphical bracket tree, finals slot-conflict prevention, named finals "playbook" presets.
