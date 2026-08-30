# Sport Profiles + Event Format — design

**Date:** 2026-08-30
**Status:** approved (design, via iterative mockup), pending implementation plan
**Scope:** generalise PlayFusion beyond team-football — support **individual** competitors (tennis,
chess…), make **scoring/tie-breaks sport-agnostic** via an admin-managed **sport catalog**, and make
the **event format** (groups / bracket) an organizer choice independent of the sport.
**Mockup:** approved (E4 sport catalog + editor · E1 create-event sport/participant/format · standings/bracket per format).
**Supersedes:** the football-hardcoded scoring/tie-breaks; the platform-admin-only assumptions.

## Motivation

Today the domain is wired to team-football: competitors are "squadre", results are `homeScore/awayScore`
counted as **goals**, standings award **3/1/0** and rank by **goal difference / goals-for**, tie-break
criteria are `HEAD_TO_HEAD | GOAL_DIFFERENCE | GOALS_FOR`, and every event is **gironi (+ finals)**.
We want to run e.g. a **tennis** tournament (individual, "set" scoring, direct bracket, no standings)
and a **basket** league (team, "points", no draws) from the same platform.

## The three orthogonal axes

1. **Sport** — a competition *identity* (label + scoring + tie-breaks + which participant kinds it allows).
   Defined once in a **global catalog** by the platform admin.
2. **Participant type** — team vs individual. Fixed by the sport, or **chosen at the event** when the
   sport allows both (tennis singolo/doppio).
3. **Format** — the *structure*: **solo gironi** · **gironi + tabellone** · **solo tabellone**. An
   **event** choice, independent of the sport (a football event may be solo-tabellone).

## Non-goals (this epic)

- **Time/placement sports** (athletics, swimming, time-trial): no head-to-head matches → a different
  ranking engine. Out.
- **Set-by-set scoring** (6-4, 3-6…): the result stays a single score pair (for tennis = **sets won**,
  e.g. 2–1). Detailed set/game entry is deferred.

## Model

### SportProfile — global catalog (admin)

```
SportProfile {
  id: string
  name: string                         // "Tennis", "Calcio", "Basket", "Scacchi"
  participants: 'team' | 'individual' | 'both'   // which kinds the sport allows
  scoreLabel: string                   // "Reti" | "Set" | "Punti" | "Canestri"
  points: { win: number; draw: number | null; loss: number }   // draw null = no draws
  tieBreak: TieBreakCriterion[]        // ordered; generic (see below); used only in gironi formats
}
```

Tie-break criteria become **generic** (drop the football names): `HEAD_TO_HEAD`, `SCORE_DIFFERENCE`
(score-for − score-against), `SCORE_FOR`, `WINS`, `SCORE_AGAINST` (asc). Points are always the primary
sort; the list refines ties. (The old `GOAL_DIFFERENCE`/`GOALS_FOR` map 1:1 to `SCORE_DIFFERENCE`/`SCORE_FOR`.)

### Event — organizer choices at creation

```
Event {
  …existing…
  sport: EventSportSnapshot            // snapshot of the chosen SportProfile (read-only)
  participantType: 'team' | 'individual'   // = sport's kind, or the org's choice when sport.participants === 'both'
  format: 'groups' | 'groups+bracket' | 'bracket'   // structure
}
EventSportSnapshot { sportId; name; scoreLabel; points; tieBreak }   // frozen at creation
```

**Snapshot rationale:** the event freezes the sport profile at creation, so the standings/bracket engine
(o7) and the FE read it from the event — no cross-BC coupling to the live catalog, and editing a catalog
sport never silently changes running events.

### Per-category config — UNCHANGED

The existing **per-category** configuration stays exactly as today, layered under the event format:
- **Schedule/calendar** (`ScheduleConfig.byCategory`): fields, periods, minutes, legs, dailyStart, …
- **Finals** (per category): `finalsType`, `finalsFormatId`, `finalsTeamsToBracket`, `finalsEnabled`.

