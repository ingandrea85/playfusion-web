# playfusion-web

Navigable mid-fidelity mockups for PlayFusion 2.0 web experiences.

## Scope
- **E1 Organizer** (`apps/organizer/`) — Bundle Enrollment setup flow.
- **E1 Organizer** competition setup (`apps/organizer/competition.html`) — O6 structure per category (format, legs, groups, finals) with a same-for-all / per-category toggle.
- **E1 Organizer** calendar (`apps/organizer/schedule.html`) — O7: configure fields + match params, generate a plausible calendar from confirmed teams and the O6 structure, approve, publish.
- **E3 Public** (`apps/public/`) — public landing + team enrollment.
- **E3 Public** calendar (`apps/public/calendar.html`) — read-only match calendar, shown once the schedule is published.
- **Standings** — generating the calendar also creates zero-point group standings (O6 `Standing`), shown in E1 under the calendar and on the public E3 `standings.html` once published.
- **Finals** — generating also builds per-category finals brackets with placeholders (by `finalsType`, O6), scheduled on a global finals date; shown in E1 under standings and on the public E3 `bracket.html` once published. When a girone is complete, its "Nª Girone X" slots resolve to the actually-ranked team (O8b). Bracket-match results are recorded in E1 (O8b-2): winners propagate through the rounds ("Vincente …" → the actual winner) up to the champion (🏆); a demo event "Tabellone (semifinali)" shows semifinals → final → champion. Knockout draws are decided by penalty shootout (d.c.r.), and a competition can opt into a third-place match (Finale 3º/4º) between the semifinal losers.
- **Gironi editor** (`apps/organizer/gironi.html`) — explicit group composition (O6): draw, move teams between gironi (select controls), lock; fixtures/standings/finals derive from it.
- **Calendar editor** — reschedule a single match (campo/giorno/ora) from the E1 calendar (O7), allowed even after publish; public calendar reflects it, stays read-only.
- **E4 Admin** (`apps/admin/`) — Playfusion back-office: organizations (tenants) list + detail with status (suspend/reactivate) and module activation (O1). Introduces multi-tenancy (`Organization`, `event.organizationId`). Includes per-tenant subscription (plan/status/renewal, O11).
- **Live results** — record group-match scores in E1 (O8); standings recompute (points 3/1/0, tie-break) and re-rank; scores show in the calendar (E1 + public).
- **Tie-break** — the standings order is a per-event policy (default per sport, editable in create-event): points → scontri diretti/avulsa → differenza reti → reti fatte. Teams left perfectly tied are flagged "parità da definire" and their finals qualification is withheld. A tied group can be ordered manually by the organizer in E1 ("Risolvi parità"); the manual order unblocks qualification and self-invalidates if a later result changes who is tied. Five **demo events** (dashboard) show each case: scontri diretti, classifica avulsa, differenza reti, reti fatte, parità irrisolta.
- **Tabs** — calendar/standings/finals filter by category + girone.
- **Playbooks** — events are created with a playbook: **PB-1** (invite enrollment, the default: open registrations → shareable link → team enrolls in E3 → confirm) or **PB-2** (direct roster: the organizer enters teams in the E1 **Squadre** editor; no invites/link, teams are confirmed on entry). A demo event "Iscrizione diretta" shows PB-2.

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
