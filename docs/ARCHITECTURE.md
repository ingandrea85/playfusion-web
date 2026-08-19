# PlayFusion 2.0 — Technical Architecture

> Companion to the root [`README.md`](../README.md). The README is the quick-start;
> this document explains **how the system is built and why**. It is grounded in the
> code as it exists today (phase S0), and calls out explicitly what is placeholder
> vs. real.

## 1. What this project is

**PlayFusion 2.0** is a greenfield rebuild of the sports-tournament management
platform, delivered as the `playfusion-web` monorepo. It replaces the 1.x stack
(Flask prototype + AWS AppSync/Lambda) with an **event-driven, bounded-context
architecture** built on AWS-serverless primitives, developed locally against
[LocalStack](https://localstack.cloud/).

The build is driven by a small set of Architecture Decision Records:

| ADR | Decision | Where it shows up in the code |
|-----|----------|-------------------------------|
| **ADR-011** | `playfusion-web` is the 2.0 monorepo, Nx over npm workspaces, layered `apps/libs/services/infra` | `nx.json`, `package.json` workspaces, `eslint.config.js` boundaries |
| **ADR-012** | CDK + GitHub Actions deploy; physical names `playfusion2-<base>-<env>`; `stg` (collaudo) / `pr` (prod); region `eu-south-1` | `libs/platform-lib/src/naming.ts` |
| **ADR-002** | REST + API Gateway + one Lambda per Bounded Context + EventBridge + Step Functions + LocalStack; **no cross-BC imports** | `eslint.config.js`, every `services/*/src/handler.ts` |

Work proceeds in thin vertical slices (S0…S21). The first business slice is the
**PB-1 "Bundle Enrollment"** playbook, spanning 5 bounded contexts.

## 2. Monorepo layout

Nx sits **on top of** npm package-manager workspaces. npm resolves the packages;
Nx provides the task graph, caching, and module-boundary linting.

```
playfusion-web/
├── apps/        Experience SPAs (E1 organizer, E3 public, E4 admin…) — real content in S6+ (sample-web since S0.5)
├── libs/        platform-lib (shared runtime kernel) + PS-B design system (tokens, ui — §4b)
├── services/    Bounded Contexts (the backend) — migrated from the pilot in S0.2
├── infra/       AWS CDK stacks (ADR-012) — real content in S0.6+
├── mockups/     Mid-fidelity runnable UI reference (npm run mockups → :5173)
├── workflow/    PB-1 orchestration (Step Functions ASL + local-orchestrator fallback)
├── scripts/     provision.ts — creates DynamoDB tables + EventBridge bus on LocalStack
├── test/        Cross-BC integration + pilot-acceptance tests
└── docs/        Design specs & plans (docs/superpowers/) + this document
```

Any not-yet-populated layer holds a single `_placeholder` package so the
workspace resolves and `build`/`test`/`lint` run end-to-end. Placeholders are
deleted as real content lands (only `infra/` is placeholder today).

**Toolchain:** Node 20 (`.nvmrc`, `engines`), TypeScript 5.5 (ES2022, ESNext
modules, `moduleResolution: bundler`, `strict`), ESM throughout (`"type":
"module"`), Vitest for tests, ESLint 9 (flat config) for boundaries.

## 3. Architectural style

The backend is a set of **Bounded Contexts (BCs)** — independent, event-driven
microservices. The invariant that holds the design together (ADR-002):

> **BCs never import each other.** They communicate only via a **REST command**
> (synchronous, request/response) or a **Domain Event** (asynchronous, over
> EventBridge). There is no shared database and no in-process cross-BC call.

### Bounded Contexts (`services/`)

| BC | Responsibility | Shape today |
|----|----------------|-------------|
| `o2-identity-access` | Identity & access — magic-link auth, token issue/verify | Hono app + `token.ts` |
| `o3-sport-events` | Publishing sport events (sport, categories, dates) | Thin Hono app |
| `o4-participant-management` | Participant records | Thin Hono app |
| `o5-registration` | Registration lifecycle (apply → confirm/reject), windows | **Full hexagonal** reference |
| `o12-payments` | Participation fees | Hono app + event consumer |

Each BC is currently an **in-process Hono `app`** exported from
`src/handler.ts`, with a Lambda entrypoint (`export const handler`) wired via
`hono/aws-lambda`. In deployed environments (S0.6+ / CDK) each becomes one
Lambda behind API Gateway; in tests and the local orchestrator the same `app` is
driven directly via `app.request(...)`. This dual use is deliberate — the HTTP
contract is identical whether invoked by API Gateway or in-process.

### Two entrypoints per BC

- **`handler.ts` — command side.** A Hono router. Validates input with Zod,
  wraps each invocation in a correlation scope, calls an application use-case,
  returns JSON. Errors map to HTTP via `toHttpError`.
- **`consumer.ts` — event side.** Reacts to Domain Events delivered by
  EventBridge. **Idempotent**: it checks a `*-processed-events` table before
  acting and records the `eventId` after, so redeliveries are no-ops.

### Hexagonal (ports & adapters) — the `o5-registration` reference

`o5-registration` is the canonical BC and the template for the others as they
mature. Its `src/` is layered:

```
domain/        Pure business rules. No I/O, no AWS.
               registration.ts (state machine Applied→Confirmed/Rejected),
               registration-window.ts (isOpen), events.ts (event factories), errors.ts
application/   Use-cases: apply/confirm/reject registration, open-window,
               and event reactions (on-fee-paid, on-participant-created, on-event-published).
               Each is `(deps) => (cmd) => result` — dependencies injected, no globals.
ports/         Interfaces the application depends on:
               RegistrationRepository, WindowRepository, ParticipantDirectory, Authorizer.
adapters/      Concrete implementations of the ports (DynamoDB repositories,
               HTTP claim authorizer). The only place that touches AWS/other BCs.
handler.ts     Composition root (command): builds adapters, wires the Hono routes.
consumer.ts    Composition root (events): builds adapters, dispatches by detail-type.
```

The dependency rule points **inward**: `domain` knows nothing; `application`
depends on `domain` + `ports`; `adapters` and `handler`/`consumer` depend on
everything and are the only layers that know about DynamoDB, EventBridge, or the
network. This is what makes the domain and application layers unit-testable with
in-memory fakes (`test/fakes.ts`) and no LocalStack.

## 4. The shared kernel — `libs/platform-lib`

Every BC depends on `@playfusion/platform-lib` (and, by the boundary rules, on
*nothing else* cross-layer). It is the thin runtime kernel — cross-cutting
concerns, not business logic:

| Module | Provides |
|--------|----------|
| `correlation.ts` | `withCorrelation(id, fn)` / `currentCorrelationId()` via `AsyncLocalStorage` — a correlation id flows through every log line and published event without being threaded by hand |
| `logging.ts` | `pino` logger + `checkpoint(unit, phase, fields)` — structured START/STOP/PUBLISHED/SKIP markers carrying the correlation id |
| `envelope.ts` | `DomainEventEnvelope` (`eventId`, `organizationId`, `occurredAt`, `correlationId`) + `makeEnvelope()` |
| `event-publisher.ts` | `EventPublisher` interface — `publish(name, payload, organizationId)` |
| `eventbridge-event-publisher.ts` | Production impl → `PutEvents` on the bus, `Source = EVENT_SOURCE`, `DetailType = name`, `Detail = { envelope, ...payload }` |
| `recording-event-publisher.ts` | In-memory impl for tests (records published events, asserts on them) |
| `dynamo.ts` | `makeDocClient()` — `DynamoDBDocumentClient` honoring `AWS_ENDPOINT_URL` (LocalStack) |
| `idempotency.ts` | `DynamoIdempotencyStore` — `alreadyProcessed` / `markProcessed` for consumers |
| `http.ts` | `ok(body)` and `toHttpError(e)` — maps `DomainError` → its status, `ZodError` → 400, else → 500 |
| `errors.ts` | `DomainError` (business, default 409) vs `TechnicalError` |
| `naming.ts` | `resourceName(base)`, `busName()`, `EVENT_SOURCE`, `PF_ENV` — single source of truth for physical names (ADR-012) |

## 4b. The design system — PS-B (`libs/tokens` + `libs/ui`)

The front-end shares one design system, **PS-B** (ADR-008), migrated from
`playfuse-frontend` in S0.5 under the `@playfusion/*` scope:

- **`@playfusion/tokens`** — the Style-Dictionary pipeline. Source design tokens live in
  `libs/tokens/design/figma-export/tokens.json` (the Figma export); `npm run tokens:build`
  runs `tools/build-tokens.mjs` to generate `src/tokens.css` (CSS custom properties, the
  `--color-*` etc. consumed at runtime) and `src/lib/tokens.generated.ts` (typed constants).
  The generated artifacts are committed so consumers need no build step.
- **`@playfusion/ui`** — the `pf-*` primitives (`pf-badge`, `pf-button`, `pf-color-swatch`,
  `pf-icon`, `pf-spinner`). They are **framework-free native Web Components** (`HTMLElement`
  with a CSS side-effect import per element); `lit` is used only by the Storybook stories,
  not at runtime. Importing `@playfusion/ui` registers every custom element as a side effect.
  **Storybook** (`@storybook/web-components-vite`, `libs/ui/.storybook/`) is the component
  gallery: `npm run storybook` (dev) / `npm run build-storybook` (static).

Both are `scope:lib`, so apps and services may depend on them (a service never would, but
the boundary rules permit `lib`). `apps/sample-web` is a minimal Vite app that imports a
`pf-*` primitive end-to-end — the S0.5 acceptance harness that both libs resolve and bundle.
Component specs run in jsdom via each lib's own vitest config (`npm run test -w @playfusion/ui`),
kept out of the backend root test run.

## 5. Runtime data flow

A command entering one BC and rippling to another via a Domain Event — the
core pattern of the system:

```
 HTTP command                                     Domain Event (async)
      │                                                   ▲
      ▼                                                   │
┌───────────────── o3-sport-events ─────────────────┐    │
│ handler.ts  POST /events                           │    │
│   Zod validate → PutItem playfusion2-o3-events-*   │    │
│   publisher.publish("EventPublished", …)  ─────────┼────┼──▶ EventBridge bus
└────────────────────────────────────────────────────┘   │    playfusion2-bus-<env>
                                                          │        │
                                                          │        │ detail-type routing
                                                          │        ▼
                                              ┌──────── o5-registration ────────┐
                                              │ consumer.ts                      │
                                              │   idempotency.alreadyProcessed?  │
                                              │   onEventPublished(...) → opens  │
                                              │     the registration window      │
                                              │   idempotency.markProcessed      │
                                              └──────────────────────────────────┘
```

Concretely, in `o5-registration`:

1. `POST /registrations` → `handler.ts` validates, calls `applyRegistration` use-case.
2. The use-case checks the **window is open**, the **participant exists**, and there
   is **no double-apply**, then saves the registration and publishes
   `RegistrationApplied`.
3. `o12-payments` reacts, and when the fee is paid publishes `ParticipationFeePaid`;
   `o5`'s `consumer.ts` handles `on-fee-paid` to advance the registration.

Every hop carries the same `correlationId` (via the envelope and `AsyncLocalStorage`),
so a full enrollment can be traced end-to-end in the logs.

### 5b. Read side (S1)

Reads are served by **querying each BC's own current-state store directly** — no
event-sourced projection store (decision: `docs/superpowers/specs/2026-08-01-s1.1-read-model-strategy.md`).
Cross-BC data is denormalised on the write side, never joined on the read path, so
every query endpoint stays single-BC:

| Endpoint | BC | Access pattern |
|---|---|---|
| `GET /events` | o3 | `org-index` GSI (`organizationId` denormalised onto the item) |
| `GET /events/:id` | o3 | `GetItem` by `sportEventId` — detail + categories |
| `GET /events/:id/registrations?state=` | o5 | `event-index` GSI + `status` filter (inbox = `Applied`, participants = `Confirmed`) |
| `GET /events/:id/registration-window` | o5 | `o5-windows` state + `event-index` active counts → per-category `{cap, count, remaining}` |

The per-category cap (D-O5-1) is denormalised into the O5 registration-window when
registrations are opened (`open-window` accepts `capacities`), so remaining capacity is
computed inside O5 without a query-time call to O3. Query logic lives behind the same
ports as writes (O5 `RegistrationRepository.findByEvent`, O3 `EventReadStore`), so it is
unit-tested with in-memory fakes; the DynamoDB adapters' GSI queries are smoke-checked
against LocalStack.

### 5c. Auth (S2)

Two credential types, verified in shared-kernel code (`libs/platform-lib`) and enforced as
Hono middleware at each BC's HTTP boundary:

- **Organizers** log in with **Auth0** (RS256 JWT). `createAuth0Verifier` validates
  signature (JWKS), issuer and audience via `jose`, and projects the token into an
  `Identity` (roles from a namespaced claim, org from `org_id`). Config is injected per-env
  by the `ApiStack` (`AUTH0_*`); see the [Auth0 setup runbook](runbooks/auth0-setup.md).
- **Coaches** enrol with an O2 **magic-link** — a hardened HMAC token (versioned, expiring,
  timing-safe, optional purpose) in `magic-link.ts`, mintable by O2 and verifiable by any
  BC against the shared `PF_TOKEN_SECRET` without importing O2 code (ADR-002).

Enforcement (`requireOrganizer` / `requireMagicLink`):

| Route | Middleware | Accepts |
|---|---|---|
| O3 `POST /events`, O5 `open-window` / `confirm` / `reject` | `requireOrganizer` | Auth0 organizer JWT **or** an O2 `RegistrationManager` magic-link (transitional bridge) |
| O5 `POST /registrations` (coach apply) | `requireMagicLink` | any valid magic-link |
| GET read endpoints (§5b) | none | public (E3 landing) |

Missing/invalid credential → **401**; valid credential without the required role → **403**.
The token is read from `authorization` or `x-approver-token` (Step Functions'
`apigateway:invoke` forbids the reserved `authorization` header). The **dual-accept bridge**
keeps the deployed PB-1 Step Functions + pilot green while no Auth0 tenant exists; it is
removed once Auth0 is live.

## 6. Naming & environments (ADR-012)

All physical AWS resource names are derived from one helper so they can never
drift:

```ts
resourceName('o3-events')  // → playfusion2-o3-events-local
busName()                  // → EVENT_BUS_NAME  ?? playfusion2-bus-<env>
EVENT_SOURCE               // → 'playfusion2'  (same across all envs)
```

`PF_ENV` selects the environment token: `local` (dev/test default), `stg`
(collaudo), `pr` (produzione). CDK injects `PF_ENV` and `EVENT_BUS_NAME` into the
deployed Lambdas from S0.6+. `EVENT_SOURCE` is intentionally **not**
per-environment, so publishers and EventBridge rules always agree.

## 7. Local development infrastructure

The whole AWS backend runs locally on **LocalStack** (`docker-compose.yml`):
`dynamodb, events, lambda, apigateway, stepfunctions, sqs, s3, iam, sts, logs,
cloudformation`. The broad service set is chosen so `cdklocal deploy` will work
unchanged once the CDK stacks land.

```bash
npm run stack:up     # docker compose up -d   (LocalStack on :4566)
npm run provision    # tsx scripts/provision.ts — creates tables + the event bus
npm run stack:down
```

`scripts/provision.ts` is **idempotent** (it swallows "already exists" errors)
and creates the DynamoDB tables per BC plus the EventBridge bus, all named via
`resourceName`/`busName`. A devcontainer (`.devcontainer/`, Node 20) composes
LocalStack onto the same network for a batteries-included dev environment.

## 7b. Cloud infrastructure (AWS CDK)

The deployed topology lives in `infra/cdk` (`@playfusion/infra`), an AWS CDK app
(`aws-cdk-lib` v2). It reuses the previous `playfuse-infra` operational pattern:

- **Env from context.** `bin/app.ts` reads the env token from CDK context
  (`-c env=stg|pr|local`, default `local`) and loads non-secret per-env config from
  `env/<token>.json`. Every physical name derives from that token via `lib/naming.ts`
  (`playfusion2-<base>-<env>`), so nothing is hard-coded to one environment (S0.10).
- **Credentials.** Account/region come from the standard AWS chain
  (`CDK_DEFAULT_ACCOUNT` / `CDK_DEFAULT_REGION`, populated by the CLI or CI); region
  defaults to `eu-south-1` (ADR-012). No secrets in the repo.
- **Local verification.** `npm run synth -w @playfusion/infra` (no credentials needed);
  `aws-cdk-local` (`cdklocal`) deploys against the same LocalStack used for tests.

Stacks:

| Stack | Slice | Contents |
|-------|-------|----------|
| `DataStack` | S0.6 | The per-BC DynamoDB tables and the EventBridge bus `playfusion2-bus-<env>` — mirrors `scripts/provision.ts`. Read GSIs (S1): `o5-registrations` `pe-index` + `event-index`, `o3-events` `org-index`. |
| `ApiStack` | S0.7 | One esbuild-bundled `NodejsFunction` per BC (o2/o3/o4/o5/o12) fronted by an API Gateway REST API (`/<bc>/{proxy+}` → the BC's Hono app), plus the o5/o12 event consumers wired as EventBridge rule targets, each with least-privilege grants on its own tables + the bus. The S0.4 lint rule guarantees a bundle never pulls another BC's code. |
| `WorkflowStack` | S0.8 | The PB-1 "Bundle Enrollment" Setup ASL (`workflow/pb-1-setup.asl.json`) deployed as a real Step Functions state machine + its two task-token Activities — the runtime ADR-010 could previously only simulate. Automatic tasks invoke the S0.7 API via `apigateway:invoke` (endpoint from execution input). `test/integration/pb-1-statemachine.it.test.ts` creates the state machine on the engine and asserts an execution walks the Setup graph to a terminal state; the happy-path functional walk of steps 1–6 stays covered by the L2 orchestrator test (§9). |
| `HostingStack` | S0.9 | S3 bucket + CloudFront static hosting with path-based behaviours per Experience (`e1/*` organizer, `e3/*` public; default → E3) off one origin (R7). A placeholder index per app is deployed inline so a real deploy serves a page per path. |

Every stack derives its env token from CDK context and threads it through `naming.ts`
(S0.10) — no physical name is pinned to one environment; the only per-env conditional is
the prod removal policy. `cdk synth -c env=stg` and `-c env=pr` therefore produce two
fully disjoint resource sets, proven by `test/env-isolation.test.ts` (synthesizes both
in-memory and asserts every name carries its token and the sets don't overlap).

## 7c. CI/CD & deployment

Two GitHub Actions workflows deploy the CDK app, credentials assumed via GitHub→AWS
**OIDC** (no long-lived keys, S0.13); the deploy-role ARN is the repo variable
`AWS_DEPLOY_ROLE_ARN`, region `eu-south-1`. The OIDC provider + least-privilege deploy
role are created once per account from `infra/bootstrap/github-oidc.yaml` — the manual
prerequisite is documented in [`infra/bootstrap/README.md`](../infra/bootstrap/README.md).
The role trusts only this repo's `stage` branch and `v*` tags, and may only assume the
`cdk-*` bootstrap roles.

| Workflow | Trigger | Effect |
|----------|---------|--------|
| `.github/workflows/deploy-stage.yml` | push to `stage` | Deploys the **collaudo** (`stg`) env, **path-aware**: maps the changed paths → affected stacks and `cdk deploy`s only those (shared changes fall back to `--all`). A single-BC change does not redeploy the others (S0.11). |
| `.github/workflows/deploy-prod.yml` | pushed tag `v*` | Deploys the **produzione** (`pr`) env (`--all`). Tags-only trigger + a guard that the tagged commit is on `main`, so a plain merge to `main` deploys nothing (S0.12). |

The **first real deploy to `stg` + the pilot E2E on real AWS** (S0.14) is a user action
(needs a live account) — the procedure and the 5-criteria evidence template are in
[`docs/runbooks/s0.14-first-stg-deploy.md`](runbooks/s0.14-first-stg-deploy.md). A
skip-gated harness `test/e2e/pilot-e2e.e2e.test.ts` (`npm run test:e2e` with `API_BASE_URL`)
drives the deployed API; it no-ops without a live endpoint so `npm test` stays green.

## 8. Boundary enforcement

The no-cross-BC invariant (ADR-002/011) is enforced by ESLint (`eslint.config.js`),
in layers:

1. **Nx tags.** Each package declares `nx.tags` (`scope:app|lib|service|infra`).
   `@nx/enforce-module-boundaries` allows `app`/`service`/`lib` to depend only on
   `scope:lib`; `infra` may depend on anything. This governs *package* imports.
2. **Belt-and-suspenders (`services/**`).** `no-restricted-imports` forbids any
   relative path reaching into another `o<n>-*` tree, and `no-restricted-syntax`
   forbids the same via dynamic `import()` in production `src/**`.
3. **Test exemption.** Integration tests legitimately wire several BCs together
   (black-box, over their HTTP/consumer surfaces), so `**/*.test.ts` and
   `**/test/**` are exempt. Production `src/**` stays fully policed.

Run it with `npm run lint` (`nx run-many -t lint`).

The rule is **proven** by an automated test, `test/lint-boundary.test.ts` (S0.4): it
lints source snippets through the real `eslint.config.js` via the ESLint Node API and
asserts that a static cross-BC import and a dynamic cross-BC `import()` both fail
(with the ADR-002 messages), while a legitimate `@playfusion/platform-lib` import lints
clean — so a regression that weakens the boundary breaks `npm test`.

## 9. The PB-1 workflow (Bundle Enrollment)

`workflow/pb-1-setup.asl.json` documents the **intended** Step Functions shape
for PB-1 Setup (steps 1–6). It is **not executable on LocalStack Community**: the
automatic Task states need a reachable compute target (a deployed API Gateway
stage or a real Lambda ARN), which does not exist in this pilot — every BC is an
in-process Hono `app`, not yet a deployed Lambda. (The Activity /
`SendTaskSuccess` callback pattern for the *wait* states *does* work; the blocker
is only the automatic steps' compute target.)

`workflow/pb-1-orchestrator.ts` is the **L2 local-orchestrator fallback**: it
sequences the identical steps in-process by importing each BC's Hono `app` and
calling `app.request(...)`, polling DynamoDB read models where the ASL would have
waited on a task-token callback. This is the decision-4 pragmatic path: the ASL is
the design of record; the orchestrator is what actually runs today. The same
finding is documented at the provisioning layer in `scripts/provision.ts`.

## 10. Testing

Vitest, two projects (`vitest.config.ts`):

| Project | Files | Needs LocalStack? | Run |
|---------|-------|-------------------|-----|
| **unit** | `{services,libs}/*/test/**/*.test.ts` (excl. `.it.test.ts`) | No — pure domain/application with in-memory fakes | `npm test` |
| **integration** | `**/*.it.test.ts` + `test/**/*.it.test.ts` | Yes — real DynamoDB/EventBridge on LocalStack | `npm run test:it` |

Integration tests load `test/setup/localstack-env.ts` to point the AWS SDK at
`:4566`. `test/integration/pilot-acceptance.it.test.ts` and
`test/integration/pb-1-setup.it.test.ts` exercise the end-to-end Bundle
Enrollment flow across BCs. Tests resolve `@playfusion/platform-lib` to its
TypeScript **source** (Vitest transpiles on the fly), so no prior `tsc` build is
needed; production builds resolve it via the built `dist/`.

## 11. Command reference

```bash
npm install          # resolve all workspaces
npm run build        # nx run-many -t build   (respects the project graph)
npm test             # vitest unit project
npm run test:it      # vitest integration project (LocalStack required)
npm run lint         # nx run-many -t lint    (enforces module boundaries)
npm run graph        # nx project graph (visualize dependencies)
npm run stack:up     # LocalStack up
npm run provision    # create tables + event bus on LocalStack
npm run stack:down   # LocalStack down
npm run mockups      # serve the UI reference on :5173
```

## 12. Current status & roadmap

**Phase S0 (setup) — complete.** S0.1 (Nx scaffold), S0.2 (BCs migrated from the
pilot into `services/*`), S0.3 (centralized `naming.ts`), S0.4 (no-cross-BC lint
rule + its automated proof, §8), S0.5 (PS-B design system — `libs/tokens`,
`libs/ui`, Storybook, `apps/sample-web` — §4b), and S0.6–S0.10 (the AWS CDK app in
`infra/cdk`: `DataStack`, `ApiStack`, `WorkflowStack`, `HostingStack`, all
env-parametrized — §7b). Next: real feature slices (S1+) and the frontend
Experience SPAs (E1 organizer, E3 public, E4 admin) from S6 onward; `mockups/` is
the runnable reference until then.

**Phase S1 (read models / query endpoints) — complete.** S1.1 (read-model strategy:
per-BC direct query, no projection), S1.2 (`GET /events` per org + detail), S1.3
(`GET /events/:id/registrations?state=`), S1.4 (window state + per-category capacity) —
see §5b and the S1.1 spec. These feed the S4/S5 Bundle Enrollment screens.

**Phase S2 (auth) — backend complete.** S2.2 (shared Auth0 JWT verifier + auth middleware
in platform-lib), S2.3 (hardened magic-link), S2.4 (enforcement on O3/O5, dual-accept
bridge) — see §5c. S2.1 ships the Auth0 config plumbing + [setup runbook](runbooks/auth0-setup.md);
live organizer login is deferred until the tenant + E1 SPA (S3) exist.

**Phases S3–S6 (Experience SPAs) — complete.** S3 (frontend foundation: `app-shell`,
`rest-client` seam, E1/E3 shells, Auth0 + magic-link), S4/S5 (E1↔E3 Bundle Enrollment
screens), S6 (Competition config O6: full create-event + Panoramica/Competition/Categorie
tabs). See the per-slice specs under `docs/superpowers/specs/`.

**Phase S7 (Scheduling + public calendar, O7) — complete.** New `o7-scheduling` BC
(`services/o7-scheduling/`, mounted at `/o7`): generate a group-stage calendar from the
confirmed teams (o5) and event categories (o3), then approve and publish it. The organizer
drives it from the E1 **Calendario** tab (`apps/e1-web/src/views/schedule.ts`); once
published a read-only public calendar (`apps/e3-web/src/views/calendar.ts`) appears on the
E3 landing. O7 reads o3/o5 over HTTP (ADR-002); teams are labelled by `participantRef` and
group structure comes from the schedule config (default 1 group) until the S8 gironi editor.

**Phase S8 (Gironi editor, O6) — complete.** Group composition is now **explicit and editable**:
the organizer draws groups (server-side round-robin of confirmed teams), moves teams between them
and locks, from the E1 **Gironi** tab (`apps/e1-web/src/views/gironi.ts`). The composition lives on
the o3 event (`gironi` map, per S6's O6-on-o3 decision — `services/o3-sport-events/src/gironi.ts` +
`POST /o3/events/:id/gironi:draw` / `PUT …/gironi/:categoria` / `GET …/gironi`). O7's `buildFixtures`
was refactored to consume the resolved groups, so `generate` follows the composition when present
and falls back to the S7 auto-split otherwise.

**Phase S9 (Calendar editor / reschedule, O7) — complete.** The organizer can reschedule a single
match (day/time/field) from the E1 calendar editor (`PUT /o7/events/:id/matches/:matchId`), with
**slot-conflict detection** (same day+time+field as another match → 409 SLOT_CONFLICT). Reschedule
is allowed in any status incl. PUBLISHED and never changes the status (distinct from the mass
regenerate S7 locks after APPROVED). `renderCalendar` gained an `editable` flag so only E1 shows the
per-match "Modifica" control; E3 stays read-only.

**Phase S22 (Per-category schedule config, O7) — complete.** `ScheduleConfig` gained an
optional `byCategory` override so each category can play on its own fields with its own match
params + legs (`dailyStart`/`slotsPerDay`/`groupsCount` stay global). `buildFixtures` places
each category on its own fields using one cursor per (fields+slot) signature — same-config
categories lay out sequentially (no collision), distinct-field categories in parallel. The E1
schedule screen has a "stessa per tutte / per categoria" toggle (one card, or one card per
category). Additive/back-compat: pre-S22 flat configs still apply to all categories.

**Phase S10 (Standings live, O8) — complete.** Results live on the o7 match (`homeScore`/
`awayScore`, null = not played); `POST /o7/events/:id/matches/:matchId/result` records them and a
pure `computeStandings` derives per-group tables on read (`GET /o7/events/:id/standings`) — 3/1/0,
ordered points → goal-difference → goals-for → name (the configurable tie-break is S11). The E1
calendar gains a per-match "Risultato" panel and shows scores; a **Classifiche** workspace tab and
the E3 public standings view render the shared `renderStandings`. O8 lives on o7 (scores are match
data; no new BC — same pragmatic call as O6-on-o3).

**Phase S24 (Edit match teams, O7) — complete.** The calendar "Modifica" panel edits a match's
teams (home/away) as well as its slot: `PUT /o7/events/:id/matches/:matchId` takes optional
`home`/`away` (absent = pure reschedule). Level-B validation: non-empty + `home != away` (422); each
team must be a confirmed team of the category (422, read from o5, fail-open if unavailable);
changing the teams resets the match result. Per-match override — the gironi composition is
unchanged; standings recompute from the edited matches.

**Phase S25 (Field directors, O8/E2) — complete.** Per-field directors report results from the
phone. `POST /o7/events/:id/director-token {field}` (organizer) mints a role=`director` magic-link
(subject `director:<eventId>:<field>`, TTL to the event's end) that the organizer shares — one link
per field. `recordResult` accepts the organizer OR a director; a director is restricted to their
token's event + field (403 otherwise, `requireResultReporter` + `restrictToField`). The E3 route
`#/events/:id/director` is a mobile-first view listing only that field's matches, each opening a
big −/+ score stepper (`renderStepper`, reused in the E1 result panel). Client-side field parse is
display-only; the backend re-enforces the scope on every write.

## 13. Where to read more

- [`README.md`](../README.md) — quick start.
- `docs/superpowers/specs/` — per-slice design specs (the "why" for each feature).
- `docs/superpowers/plans/` — per-slice implementation plans.
- ADR-002 / ADR-011 / ADR-012 — the architectural decisions this document implements.
```
