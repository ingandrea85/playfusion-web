# S3 — Frontend foundation (rest-client, app shells, auth wiring)

- **Date:** 2026-08-01
- **Slice:** S3 — Frontend foundation
- **Issues:**
  [#23 S3.1 libs/rest-client](https://github.com/ingandrea85/playfusion-web/issues/23) ·
  [#24 S3.2 E1 app shell](https://github.com/ingandrea85/playfusion-web/issues/24) ·
  [#25 S3.3 E3 app shell](https://github.com/ingandrea85/playfusion-web/issues/25) ·
  [#26 S3.4 FE auth wiring](https://github.com/ingandrea85/playfusion-web/issues/26)
- **ADR:** ADR-002 (REST + API Gateway + Lambda-per-BC), ADR-008 (rest-client replaces
  `libs/graphql`), ADR-011 (2.0 monorepo + module boundaries), ADR-012 (deploy CDK + GH Actions)
- **Branch:** `feature/s3-frontend-foundation`

## Goal

Stand up the **frontend foundation** for the 2.0 platform: the single typed FE→backend
seam (`libs/rest-client`), a shared chrome library ported from the validated mockups
(`libs/app-shell`), and the two Experience SPAs that consume them — **E1 (organizer)** and
**E3 (public)** — each with its auth gate wired (Auth0 SPA for E1, magic-link for E3).

This slice delivers **shells, not feature screens**: chrome + navigation + one real
data-backed view per app + working auth gates. The enrollment / calendar / standings /
bracket screens stay in S4/S5+.

### Acceptance criteria (from the issues)

- **S3.1** — a typed REST client calls the S1 endpoints with types; the apps use it. No
  business logic in the FE (R6).
- **S3.2** — E1 shell live with basic navigation, consuming PS-B (tokens + ui), replicating
  the validated mockup chrome/layout, behind the E1 CloudFront path.
- **S3.3** — E3 public shell live, behind the E3 CloudFront path.
- **S3.4** — E1 requires login (Auth0 SPA; token flows into the rest-client); E3 accepts a
  valid coach magic-link.

> **Deploy scope for this pass:** implement + verify **locally** (unit tests, `nx build`,
> `vite build`, local dev-server smoke). "Live on collaudo" is reached by a **separate,
> explicitly-authorized** deploy (push to `stage` / a `stg-*` tag → CI/CD). Per the repo's
> git rules this pass does **no push and no deploy**.

## Context — what already exists

- **Backend S1/S2 REST surface** (Hono handlers, each BC mounted at `/o{n}/{proxy+}` via
  API Gateway REST, stage `prod`):
  - `o3`: `POST /events` (organizer), `GET /events`, `GET /events/:id`
  - `o5`: `POST /registrations` (coach magic-link), `POST /registrations/:id/confirm`
    (organizer), `POST /registrations/:id/reject` (organizer),
    `GET /events/:id/registrations?state=`, `POST /events/:id/registration-window:open`
    (organizer), `GET /events/:id/registration-window`
  - `o2`: `POST /identities/magic-link`, `GET /identities/verify`
  - `o4`: `POST /participants` · `o12`: `POST /payments/:registrationId/pay`
  - Org scoping: handlers read `x-organization-id` (fallback `org-pilot`); correlation via
    `x-correlation-id`.
- **PS-B**: `libs/tokens` (generated `tokens.css` + TS token consts, built by
  `tools/build-tokens.mjs` via style-dictionary) and `libs/ui` (Lit `pf-*` web components:
  button, badge, icon, spinner, color-swatch).
- **Validated mockup chrome**: `mockups/shared/chrome.ts` (organizer topbar, event
  workspace hero + tab bar, public topbar, calendar/standings/bracket renderers) +
  `mockups/shared/ui.css` (375 lines of `pf-*` chrome classes) + `mockups/shared/tokens.css`
  (**different token names** than `libs/tokens` — e.g. `--space-6` vs `--space-md`).
- **Infra**: `infra/cdk` — `api-stack.ts` (RestApi, **no CORS today**),
  `hosting-stack.ts` (one S3 bucket + CloudFront; `e1/*` and `e3/*` behaviours; default
  root `e3/index.html`; today deploys **placeholder** HTML per prefix), `env/{stg,local,pr}.json`.
- **`env/stg.json` Auth0 is empty** (`issuer`/`audience` = `""`) → Auth0 is config-gated off
  on collaudo, matching how backend S2.1 was left.
- **Module boundaries** (ADR-011, `eslint.config.js`): `scope:app` may only depend on
  `scope:lib`; `scope:lib` only on `scope:lib`. Apps must reach the backend **only** through
  `libs/rest-client`.

## Design

### 1. `libs/rest-client` (S3.1) — `@playfusion/rest-client`, `scope:lib`

The single FE→backend seam (ADR-008, replacing the former `libs/graphql`). No domain logic
— it maps typed calls to HTTP and normalizes errors.

```
libs/rest-client/src/
  http.ts        # request() core: fetch wrapper, headers, JSON, error mapping
  errors.ts      # RestError { status, code, message, body }
  auth.ts        # AuthProvider type: () => AuthHeader | Promise<AuthHeader>
  types.ts       # shared DTOs mirroring the S1 handler payloads
  o2.ts o3.ts o4.ts o5.ts o12.ts   # per-BC typed methods
  client.ts      # createClient(config) -> { o2, o3, o4, o5, o12 }
  index.ts
  ../test/*.test.ts
```

- **`ClientConfig`** = `{ baseUrl: string, auth?: AuthProvider, orgId?: string,
  correlationId?: () => string }`. `baseUrl` points at the API Gateway stage root
  (`…/prod`); each BC module prefixes its route (`/o3`, `/o5`, …).
- **`request()`** builds headers: `content-type: application/json`, `x-organization-id`
  (when `orgId` set), `x-correlation-id` (generated per call unless supplied), and the auth
  header returned by `auth()` — a `Authorization: Bearer <jwt>` for E1 **or** the magic-link
  header for E3. Non-2xx → `RestError` reading the backend `{ error | code }` body shape.
- **Per-BC typed methods**, mirroring the handlers exactly:
  - `o3`: `listEvents()`, `getEvent(id)`, `createEvent(input)`
  - `o5`: `listRegistrations(eventId, state?)`, `getRegistrationWindow(eventId)`,
    `applyRegistration(input)`, `confirmRegistration(id)`, `rejectRegistration(id, reason)`,
    `openRegistrationWindow(eventId, capacities?)`
  - `o2`: `mintMagicLink(input)`, `verify(token)`
  - `o4`: `createParticipant(input)` · `o12`: `payFee(registrationId)`
- Registered in `tsconfig.base.json` `paths` and `vitest.config.ts` `alias`.
- **Tests**: unit, with a mocked `fetch` — assert URL, method, headers (auth + org +
  correlation), body serialization, and `RestError` mapping for a 4xx.

### 2. `libs/app-shell` (S3.2/S3.3 shared) — `@playfusion/app-shell`, `scope:lib`

Ports the validated mockup chrome so both SPAs render identical topbar/hero/tab chrome.

```
libs/app-shell/src/
  chrome.ts       # renderOrganizerTopbar, renderOrganizerWorkspace(hero+tabs), renderPublicTopbar
  router.ts       # tiny hash router: register(path, render) + start()
  chrome.css      # ported pf-* chrome classes, referencing libs/tokens variables
  index.ts
  ../test/*.test.ts
```

- Chrome helpers are **framework-agnostic HTML-string functions** (the mockup style), kept
  minimal for the shell: organizer topbar + event-workspace hero with the tab bar (tab set
  trimmed to what exists — overview/enroll placeholders now, more as slices land), and the
  public topbar. The `pf-*` **web components** from `libs/ui` are used for buttons/badges
  inside these where they fit; the chrome layout itself is CSS.
- **Token reconciliation**: `libs/tokens` becomes the **superset** source of truth. Add the
  mockup-scale token names the chrome CSS needs to the token dictionary source, regenerate
  `tokens.css` via `tools/build-tokens.mjs`, and author `chrome.css` against `libs/tokens`
  variables (renaming to PS-B equivalents where one already exists). `mockups/` is untouched.
- **`router.ts`**: a ~30-line hash router (`#/`, `#/events/:id`) shared by both apps — no
  routing framework (YAGNI).
- **Tests**: jsdom render tests mirroring `mockups/shared/chrome-render.test.ts` (topbar
  active state, workspace hero shows event name + tab bar), and a router unit test.

### 3. `apps/e1-web` (S3.2) — `@playfusion/e1-web`, `scope:app`

Vite SPA, `base: '/e1/'`. Consumes `@playfusion/tokens`, `@playfusion/ui`,
`@playfusion/app-shell`, `@playfusion/rest-client`.

- **Routes** (via app-shell router): **dashboard** `#/` — organizer topbar + events list
  from `rest-client.o3.listEvents()`, each card links to the workspace; **event workspace**
  `#/events/:id` — `getEvent(id)` → hero + tab bar, tab bodies are placeholders labelled
  "arriving in S4+". This is the "basic navigation" acceptance.
- **Config** via Vite env (`import.meta.env`): `VITE_API_BASE_URL`, `VITE_AUTH0_DOMAIN`,
  `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`. A typed `config.ts` reads and validates them.
- `orgId` for `x-organization-id` comes from the Auth0 identity (`org_id` claim) when
  present, else a configured default for local runs.

### 4. `apps/e3-web` (S3.3) — `@playfusion/e3-web`, `scope:app`

Vite SPA, `base: '/e3/'`. Public, read-only.

- **Routes**: landing `#/` — event detail via `o3.getEvent()` (public topbar + hero +
  category list); participants `#/events/:id/participants` — confirmed teams via
  `o5.listRegistrations(id, 'Confirmed')`.
- **Config** via Vite env: `VITE_API_BASE_URL`.

### 5. FE auth wiring (S3.4)

- **E1 — Auth0 SPA** via `@auth0/auth0-spa-js`:
  - `auth/auth0.ts` wraps `createAuth0Client({ domain, clientId, authorizationParams: { audience, redirect_uri } })`.
  - **Guard**: on load, `handleRedirectCallback()` if returning from Auth0, else
    `isAuthenticated()`; unauthenticated → `loginWithRedirect()`. The app chrome renders
    only once authenticated (satisfies "E1 requires login").
  - `getToken()` = `getTokenSilently()`; passed to `rest-client` as its `AuthProvider`
    (`Authorization: Bearer <access-token>`). Logout button → `logout()`.
  - The Auth0 client is injected behind an interface so tests use a **mock**; the auth-guard
    state machine and the token→header injection are **unit-tested** without a live tenant.
- **E3 — magic-link**:
  - `auth/magic-link.ts` reads `?token=` from the landing URL, persists it
    (`sessionStorage`), strips it from the address bar, and confirms it via
    `rest-client.o2.verify(token)`. The stored token becomes the E3 `AuthProvider` (coach
    header) for any authenticated call (e.g. a future enroll POST). Invalid/expired → a
    "link non valido o scaduto" notice. Read-only public views work without a token.

### 6. Infra changes (`infra/cdk`)

- **`api-stack.ts`** — add CORS to the `RestApi`:
  ```ts
  new RestApi(this, 'api', {
    restApiName: `playfusion2-api-${env}`,
    defaultCorsPreflightOptions: {
      allowOrigins: [cdnOrigin],   // CloudFront URL; '*' acceptable on stg (documented)
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['content-type', 'authorization', 'x-organization-id', 'x-correlation-id'],
    },
  })
  ```
- **`hosting-stack.ts`** — replace the placeholder `BucketDeployment` with the built app
  `dist` per prefix (`Source.asset('apps/e1-web/dist') → e1/`,
  `apps/e3-web/dist → e3/`); add CloudFront `errorResponses` (403/404 →
  `/e1/index.html` and `/e3/index.html`, status 200) so client-side hash routing survives a
  hard refresh. Default root object stays `e3/index.html`.
- **`env/stg.json`** — add the Auth0 SPA `clientId` alongside `issuer`/`audience`; the FE
  build reads `domain`/`clientId`/`audience` from here (or from CI env). Filling these is the
  manual tenant prerequisite (below).

### Auth0 real-tenant — recycled from the previous PlayFusion

E1 targets a **real Auth0 tenant**, and rather than provisioning a new one we **recycle the
existing tenant** from the previous PlayFusion frontend
(`playfusion/playfusion-frontend/.../apps/web/.env.local`):

| Field | Value |
| --- | --- |
| `VITE_AUTH0_DOMAIN` | `dev-c6din8ya.eu.auth0.com` |
| `VITE_AUTH0_CLIENT_ID` | `65atFepkIh2jiMeaDqZlqgD63ccd2Gw1` |
| `VITE_AUTH0_AUDIENCE` | `https://plafusionapi.it` |
| `VITE_AUTH0_SCOPE` | `openid profile email` |
| backend `auth0.issuer` (`env/stg.json`) | `https://dev-c6din8ya.eu.auth0.com/` |
| backend `auth0.audience` | `https://plafusionapi.it` |
| roles claim namespace | `https://plafusionapi.it/roles` (values **lowercase**: `organizer`, `director`, `admin`, `tenant_admin`) |

These are non-secret SPA/public identifiers (the client id is public in a SPA; the GraphQL
API key found alongside them is **not** copied — unrelated to this slice). Two manual/config
reconciliations, both flagged rather than silently skipped:

1. **Allowed URLs (manual, Auth0 dashboard, operator):** the reused SPA application must add
   the new E1 origins to **Allowed Callback URLs / Web Origins / Logout URLs** — the E1
   CloudFront URL and `http://localhost:<port>` for local dev. Code + runbook
   (`docs/runbooks/auth0-spa-e1.md`) delivered; the allow-listing is your dashboard step.
2. **Role/org claim mapping (config):** the tenant emits roles under
   `https://plafusionapi.it/roles` (lowercase) with no guaranteed `org_id` claim, whereas
   `platform-lib` defaults to `https://playfusion/roles` + `ORGANIZER` + `org_id`. So
   `env/stg.json` sets `rolesClaim: "https://plafusionapi.it/roles"` and the
   organizer-role check is normalized case-insensitively (`organizer` ⇒ `ORGANIZER`). Org
   scoping continues to fall back to the `x-organization-id` header until the tenant carries
   an org claim. This keeps E1 login real end-to-end; deeper role→org enforcement is a
   backend follow-up, not an S3 blocker.

The FE wiring (auth-guard state machine + token→header injection) is unit-tested against a
**mocked** Auth0 client, so local build/verify passes without a network round-trip; the
**live-login smoke** runs once the operator completes reconciliation (1).

## Testing strategy

- **rest-client**: unit, mocked `fetch` — per-BC URL/method/headers/body + `RestError`.
- **app-shell**: jsdom render tests (chrome structure/active state) + router unit test.
- **e1-web**: auth-guard state-machine unit test (mock Auth0 client) + token→header
  injection test; `vite build` must pass.
- **e3-web**: magic-link parse/verify unit test; `vite build` must pass.
- **Boundary proof**: apps import backend access **only** via `@playfusion/rest-client`
  (ADR-011 lint stays green — `nx run-many -t lint`).
- **Local smoke**: run the backend locally (LocalStack stack) and click through E1
  dashboard→workspace and E3 landing→participants against it.

## Out of scope (YAGNI)

- Feature screens (enrollment, calendar editor, standings, brackets, payments) — S4/S5+.
- SSR / routing framework / state library — a hash router + rest-client suffice.
- Actual collaudo deploy and Auth0 tenant provisioning — separate authorized/manual steps.
- `o4`/`o12` beyond the one typed method each needed to complete the client surface.

## Risks

- **Token reconciliation** touches the generated `tokens.css` — must regenerate via
  `tools/build-tokens.mjs`, not hand-edit, and confirm PS-B consumers still resolve.
- **CORS `allowOrigins`** needs the CloudFront domain, unknown until hosting is deployed;
  on stg use the distribution domain via output/ref or a documented `'*'`.
- **E1 live login** uses the recycled Auth0 tenant; it depends on the operator adding the E1
  origins to the app's Allowed Callback/Web Origins/Logout URLs (reconciliation 1 above).