The event `format` only decides the *shape*:
- `groups` → gironi + final standings, **no bracket** (finals disabled).
- `groups+bracket` → gironi + standings + per-category finals (as today).
- `bracket` → **no gironi, no standings**; a per-category bracket seeded from the **participants**
  directly; the per-category finals config still governs the bracket shape/format.

## Engine (o7)

- **Standings** are parameterised by the event's `sport.points` + `sport.tieBreak` + `sport.scoreLabel`
  (generic score, no more hardcoded `goalsFor`/`+3`/`+1`). Computed only for `groups`/`groups+bracket`.
- **Bracket seeding** — the finals-format compiler already brackets from `Seed k`; only the *source* of
  the seed ranking changes:
  - `groups+bracket` → seeds = cross-group standings ranking (as today).
  - `bracket` → seeds = the confirmed **participants** ordered by seed/registration (no gironi).
- `bracket` events skip gironi generation and standings entirely.

## Storage & API

- **O3** gains a **global sport catalog** (new table `o3-sports`, PK `sportId`):
  - `GET  /sports` — public read (create-event selector; anyone authenticated).
  - `POST/PUT/DELETE /admin/sports[/:id]` — **platform_admin** (managed in E4, like S21).
- **O3 event** stores `sport` (snapshot), `participantType`, `format`; `createEvent` resolves the chosen
  sport from the catalog and snapshots it. `GET /events/:id` returns them (already used by o7/E1/E3).
- No change to the per-category schedule/finals endpoints.

## Frontend

- **E4 admin**: a new **"Sport"** section — catalog list + profile editor (name, participants,
  scoreLabel, points policy, tie-break order). platform_admin.
- **E1 create-event**: replace the free-text *sport* + football tie-break checkboxes with a **sport
  selector** (from the catalog); when `sport.participants === 'both'` show a **participant-type** choice;
  add a **format** choice. Show the inherited profile read-only. Per-category schedule/finals config
  unchanged.
- **E1 workspace / E3 public**: dynamic labels from the snapshot — "Squadre"↔"Giocatori",
  "Reti"↔the sport's `scoreLabel`. For `bracket` events: hide the **Gironi** and **Classifiche** tabs;
  the bracket is the primary view. Individual events: no roster (PB-1/PB-2 roster is team-only), team
  size 1 for resources.

## Back-compat / migration

Existing events have no `sport`/`format`. Default resolution (no data migration needed): a missing
`sport` → an implicit **Calcio** profile (participants `team`, scoreLabel "Reti", points 3/1/0, tie-break
= the event's existing `tieBreak`); a missing `format` → **`groups+bracket`**. So every current event
behaves exactly as today. Seed the catalog with **Calcio, Basket, Tennis** presets on first deploy.

## Implementation slices

1. **Sport catalog + admin (E4)** — `o3-sports` table + admin CRUD (platform_admin) + public GET;
   rest-client + E4 "Sport" section (list + editor); seed presets. (No behaviour change yet.)
2. **Event: sport snapshot + participantType + format** — create-event selector(s); event stores the
   three fields; defaults for legacy events; inherited read-only display.
3. **Parametric standings** — o7 standings/ranking driven by `points` + generic `tieBreak` + `scoreLabel`
   (rename goals→score generically; keep the football result shape). Back-compat via the Calcio default.
4. **Format `bracket` (solo tabellone)** — hide gironi/standings; seed the bracket from participants;
   per-category finals config still applies.
5. **Participant type `individual`** — dynamic labels (Squadre↔Giocatori) across E1/E3, no roster for
   individuals, team-size 1.

Each slice ships independently; 1–3 are additive/back-compatible; 4–5 unlock the new sport shapes.

## Testing

- SportProfile catalog CRUD + platform_admin gating; public read.
- Standings: points policy (with/without draws), generic tie-break order, score labels — table sorts
  correctly per sport; Calcio default reproduces today's output.
- Bracket seeding from participants (bracket format) vs from standings (groups+bracket).
- create-event: participant-type shown only when sport allows both; format persisted; legacy defaults.
- FE labels swap by snapshot; gironi/standings hidden for bracket; roster hidden for individual.
