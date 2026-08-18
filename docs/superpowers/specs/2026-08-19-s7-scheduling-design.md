# S7 — Scheduling + public calendar (O7) (design)

- **Date:** 2026-08-19
- **Slice:** S7 — Scheduling + public calendar (O7)
- **Epic:** [#40 S7 — Scheduling + public calendar [O7]](https://github.com/ingandrea85/playfusion-web/issues/40)
- **Issues:**
  [#59 S7.1 Backend o7-scheduling BC](https://github.com/ingandrea85/playfusion-web/issues/59) ·
  [#60 S7.2 rest-client seam](https://github.com/ingandrea85/playfusion-web/issues/60) ·
  [#61 S7.3 e1-web schedule view](https://github.com/ingandrea85/playfusion-web/issues/61) ·
  [#62 S7.4 e3-web public calendar](https://github.com/ingandrea85/playfusion-web/issues/62) ·
  [#63 S7.5 E2E + collaudo](https://github.com/ingandrea85/playfusion-web/issues/63)
- **ADR:** ADR-002 (REST + Lambda-per-BC, no cross-BC code imports), ADR-008 (rest-client seam),
  ADR-011 (monorepo/boundaries), S1.1 read-model strategy (per-BC direct query).
- **Reference (NOT the build target):** the mockup O7 design/plan
  (`docs/superpowers/specs/2026-07-16-o7-scheduling-design.md`) — domain algorithm + UX only.
- **Branch:** `feature/s7-scheduling` (off `stage` @ `3ef92e1`+S6, local).

## Goal

Generate and publish the group-stage match calendar. O7 is a **new bounded context** (no BC
existed for it): an organizer configures fields + match params, generates a plausible calendar
from the confirmed teams and the event's categories, reviews it, approves and publishes it. Once
published, a read-only public calendar appears for E3.

### Acceptance criteria (from the epic)
- Calendar generated from the groups, visible to organizer **and** public.
- Unit + E2E green; collaudo on real AWS stg.

## Key decisions (forced by current backend state)

1. **New BC `o7-scheduling`**, mounted at `/o7`, one mono-Lambda (ADR-002), modelled on o3 +
   o5 (hexagonal: domain + ports + adapters + application + handler).
2. **Team labels = `participantRef`.** No team-name field exists yet (o4 is a thin stub, o5
   carries `participantRef`). The calendar renders the ref as the team label; a real display
   name arrives with S14. o7 renders whatever label it is given.
3. **Groups come from `ScheduleConfig`** (`groupsCount` default 1, `legs` default `SINGLE`),
   applied uniformly to every category — because the per-category O6 gironi model is **S8**
   (after S7). When S8 lands, the generate step reads per-category groups instead; the
   `buildFixtures` signature already takes a per-category `FixtureCategory`, so S8 is additive.
4. **Cross-BC reads over HTTP, behind ports.** o7 reads the o3 event (dates/categorie) and o5
   confirmed registrations via the public API Gateway URL (same pattern as the O2 verify call),
   injected as `PF_API_BASE_URL`. Ports (`EventSource`, `TeamSource`) keep the domain testable
   with in-memory fakes; HTTP adapters wire the real calls in the handler.

## Model

```
ScheduleStatus = 'NONE' | 'GENERATED' | 'APPROVED' | 'PUBLISHED'

ScheduleConfig {
  fields: string[]; periods: number; periodMinutes: number; breakMinutes: number;
  dailyStart: string /* HH:mm */; slotsPerDay: number;
  groupsCount: number /* default 1 */; legs: 'SINGLE' | 'HOME_AWAY' /* default SINGLE */;
}
Schedule { sportEventId; organizationId; status: ScheduleStatus; config: ScheduleConfig }
ScheduledMatch { id; sportEventId; categoryId /* = categoria */; groupLabel; day; time; field; home; away }
```

Status machine: `NONE→GENERATED` (generate), `GENERATED→GENERATED` (regenerate allowed),
`GENERATED→APPROVED` (approve), `APPROVED→PUBLISHED` (publish). Generate is a **no-op** once
`APPROVED`/`PUBLISHED` (config locks). `buildFixtures` is pure/deterministic (no `Math.random`,
ids `sm-${n}`, field→slot→day placement, no conflict avoidance — "plausible", not a solver).

## Design by sub-issue

### S7.1 — Backend `o7-scheduling` BC
- `src/domain.ts` — types + status helpers (`canGenerate`, `nextOnApprove`, `nextOnPublish`) +
  `defaultConfig()`.
- `src/fixtures.ts` — pure `buildFixtures(eventId, startDate, endDate, config, cats)` (TDD).
- `src/ports.ts` — `ScheduleRepository`, `MatchRepository`, `EventSource`, `TeamSource`.
- `src/application/{generate,approve,publish,read}.ts` — thin services over the ports.
- `src/adapters/{dynamodb-schedule-repository,dynamodb-match-repository,http-sources}.ts`.
- `src/handler.ts` — Hono app, organizer-gated mutations, public reads; `/o7/{proxy+}` routing.
- Persistence: `o7-schedules` (PK `sportEventId`), `o7-matches` (PK `sportEventId`, one item
  holding the match array → regenerate = single Put, list = single Get, no GSI / batch delete).
- Infra: `data-stack.ts` (2 tables), `api-stack.ts` (BCS entry + `PF_API_BASE_URL` env),
  `scripts/provision.ts` (LocalStack mirror).

### S7.2 — rest-client seam
- `libs/rest-client/src/o7.ts` + DTOs in `types.ts` + `client.ts`/`index.ts` wiring.
- Paths: `GET /o7/events/:id/schedule`, `GET /o7/events/:id/matches`,
  `POST /o7/events/:id/schedule:generate|:approve|:publish`.

### S7.3 — e1-web organizer schedule view
- `apps/e1-web/src/views/schedule.ts` — config form + status actions + calendar; stateful
  `mount` calls the o7 seam then `ctx.refresh()`.
- `apps/e1-web/src/views/workspace.ts` — add a **Calendario** tab.
- `apps/e1-web/src/main.ts` — route `#/events/:id/schedule`.
- Shared `renderCalendar(matches, catName)` in `libs/app-shell/src/chrome.ts` + calendar CSS in
  `chrome.css` (reused by E3).

### S7.4 — e3-web public calendar view
- `apps/e3-web/src/views/calendar.ts` — read-only, gated on `PUBLISHED`.
- `apps/e3-web/src/main.ts` — route `#/events/:id/calendar`.
- `apps/e3-web/src/views/landing.ts` — a Calendario link when published.

### S7.5 — E2E + collaudo
- `test/e2e/s7-scheduling.e2e.test.ts` (skip-gated on `API_BASE_URL`): create event → confirm
  teams → generate → approve → publish → assert `GET matches`/`GET schedule` round-trip and the
  PUBLISHED gate. `cdk deploy` stg, run E2E green. Merge to stage, tag `stg-s7`, push, monitor.

## Out of scope (YAGNI)
- Per-category gironi (S8), constraint solver / rest minimums, drag-and-drop reschedule (S9),
  live results / standings (S10+), publish notifications, PDF/CSV export.

## Testing
- Unit: `npm test` (auto-globs `services/o7-scheduling/test/**` + app/lib tests).
- Build: `nx run-many -t build`; `cdk synth`. E2E: skip-gated, run against stg in S7.5.

## Git / deploy scope
- Commit per sub-issue on `feature/s7-scheduling`; close each issue on completion. Merge to
  `stage`, tag `stg-s7`, push branch+tag, `cdk deploy` stg collaudo — authorized up front.
