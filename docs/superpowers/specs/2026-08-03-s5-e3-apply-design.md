# S5 — E3 Bundle Enrollment screens (design)

- **Date:** 2026-08-03
- **Slice:** S5 — E3 Bundle Enrollment screens
- **Issues:**
  [#34 S5.1 Public event landing](https://github.com/ingandrea85/playfusion-web/issues/34) ·
  [#35 S5.2 Coach apply form](https://github.com/ingandrea85/playfusion-web/issues/35) ·
  [#36 S5.3 Public participants view](https://github.com/ingandrea85/playfusion-web/issues/36) ·
  [#37 S5.4 Acceptance E2E on real AWS](https://github.com/ingandrea85/playfusion-web/issues/37)
- **ADR:** ADR-002 (REST + Lambda-per-BC), ADR-008 (rest-client seam), ADR-011 (monorepo/boundaries),
  S1.1 read-model strategy.
- **Branch:** `feature/s5-e3-apply` (off `stage` @ `dee8a8f`, which carries S0–S4).

## Goal

Close the **E3 (public / coach) side of Bundle Enrollment** so the loop begun in E1 (S4)
completes end-to-end: a coach opens the public event landing, applies via their emailed
magic-link, the application lands in the E1 organizer inbox, and once confirmed the team
appears in the public participants list. No new backend is needed — the S1–S3 read models
(`o3.getEvent`, `o5.getRegistrationWindow`, `o5.listRegistrations`) and the S2 `o5` apply
mutation already exist; S5 is the E3 wiring on top of the S3 `@playfusion/app-shell` +
`@playfusion/rest-client`.

### Acceptance criteria (from the issues)
- **S5.1** the public landing renders event details and shows an apply CTA when the window is Open.
- **S5.2** the coach apply form calls `o5.applyRegistration` with the O2 magic-link token; a valid
  apply appears in the E1 inbox.
- **S5.3** the public participants view shows confirmed participants only.
- **S5.4** the whole loop (create → open → apply → inbox → confirm + fee → public participant)
  works end-to-end against the deployed `stg` environment on real AWS.

## Approach

The E3 shell from S3.3 already ships `renderLanding` and `renderParticipants` plus magic-link
capture/auth. S5 is three focused edits and one E2E:

- **S5.1 (`views/landing.ts`)** — add a window-gated apply CTA. When `window.state === 'Open'`
  the hero shows an "Iscrivi la tua squadra →" button linking to `#/events/:id/apply`; a Closed
  window renders no `/apply` link so coaches can't reach a form the backend would reject.
- **S5.2 (`views/apply.ts`, new + `main.ts` route)** — a coach apply form: a team-name field and a
  category `<select>` restricted to `openCategories` (event categories whose window capacity still
  has room; a category with no cap entry is treated as open). Submit builds `ApplyRegistrationInput`
  via `buildApplyInput` and calls `o5.applyRegistration`; the magic-link auth provider attaches the
  Bearer token. The form only renders when a token is stored — otherwise a "open your emailed link"
  notice. On success the view swaps to a confirmation; the applied team is now Applied in the E1 inbox.
- **S5.3 (`views/participants.ts`)** — guard the public list to `status === 'Confirmed'` client-side.
  The API already filters by state, but the guard prevents a mixed-state response from leaking
  Applied/Rejected rows.
- **S5.4 (`test/e2e/s5-bundle-enrollment.e2e.test.ts`)** — a skip-gated (`API_BASE_URL`) full-loop
  acceptance test exercising the exact REST endpoints the SPAs call, from create through public
  confirmed participant, including the o12 fee projection + pay.

Pure render/logic (`openCategories`, `buildApplyInput`, `renderLanding`, `renderParticipants`) is
unit-tested; the small amount of DOM/submit wiring lives in `main.ts`.

## Notes

- The S5.4 collaudo requires the `stg` backend to carry S4's `o12` fee-read (the `event-index` GSI +
  `GET /o12/events/:id/fees`); if `stg` predates S4 it must be redeployed (`cdk deploy --all
  -c env=stg`) before the fee step of the loop passes.
