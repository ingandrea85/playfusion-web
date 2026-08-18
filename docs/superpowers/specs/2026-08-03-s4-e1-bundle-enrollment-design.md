# S4 — E1 Bundle Enrollment screens (design)

- **Date:** 2026-08-03
- **Slice:** S4 — E1 Bundle Enrollment screens
- **Issues:**
  [#27 S4.1 Dashboard](https://github.com/ingandrea85/playfusion-web/issues/27) ·
  [#28 S4.2 Create event](https://github.com/ingandrea85/playfusion-web/issues/28) ·
  [#29 S4.3 Open registrations](https://github.com/ingandrea85/playfusion-web/issues/29) ·
  [#30 S4.4 Shareable link](https://github.com/ingandrea85/playfusion-web/issues/30) ·
  [#31 S4.5 Inbox confirm/reject](https://github.com/ingandrea85/playfusion-web/issues/31) ·
  [#32 S4.6 Mark fee paid](https://github.com/ingandrea85/playfusion-web/issues/32) ·
  [#33 S4.7 Participants view](https://github.com/ingandrea85/playfusion-web/issues/33)
- **ADR:** ADR-002 (REST + Lambda-per-BC), ADR-008 (rest-client seam), ADR-011 (monorepo/boundaries),
  S1.1 read-model strategy (per-BC direct query + GSI, denormalize on write).
- **Branch:** `feature/s4-e1-bundle-enrollment` (off `stage` @ `25c6c64`, which now carries S0–S3).

## Goal

Make the **E1 (organizer) Bundle Enrollment flow real end-to-end**: create an event, open a
registration window with per-category caps, share the coach link, triage the pending inbox
(confirm/reject), see confirmed participants, and mark participation fees paid. All seven
screens consume the S3 `@playfusion/rest-client` and render on the S3 `@playfusion/app-shell`
chrome. One small backend read is added so fee status is real and durable.

### Acceptance criteria (from the issues)
- **S4.1** dashboard shows real events for the logged-in organizer.
- **S4.2** submitting the create-event form creates a real event visible on the dashboard.
- **S4.3** a registration window opens with a per-category cap enforced.
- **S4.4** the generated link opens the E3 flow for the right event.
- **S4.5** confirm moves a registration to confirmed; reject removes it from pending.
- **S4.6** fee status updates and `ParticipationFeePaid` is emitted.
- **S4.7** confirmed participants are listed with fee status.

> **Deploy scope:** implement + verify **locally** (unit tests, `nx build`, local dev-server
> smoke). No `git push`, no `cdk deploy` — separately authorized, same as S3.

## Context — what already exists

- **S3 FE foundation** on `stage`: `@playfusion/rest-client` (`o3.listEvents/getEvent/createEvent`,
  `o5.listRegistrations(id,state?)/getRegistrationWindow/applyRegistration/confirmRegistration/rejectRegistration/openRegistrationWindow`,
  `o12.payFee`), `@playfusion/app-shell` (`renderOrganizerTopbar`, `renderOrganizerWorkspace`,
  `renderPublicTopbar`, `renderCategoryTag`, `HashRouter`, `esc`), `apps/e1-web` (Auth0 gate →
  bearer into the client; routes `#/` dashboard + `#/events/:id` workspace with placeholder tabs).
- **Backend REST** (each BC at `/o{n}/{proxy+}`, stage `prod`): O3 events, O5 registrations +
  window (with `capacities`, D-O5-1), O12 `POST /payments/:id/pay`.
- **Fee model (the gap this slice closes):** `o12 POST /payments/:id/pay` sets `o12-fees.status='Paid'`
  and emits `ParticipationFeePaid`; the O5 consumer `onFeePaid` **auto-confirms** an *Applied*
  registration on that event. `o12-fees` is keyed by `registrationId` only, written by the O12
  consumer on `RegistrationApplied` as `{registrationId, status:'Requested'}`. **No read path
  exposes fee status.** The `RegistrationApplied` payload includes `sportEventId`.
- **app-shell `chrome.css`** ported topbar/hero/tabs/cards/buttons/category; it does **not** yet
  include form/input primitives (`.pf-field`, `.pf-switch` exist in `mockups/shared/ui.css`).
- **Boundaries (ADR-011):** apps depend only on `scope:lib`; backend reached only via rest-client.

## Design

### 1. Backend — minimal o12 fee-status read

Follows S1.1 (denormalize on write, GSI per access pattern, BC queries its own store).

- **`services/o12-payments/src/consumer.ts`** — on `RegistrationApplied`, store `sportEventId`
  from the event payload: item becomes `{ registrationId, sportEventId, status: 'Requested' }`.
  (The `payFee` handler's `UpdateCommand` only sets `status`/`paymentRef`, so `sportEventId`
  written at create time is preserved.)
- **`infra/cdk/lib/data-stack.ts`** + **`scripts/provision.ts`** — add GSI `event-index`
  (partition key `sportEventId`) to `o12-fees`.
- **`services/o12-payments/src/read-model.ts`** (new) + **`GET /o12/events/:id/fees`** in the
  handler → `FeeView[] = [{ registrationId: string; status: 'Requested' | 'Paid' }]`, querying
  `event-index`. Public projection (drops `sportEventId`/`paymentRef`). A `FeeReadStore` port +
  DynamoDB adapter + in-memory fake, mirroring the O3/O5 S1 read-side structure.
- **`libs/rest-client`** — `o12.listFees(eventId): Promise<FeeView[]>` (`GET /o12/events/:id/fees`)
  + `FeeView`/`FeeStatus` types. `payFee` unchanged.
- Migration note: `o12-fees` rows written before this change lack `sportEventId` and won't appear
  in the GSI — acceptable on a fresh collaudo; documented in the runbook/report.

### 2. FE interaction pattern — the view-controller

S3 views were pure string builders. S4 screens are interactive, so each screen module exports:
- `render(data): string` — pure, deterministic → unit-tested.
- `mount(root: HTMLElement, ctx: ViewCtx): void` — attaches listeners (event delegation on
  `root`), calls the rest-client, and on success calls `ctx.refresh()`.

```ts
interface ViewCtx {
  client: Client            // @playfusion/rest-client
  navigate: (hash: string) => void   // wraps location.hash
  refresh: () => void        // re-run the current route's fetch+render+mount
  orgId: string
  apiOrigin: string          // for building the E3 share URL base
}
```

`apps/e1-web/src/main.ts` route handlers become: `const data = await load(); root.innerHTML =
render(data); mount(root, ctx)`. Load failures render the existing `errorCard`; action failures
render an inline `.pf-card` error/toast without losing the screen. `render` stays free of
`window`/DOM APIs so it unit-tests in node; `mount` holds all DOM/side-effect code.

### 3. app-shell additions
- Port `.pf-field` (label + input/select/textarea + focus states) and `.pf-switch` from
  `mockups/shared/ui.css` into `libs/app-shell/src/chrome.css`, applying the S3 token map
  (`--space-3`→`12px`, `--radius-2`→`8px`, colors → PS-B names). Shared; S5's E3 apply reuses them.
- `copyToClipboard(text): Promise<void>` helper in app-shell (wraps `navigator.clipboard`).

### 4. Screens & routes

Workspace tabs become **Panoramica · Iscrizioni · Partecipanti** (update
`apps/e1-web/src/views/workspace.ts` `tabs()`; the router adds the new routes).

- **`#/` — S4.1 Dashboard.** Complete the S3 dashboard: events for the logged-in org
  (`o3.listEvents()`, already org-scoped via `x-organization-id` from the Auth0 identity), a
  "＋ Crea evento" CTA → `#/events/new`, and the empty-state. Mostly built in S3 — refine, don't rebuild.
- **`#/events/new` — S4.2 Create event.** Form: `sport` (text), `categorie` (add/remove list of
  strings), `dates.from`/`dates.to` (date inputs) → `o3.createEvent({sport, categorie, dates})` →
  `navigate('#/events/' + newId)`. Client-side required-field validation; submit disabled while
  in flight; error inline. **No** tie-break/playbook/name/location (O6/S6+).
- **`#/events/:id/enroll` — Iscrizioni (S4.3 + S4.4 + S4.5).**
  - **S4.3 open window:** show current window state (`o5.getRegistrationWindow(id)`); a per-category
    cap form (one number input per `event.categorie`) → `o5.openRegistrationWindow(id, capacities)`;
    the returned window shows per-category `remaining`.
  - **S4.4 share link:** `${apiOrigin-derived E3 base}/e3/#/events/${id}` with a copy button,
    shown when the window is open. (Category-level ref deferred to S5's apply flow; carried as a
    hash param the E3 apply will read.)
  - **S4.5 inbox:** pending list = `o5.listRegistrations(id, 'Applied')`; per row **Conferma**
    (`o5.confirmRegistration`) and **Rifiuta** (`o5.rejectRegistration(id, reason)`), then `refresh()`.
- **`#/events/:id/participants` — Partecipanti (S4.6 + S4.7).** Confirmed list =
  `o5.listRegistrations(id, 'Confirmed')` merged by `registrationId` with `o12.listFees(id)` →
  each row shows the participant, category, and fee badge (`Richiesta`/`Pagata`). Rows not yet
  `Pagata` show **Segna quota pagata** → `o12.payFee(registrationId)` → `refresh()`.

### 5. Semantics (S4.5 vs S4.6)
Confirm (S4.5) accepts a pending registration into the tournament. Marking fee paid (S4.6)
records payment on an already-Confirmed participant (`o12` sets `Paid`, emits
`ParticipationFeePaid`; the O5 auto-confirm path only fires for still-`Applied` rows and is a
no-op here). The Partecipanti view surfaces fee status via the new `o12.listFees` read.

### 6. Share link (S4.4)
`${e3Origin}/e3/#/events/${id}`. `e3Origin` derives from config (a `VITE_E3_BASE_URL`, defaulting
to the current origin for local/co-hosted CloudFront). Copy-to-clipboard + a visible input so the
organizer can copy manually. The E3 landing route (`#/events/:id`) already exists (S3).

## Testing strategy
- **Pure `render()` unit tests** per screen: dashboard (events + empty-state + CTA), create-event
  (fields + category add/remove render), enroll (window state + cap form + share link visibility +
  inbox rows + confirm/reject buttons), participants (confirmed rows + fee-status merge incl. a
  `Requested` and a `Paid` case + empty-state).
- **rest-client** `o12.listFees` unit test (mocked fetch: URL, method, parse).
- **Backend** o12 read-model + `FeeReadStore` fake unit tests; consumer denormalization unit test
  (stores `sportEventId`); GSI query verified against LocalStack DynamoDB if the env is up
  (mirroring S1's adapter smoke checks); note if env-blocked.
- **`mount()` wiring**: one jsdom test that a confirm-button click calls a fake client's
  `confirmRegistration` and triggers `refresh` (proves the controller wiring), kept light.
- `nx build` (all projects) + `cdk synth` (GSI + route) + local dev-server smoke of the flow.

## Out of scope (YAGNI)
- Tie-break policy, playbook, event name/location/time on create-event — O6/S6+.
- E3 apply flow / category-scoped landing — S5.
- Payments UI beyond "mark paid" (amounts, refunds), calendar/standings/finals — later slices.
- Real-time updates; screens refresh on action, not via subscriptions.
- Actual deploy + Auth0 dashboard allow-listing (still the pending S3 operator step).

## Risks
- **o12-fees GSI + denormalization** touches the consumer write path; existing rows lack
  `sportEventId` (documented; fresh collaudo unaffected).
- **`mount()` DOM wiring** is the least-unit-testable part; keep it thin and lean on pure `render`
  + one jsdom wiring test + manual smoke.
- **Share-link origin**: E1 and E3 are co-hosted under one CloudFront (`/e1/`, `/e3/`), so the
  current origin works; `VITE_E3_BASE_URL` allows override if they ever split.
