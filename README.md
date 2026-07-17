# playfusion-web

Navigable mid-fidelity mockups for PlayFusion 2.0 web experiences.

## Scope
- **E1 Organizer** (`apps/organizer/`) — Bundle Enrollment setup flow.
- **E1 Organizer** competition setup (`apps/organizer/competition.html`) — O6 structure per category (format, legs, groups, finals) with a same-for-all / per-category toggle.
- **E1 Organizer** calendar (`apps/organizer/schedule.html`) — O7: configure fields + match params, generate a plausible calendar from confirmed teams and the O6 structure, approve, publish.
- **E3 Public** (`apps/public/`) — public landing + team enrollment.
- **E3 Public** calendar (`apps/public/calendar.html`) — read-only match calendar, shown once the schedule is published.
- **Standings** — generating the calendar also creates zero-point group standings (O6 `Standing`), shown in E1 under the calendar and on the public E3 `standings.html` once published.
- **Finals** — generating also builds per-category finals brackets with placeholders (by `finalsType`, O6), scheduled on a global finals date; shown in E1 under standings and on the public E3 `bracket.html` once published.
- **Gironi editor** (`apps/organizer/gironi.html`) — explicit group composition (O6): draw, move teams between gironi (select controls), lock; fixtures/standings/finals derive from it.
- **Tabs** — calendar/standings/finals filter by category + girone.

State is fake: seed data + `localStorage` (`shared/mock/`). No backend, no framework.

## Run
```bash
npm install
npm run dev     # open the printed URL → start at the hub (index.html)
npm test        # store unit tests
npm run build   # production build of all screens
```

## The demo loop
Organizer opens registrations and shares a link → a coach enrolls via that link (E3) →
the enrollment shows up in the Organizer inbox (E1) → confirm + mark the fee paid →
the confirmed team appears on the public participants page. "Reset demo" (hub) restores seed state.

## Not included
E2 Referee (separate mobile repo), E4 Admin, real backend wiring, Auth0, deploy,
live Operations (real results/points, O8), finals brackets with placeholders (next slice).
