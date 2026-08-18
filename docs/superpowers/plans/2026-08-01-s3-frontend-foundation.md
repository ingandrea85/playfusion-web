# S3 — Frontend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FE foundation for PlayFusion 2.0 — a typed REST client, a shared chrome library, and the E1 (organizer) and E3 (public) SPA shells with their auth gates.

**Architecture:** Two Vite SPAs (`apps/e1-web`, `apps/e3-web`) consume `@playfusion/app-shell` (chrome ported from the validated mockups) + `@playfusion/rest-client` (the only FE→backend seam, ADR-008). E1 authenticates via Auth0 SPA (Bearer token → rest-client); E3 uses a coach magic-link. Backend reached over API Gateway REST (`/o{n}/{proxy+}`, stage `prod`); CORS added to the RestApi; CloudFront serves each app under its path prefix.

**Tech Stack:** TypeScript (ESM, `moduleResolution: bundler`), Vite 7, Vitest 3, Lit web components (`@playfusion/ui`), `@auth0/auth0-spa-js`, AWS CDK (aws-cdk-lib), Nx module boundaries.

## Global Constraints

- **Node** `>=20 <21`; all packages `"type": "module"`.
- **Module boundaries (ADR-011):** `scope:app` may depend only on `scope:lib`; `scope:lib` only on `scope:lib`. Apps reach the backend **only** through `@playfusion/rest-client`. Tag every new package in its `package.json` `nx.tags` (`scope:lib`/`type:lib` for libs, `scope:app`/`type:app` for apps).
- **No business logic in the FE** (R6) — rest-client maps typed calls to HTTP and normalizes errors; nothing more.
- **Backend header contract:** organizer & coach both authenticate via `Authorization: Bearer <token>`; org scope via `x-organization-id`; correlation via `x-correlation-id`. Organizer role claim value is lowercase `organizer`.
- **Recycled Auth0 tenant:** domain `dev-c6din8ya.eu.auth0.com`, clientId `65atFepkIh2jiMeaDqZlqgD63ccd2Gw1`, audience `https://plafusionapi.it`, scope `openid profile email`, roles claim `https://plafusionapi.it/roles` (lowercase values), issuer `https://dev-c6din8ya.eu.auth0.com/`.
- **App base paths:** E1 served under `/e1/`, E3 under `/e3/` (CloudFront). Vite `base` must match.
- **Deploy scope:** this plan implements + verifies **locally** only (unit tests, `nx build`, `vite build`, local dev smoke). No `git push`, no `cdk deploy` — those are separately authorized.
- **New package registration:** every new `@playfusion/*` package must be added to `tsconfig.base.json` `paths` **and** `vitest.config.ts` `alias`, both pointing at `src/index.ts` (or the relevant entry), so boundary lint + tests resolve source.
- **Commits:** small, per-task, on branch `feature/s3-frontend-foundation`. Trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

```
libs/rest-client/                      (NEW · @playfusion/rest-client · scope:lib)
  package.json  tsconfig.json  vite-env.d.ts?(n/a)
  src/{index,errors,auth,http,types,client,o2,o3,o4,o5,o12}.ts
  test/{http,o3,o5,o2,client}.test.ts
libs/app-shell/                        (NEW · @playfusion/app-shell · scope:lib)
  package.json  tsconfig.json
  src/{index,chrome,router}.ts  src/chrome.css
  test/{chrome,router}.test.ts
libs/tokens/design/figma-export/tokens.json   (MODIFY — add fonts/radius-pill/surface-sunken/accent-hover)
libs/tokens/src/tokens.css                      (REGENERATE)
libs/tokens/src/lib/tokens.generated.ts         (REGENERATE)
apps/e1-web/                           (NEW · @playfusion/e1-web · scope:app)
  package.json  tsconfig.json  index.html  vite.config.ts  .env.example  src/vite-env.d.ts
  src/{main,config,router-setup}.ts  src/views/{dashboard,workspace}.ts  src/auth/auth0.ts
  test/{auth0-guard,dashboard}.test.ts
apps/e3-web/                           (NEW · @playfusion/e3-web · scope:app)
  package.json  tsconfig.json  index.html  vite.config.ts  .env.example  src/vite-env.d.ts
  src/{main,config}.ts  src/views/{landing,participants}.ts  src/auth/magic-link.ts
  test/magic-link.test.ts
infra/cdk/lib/api-stack.ts             (MODIFY — CORS)
infra/cdk/lib/hosting-stack.ts         (MODIFY — real dist + SPA fallback)
infra/cdk/env/stg.json                 (MODIFY — Auth0 issuer/audience/clientId/rolesClaim)
docs/runbooks/auth0-spa-e1.md          (NEW)
README.md                              (MODIFY — how to run e1/e3 locally)
```

---

### Task 1: `libs/rest-client` scaffold + errors + auth + http core

**Files:**
- Create: `libs/rest-client/package.json`, `libs/rest-client/tsconfig.json`, `libs/rest-client/src/index.ts`, `libs/rest-client/src/errors.ts`, `libs/rest-client/src/auth.ts`, `libs/rest-client/src/http.ts`
- Create test: `libs/rest-client/test/http.test.ts`
- Modify: `tsconfig.base.json` (add path), `vitest.config.ts` (add alias)

**Interfaces:**
- Produces:
  - `class RestError extends Error { status: number; code: string; body: unknown }`
  - `interface AuthHeader { name: string; value: string }`
  - `type AuthProvider = () => AuthHeader | null | Promise<AuthHeader | null>`
  - `const bearer: (token: string) => AuthHeader`
  - `interface HttpConfig { baseUrl: string; auth?: AuthProvider; orgId?: string; correlationId?: () => string; fetch?: typeof fetch }`
  - `function request<T>(cfg: HttpConfig, method: string, path: string, body?: unknown): Promise<T>`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@playfusion/rest-client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": { "types": "./src/index.ts", "import": "./src/index.ts", "default": "./src/index.ts" }, "./package.json": "./package.json" },
  "scripts": { "test": "vitest run", "lint": "eslint ." },
  "nx": { "tags": ["scope:lib", "type:lib"] }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "lib": ["ES2022", "DOM"], "noEmit": true }, "include": ["src", "test"] }
```

- [ ] **Step 3: Register the package** — add to `tsconfig.base.json` `paths`:
`"@playfusion/rest-client": ["libs/rest-client/src/index.ts"]`
and to `vitest.config.ts` `alias`:
`'@playfusion/rest-client': resolve(__dirname, 'libs/rest-client/src/index.ts'),`

- [ ] **Step 4: Write the failing test** — `libs/rest-client/test/http.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest'
import { request } from '../src/http'
import { RestError } from '../src/errors'
import { bearer } from '../src/auth'

const okJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('request()', () => {
  it('GETs the baseUrl+path and returns parsed JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson([{ sportEventId: 'e1' }]))
    const out = await request({ baseUrl: 'https://api/prod', fetch: fetchMock }, 'GET', '/o3/events')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o3/events')
    expect(init.method).toBe('GET')
    expect(out).toEqual([{ sportEventId: 'e1' }])
  })

  it('attaches auth, org and correlation headers and JSON body on POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ ok: true }, 201))
    await request(
      { baseUrl: 'https://api/prod', fetch: fetchMock, auth: () => bearer('tok'), orgId: 'org-x', correlationId: () => 'cid-1' },
      'POST', '/o3/events', { sport: 'calcio' },
    )
    const init = fetchMock.mock.calls[0][1]
    expect(init.headers['authorization']).toBe('Bearer tok')
    expect(init.headers['x-organization-id']).toBe('org-x')
    expect(init.headers['x-correlation-id']).toBe('cid-1')
    expect(init.headers['content-type']).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ sport: 'calcio' }))
  })

  it('throws RestError carrying status + backend code on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ error: 'EventNotFound' }, 404))
    await expect(request({ baseUrl: 'https://api/prod', fetch: fetchMock }, 'GET', '/o3/events/x'))
      .rejects.toMatchObject({ status: 404, code: 'EventNotFound' } satisfies Partial<RestError>)
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run libs/rest-client/test/http.test.ts`
Expected: FAIL — cannot resolve `../src/http` / `../src/errors` / `../src/auth`.

- [ ] **Step 6: Write `src/errors.ts`**

```ts
/** Normalized transport error. `code` reads the backend `{error|code}` body field
 *  (handlers emit one or the other), falling back to the HTTP status text. */
export class RestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly body: unknown) {
    super(message)
    this.name = 'RestError'
  }
}
```

- [ ] **Step 7: Write `src/auth.ts`**

```ts
/** A single header the client attaches to authenticated calls. */
export interface AuthHeader { name: string; value: string }
/** Resolves the auth header per call (E1: Auth0 access token; E3: coach magic-link).
 *  Returning null sends the request unauthenticated (public reads). */
export type AuthProvider = () => AuthHeader | null | Promise<AuthHeader | null>
/** Both organizer JWTs and coach magic-links travel as `Authorization: Bearer <token>`. */
export const bearer = (token: string): AuthHeader => ({ name: 'authorization', value: `Bearer ${token}` })
```

- [ ] **Step 8: Write `src/http.ts`**

```ts
import { RestError } from './errors.js'
import type { AuthProvider } from './auth.js'

export interface HttpConfig {
  baseUrl: string            // API Gateway stage root, e.g. https://<id>.execute-api.<region>.amazonaws.com/prod
  auth?: AuthProvider
  orgId?: string
  correlationId?: () => string
  fetch?: typeof fetch       // injectable for tests; defaults to global fetch
}

const genId = () => (globalThis.crypto?.randomUUID?.() ?? `cid-${Date.now()}`)

export async function request<T>(cfg: HttpConfig, method: string, path: string, body?: unknown): Promise<T> {
  const doFetch = cfg.fetch ?? fetch
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cfg.orgId) headers['x-organization-id'] = cfg.orgId
  headers['x-correlation-id'] = cfg.correlationId ? cfg.correlationId() : genId()
  const authHeader = cfg.auth ? await cfg.auth() : null
  if (authHeader) headers[authHeader.name] = authHeader.value

  const res = await doFetch(`${cfg.baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await res.text()
  const parsed: unknown = text ? safeJson(text) : undefined
  if (!res.ok) {
    const code = codeOf(parsed) ?? res.statusText ?? 'Error'
    throw new RestError(res.status, code, `${method} ${path} -> ${res.status} ${code}`, parsed)
  }
  return parsed as T
}

const safeJson = (t: string): unknown => { try { return JSON.parse(t) } catch { return t } }
const codeOf = (b: unknown): string | undefined => {
  if (b && typeof b === 'object') {
    const o = b as Record<string, unknown>
    if (typeof o.error === 'string') return o.error
    if (typeof o.code === 'string') return o.code
  }
  return undefined
}
```

- [ ] **Step 9: Write `src/index.ts` (partial — extended in Task 2)**

```ts
export * from './errors.js'
export * from './auth.js'
export * from './http.js'
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npx vitest run libs/rest-client/test/http.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 11: Commit**

```bash
git add libs/rest-client tsconfig.base.json vitest.config.ts
git commit -m "feat(s3.1): rest-client http core (request, RestError, auth)"
```

---

### Task 2: rest-client typed DTOs + per-BC modules + `createClient`

**Files:**
- Create: `libs/rest-client/src/types.ts`, `src/o3.ts`, `src/o5.ts`, `src/o2.ts`, `src/o4.ts`, `src/o12.ts`, `src/client.ts`
- Modify: `libs/rest-client/src/index.ts`
- Create test: `libs/rest-client/test/o3.test.ts`, `test/o5.test.ts`, `test/client.test.ts`

**Interfaces:**
- Consumes: `request`, `HttpConfig`, `AuthProvider` (Task 1).
- Produces:
  - DTOs in `types.ts` (see Step 1).
  - `function createClient(cfg: HttpConfig): Client` where
    `interface Client { o2: O2Api; o3: O3Api; o4: O4Api; o5: O5Api; o12: O12Api }`
  - `O3Api = { listEvents(): Promise<EventSummary[]>; getEvent(id: string): Promise<EventDetail>; createEvent(i: CreateEventInput): Promise<CreateEventResult> }`
  - `O5Api = { listRegistrations(eventId: string, state?: RegistrationStatus): Promise<RegistrationView[]>; getRegistrationWindow(eventId: string): Promise<RegistrationWindowView>; applyRegistration(i: ApplyRegistrationInput): Promise<RegistrationView>; confirmRegistration(id: string): Promise<RegistrationView>; rejectRegistration(id: string, reason: string): Promise<RegistrationView>; openRegistrationWindow(eventId: string, capacities?: Record<string, number>): Promise<{ sportEventId: string; state: string }> }`
  - `O2Api = { mintMagicLink(i: MagicLinkInput): Promise<MagicLinkResult>; verify(token: string): Promise<VerifyResult> }`
  - `O4Api = { createParticipant(i: CreateParticipantInput): Promise<{ participantId: string }> }`
  - `O12Api = { payFee(registrationId: string): Promise<unknown> }`

- [ ] **Step 1: Write `src/types.ts`** (mirrors the S1 read-models verbatim)

```ts
// o3 (services/o3-sport-events/src/read-model.ts + domain.ts)
export interface EventDetail {
  sportEventId: string
  sport: string
  categorie: string[]
  dates: { from: string; to: string }
  status: 'Published'
}
export type EventSummary = EventDetail
export interface CreateEventInput { sport: string; categorie: string[]; dates: { from: string; to: string } }
export interface CreateEventResult { sportEventId: string; status: 'Published' }

// o5 (services/o5-registration/src/domain/registration.ts + application/*)
export type RegistrationStatus = 'Applied' | 'Confirmed' | 'Rejected'
export interface RegistrationView {
  registrationId: string
  participantRef: string
  sportEventId: string
  categoria: string
  status: RegistrationStatus
}
export interface ApplyRegistrationInput { participantRef: string; sportEventId: string; categoria: string }
export interface CategoryCapacity { categoria: string; cap: number; count: number; remaining: number }
export interface RegistrationWindowView { sportEventId: string; state: 'Open' | 'Closed'; categories: CategoryCapacity[] }

// o2 (services/o2-identity-access/src/handler.ts)
export interface MagicLinkInput { contact: string; roles?: string[]; purpose?: string; ttlSeconds?: number }
export interface MagicLinkResult { subject: string; token: string }
export interface VerifyResult { subject: string; roles: string[]; organizationId?: string }

// o4 (services/o4-participant-management/src/handler.ts)
export interface CreateParticipantInput { name: string; [k: string]: unknown }
```

> Note for the implementer: open `services/o4-participant-management/src/handler.ts` and refine `CreateParticipantInput`/return to the actual body/response before finalizing; `o4` is a thin completeness stub for S3.

- [ ] **Step 2: Write the failing test** — `libs/rest-client/test/o3.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'

const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

describe('o3 api', () => {
  it('listEvents GETs /o3/events', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([{ sportEventId: 'e', sport: 's', categorie: [], dates: { from: 'a', to: 'b' }, status: 'Published' }]))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o3.listEvents()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o3/events')
    expect(out[0].sportEventId).toBe('e')
  })

  it('getEvent GETs /o3/events/:id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ sportEventId: 'e42', sport: 's', categorie: [], dates: { from: 'a', to: 'b' }, status: 'Published' }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o3.getEvent('e42')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o3/events/e42')
    expect(out.sportEventId).toBe('e42')
  })

  it('createEvent POSTs /o3/events with the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ sportEventId: 'new', status: 'Published' }, 201))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o3.createEvent({ sport: 'calcio', categorie: ['U10'], dates: { from: 'a', to: 'b' } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o3/events')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ sport: 'calcio', categorie: ['U10'], dates: { from: 'a', to: 'b' } })
  })
})
```

- [ ] **Step 3: Write `test/o5.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'
const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

describe('o5 api', () => {
  it('listRegistrations passes ?state= when given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([]))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o5.listRegistrations('ev1', 'Confirmed')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o5/events/ev1/registrations?state=Confirmed')
  })
  it('listRegistrations omits the query when no state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([]))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o5.listRegistrations('ev1')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o5/events/ev1/registrations')
  })
  it('confirmRegistration POSTs the confirm sub-path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ registrationId: 'r', participantRef: 'p', sportEventId: 'ev1', categoria: 'U10', status: 'Confirmed' }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o5.confirmRegistration('r')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o5/registrations/r/confirm')
    expect(out.status).toBe('Confirmed')
  })
  it('openRegistrationWindow POSTs the :open sub-path with capacities', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ sportEventId: 'ev1', state: 'Open' }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    await c.o5.openRegistrationWindow('ev1', { U10: 8 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api/prod/o5/events/ev1/registration-window:open')
    expect(JSON.parse(init.body)).toEqual({ capacities: { U10: 8 } })
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run libs/rest-client/test/o3.test.ts libs/rest-client/test/o5.test.ts`
Expected: FAIL — `../src/client` not found.

- [ ] **Step 5: Write `src/o3.ts`**

```ts
import { request, type HttpConfig } from './http.js'
import type { EventSummary, EventDetail, CreateEventInput, CreateEventResult } from './types.js'

export interface O3Api {
  listEvents(): Promise<EventSummary[]>
  getEvent(id: string): Promise<EventDetail>
  createEvent(input: CreateEventInput): Promise<CreateEventResult>
}
export const o3 = (cfg: HttpConfig): O3Api => ({
  listEvents: () => request(cfg, 'GET', '/o3/events'),
  getEvent: (id) => request(cfg, 'GET', `/o3/events/${encodeURIComponent(id)}`),
  createEvent: (input) => request(cfg, 'POST', '/o3/events', input),
})
```

- [ ] **Step 6: Write `src/o5.ts`**

```ts
import { request, type HttpConfig } from './http.js'
import type { RegistrationStatus, RegistrationView, ApplyRegistrationInput, RegistrationWindowView } from './types.js'

export interface O5Api {
  listRegistrations(eventId: string, state?: RegistrationStatus): Promise<RegistrationView[]>
  getRegistrationWindow(eventId: string): Promise<RegistrationWindowView>
  applyRegistration(input: ApplyRegistrationInput): Promise<RegistrationView>
  confirmRegistration(id: string): Promise<RegistrationView>
  rejectRegistration(id: string, reason: string): Promise<RegistrationView>
  openRegistrationWindow(eventId: string, capacities?: Record<string, number>): Promise<{ sportEventId: string; state: string }>
}
export const o5 = (cfg: HttpConfig): O5Api => ({
  listRegistrations: (eventId, state) =>
    request(cfg, 'GET', `/o5/events/${encodeURIComponent(eventId)}/registrations${state ? `?state=${state}` : ''}`),
  getRegistrationWindow: (eventId) =>
    request(cfg, 'GET', `/o5/events/${encodeURIComponent(eventId)}/registration-window`),
  applyRegistration: (input) => request(cfg, 'POST', '/o5/registrations', input),
  confirmRegistration: (id) => request(cfg, 'POST', `/o5/registrations/${encodeURIComponent(id)}/confirm`),
  rejectRegistration: (id, reason) => request(cfg, 'POST', `/o5/registrations/${encodeURIComponent(id)}/reject`, { reason }),
  openRegistrationWindow: (eventId, capacities) =>
    request(cfg, 'POST', `/o5/events/${encodeURIComponent(eventId)}/registration-window:open`, capacities ? { capacities } : {}),
})
```

- [ ] **Step 7: Write `src/o2.ts`, `src/o4.ts`, `src/o12.ts`**

```ts
// src/o2.ts
import { request, type HttpConfig } from './http.js'
import type { MagicLinkInput, MagicLinkResult, VerifyResult } from './types.js'
export interface O2Api {
  mintMagicLink(input: MagicLinkInput): Promise<MagicLinkResult>
  verify(token: string): Promise<VerifyResult>
}
export const o2 = (cfg: HttpConfig): O2Api => ({
  mintMagicLink: (input) => request(cfg, 'POST', '/o2/identities/magic-link', input),
  // GET /o2/identities/verify reads the Authorization header; pass the token as a one-shot auth override.
  verify: (token) => request({ ...cfg, auth: () => ({ name: 'authorization', value: `Bearer ${token}` }) }, 'GET', '/o2/identities/verify'),
})
```

```ts
// src/o4.ts
import { request, type HttpConfig } from './http.js'
import type { CreateParticipantInput } from './types.js'
export interface O4Api { createParticipant(input: CreateParticipantInput): Promise<{ participantId: string }> }
export const o4 = (cfg: HttpConfig): O4Api => ({
  createParticipant: (input) => request(cfg, 'POST', '/o4/participants', input),
})
```

```ts
// src/o12.ts
import { request, type HttpConfig } from './http.js'
export interface O12Api { payFee(registrationId: string): Promise<unknown> }
export const o12 = (cfg: HttpConfig): O12Api => ({
  payFee: (registrationId) => request(cfg, 'POST', `/o12/payments/${encodeURIComponent(registrationId)}/pay`),
})
```

- [ ] **Step 8: Write `src/client.ts`**

```ts
import type { HttpConfig } from './http.js'
import { o2, type O2Api } from './o2.js'
import { o3, type O3Api } from './o3.js'
import { o4, type O4Api } from './o4.js'
import { o5, type O5Api } from './o5.js'
import { o12, type O12Api } from './o12.js'

export interface Client { o2: O2Api; o3: O3Api; o4: O4Api; o5: O5Api; o12: O12Api }

/** The single FE->backend seam (ADR-008). `cfg.baseUrl` is the API Gateway stage root;
 *  each BC method prefixes its own /o<n> route. */
export function createClient(cfg: HttpConfig): Client {
  return { o2: o2(cfg), o3: o3(cfg), o4: o4(cfg), o5: o5(cfg), o12: o12(cfg) }
}
```

- [ ] **Step 9: Extend `src/index.ts`**

```ts
export * from './errors.js'
export * from './auth.js'
export * from './http.js'
export * from './types.js'
export * from './client.js'
export type { O2Api } from './o2.js'
export type { O3Api } from './o3.js'
export type { O4Api } from './o4.js'
export type { O5Api } from './o5.js'
export type { O12Api } from './o12.js'
```

- [ ] **Step 10: Write `test/client.test.ts`** (verify auth override on o2.verify)

```ts
import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'
const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

it('o2.verify sends the passed token as bearer, ignoring the client auth', async () => {
  const fetchMock = vi.fn().mockResolvedValue(res({ subject: 's', roles: [] }))
  const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock, auth: () => ({ name: 'authorization', value: 'Bearer client-token' }) })
  await c.o2.verify('link-token')
  expect(fetchMock.mock.calls[0][1].headers['authorization']).toBe('Bearer link-token')
})
```

- [ ] **Step 11: Run all rest-client tests to verify they pass**

Run: `npx vitest run libs/rest-client`
Expected: PASS (all files).

- [ ] **Step 12: Commit**

```bash
git add libs/rest-client
git commit -m "feat(s3.1): typed per-BC rest-client (o2/o3/o4/o5/o12) + createClient"
```

---

### Task 3: `libs/tokens` reconciliation — add the design primitives the chrome needs

**Files:**
- Modify: `libs/tokens/design/figma-export/tokens.json`
- Regenerate: `libs/tokens/src/tokens.css`, `libs/tokens/src/lib/tokens.generated.ts`

**Interfaces:**
- Produces new CSS custom properties consumed by `app-shell/chrome.css` (Task 4):
  `--font-display`, `--font-sans`, `--font-mono`, `--radius-pill`, `--color-surface-sunken`, `--color-action-accent-hover`.
  (Existing PS-B names — `--color-text-default`, `--color-surface-default`, `--color-border-default`, `--color-feedback-success`, `--color-hero-gradient-from/to`, `--space-xs..2xl`, `--shadow-md` — are reused as-is; chrome.css references those, so `libs/ui` tokens are untouched.)

- [ ] **Step 1: Add tokens to `libs/tokens/design/figma-export/tokens.json`**

Under `color.action` add:
```json
"accent-hover": { "value": "#e35f00", "type": "color" }
```
Under `color.surface` add:
```json
"sunken": { "value": "#eef2f8", "type": "color" }
```
Under `radius` add:
```json
"pill": { "value": "999px", "type": "borderRadius" }
```
Add a top-level `font` set (and add `"font"` to `$metadata.tokenSetOrder`):
```json
"font": {
  "display": { "value": "'Archivo Variable', system-ui, sans-serif", "type": "fontFamilies" },
  "sans": { "value": "'Hanken Grotesk Variable', system-ui, sans-serif", "type": "fontFamilies" },
  "mono": { "value": "'Spline Sans Mono Variable', ui-monospace, 'SF Mono', monospace", "type": "fontFamilies" }
}
```

- [ ] **Step 2: Regenerate the tokens**

Run: `npm run tokens:build -w @playfusion/tokens`
Expected: exits 0; `src/tokens.css` now contains `--font-display`, `--font-sans`, `--font-mono`, `--radius-pill`, `--color-surface-sunken`, `--color-action-accent-hover`.

- [ ] **Step 3: Verify no existing token was lost**

Run: `grep -E "\-\-color-text-default|\-\-space-md|\-\-shadow-md" libs/tokens/src/tokens.css`
Expected: all three still present (libs/ui consumers unaffected).

- [ ] **Step 4: Verify libs/ui still builds/tests against regenerated tokens**

Run: `npx vitest run libs/ui`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/tokens/design/figma-export/tokens.json libs/tokens/src/tokens.css libs/tokens/src/lib/tokens.generated.ts
git commit -m "feat(s3.2): extend PS-B tokens with typography + chrome primitives"
```

---

### Task 4: `libs/app-shell` — chrome (ported from mockups) + hash router

**Files:**
- Create: `libs/app-shell/package.json`, `tsconfig.json`, `src/index.ts`, `src/chrome.ts`, `src/router.ts`, `src/chrome.css`
- Create test: `libs/app-shell/test/chrome.test.ts`, `test/router.test.ts`
- Modify: `tsconfig.base.json` (path), `vitest.config.ts` (alias)

**Interfaces:**
- Consumes: nothing from earlier tasks (styling relies on Task 3 tokens at runtime).
- Produces:
  - `renderOrganizerTopbar(active: string): string`
  - `renderOrganizerWorkspace(input: { name: string; meta: string; phaseLabel?: string; phaseMod?: 'prep'|'live'|'done' }, tabs: Array<{ key: string; label: string; href: string }>, activeKey: string): string`
  - `renderPublicTopbar(brandHtml?: string): string`
  - `renderCategoryTag(name: string, count: number, maxTeams: number): string`
  - `class HashRouter { on(pattern: string, handler: (params: Record<string,string>) => void): this; start(): void; go(path: string): void }`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@playfusion/app-shell",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": { "types": "./src/index.ts", "import": "./src/index.ts", "default": "./src/index.ts" },
    "./chrome.css": "./src/chrome.css",
    "./package.json": "./package.json"
  },
  "scripts": { "test": "vitest run", "lint": "eslint ." },
  "dependencies": { "@playfusion/tokens": "*", "@playfusion/ui": "*" },
  "nx": { "tags": ["scope:lib", "type:lib"] }
}
```

- [ ] **Step 2: Write `tsconfig.json`** (same shape as Task 1 Step 2, `include: ["src", "test"]`, `lib: ["ES2022","DOM","DOM.Iterable"]`).

- [ ] **Step 3: Register the package** — `tsconfig.base.json` path `"@playfusion/app-shell": ["libs/app-shell/src/index.ts"]`; `vitest.config.ts` alias `'@playfusion/app-shell': resolve(__dirname, 'libs/app-shell/src/index.ts')`.

- [ ] **Step 4: Write the failing test** — `libs/app-shell/test/chrome.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { renderOrganizerTopbar, renderOrganizerWorkspace, renderPublicTopbar, renderCategoryTag } from '../src/chrome'

describe('chrome', () => {
  it('organizer topbar marks the active nav item', () => {
    const html = renderOrganizerTopbar('dashboard')
    expect(html).toContain('class="pf-topbar"')
    expect(html).toMatch(/aria-current="page"/)
  })
  it('workspace renders the event name, phase and every tab, marking the active one', () => {
    const html = renderOrganizerWorkspace(
      { name: 'Torneo X', meta: 'calcio · Roma', phaseLabel: 'In corso', phaseMod: 'live' },
      [{ key: 'overview', label: 'Panoramica', href: '#/events/e1' }, { key: 'enroll', label: 'Iscrizioni', href: '#/events/e1/enroll' }],
      'overview',
    )
    expect(html).toContain('Torneo X')
    expect(html).toContain('pf-wphase--live')
    expect(html).toContain('Panoramica')
    expect(html).toContain('Iscrizioni')
    expect(html).toContain('pf-wtab--active')
  })
  it('public topbar accepts a brand override', () => {
    expect(renderPublicTopbar('<b>ACME</b>')).toContain('ACME')
  })
  it('category tag shows count/max and a full modifier when at capacity', () => {
    expect(renderCategoryTag('U10', 8, 8)).toContain('pf-cat--full')
    expect(renderCategoryTag('U12', 2, 8)).toContain('2/8')
  })
})
```

- [ ] **Step 5: Write `test/router.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HashRouter } from '../src/router'

beforeEach(() => { window.location.hash = '' })

describe('HashRouter', () => {
  it('dispatches the matching route with extracted params', () => {
    const spy = vi.fn()
    const r = new HashRouter().on('#/events/:id', spy).on('#/', () => {})
    r.start()
    window.location.hash = '#/events/abc'
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(spy).toHaveBeenCalledWith({ id: 'abc' })
  })
  it('falls back to #/ when nothing matches', () => {
    const home = vi.fn()
    const r = new HashRouter().on('#/', home)
    r.start() // hash '' normalizes to '#/'
    expect(home).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run libs/app-shell`
Expected: FAIL — `../src/chrome` / `../src/router` not found.

- [ ] **Step 7: Write `src/router.ts`**

```ts
type Handler = (params: Record<string, string>) => void
interface Route { pattern: string; keys: string[]; regex: RegExp; handler: Handler }

/** ~40-line hash router shared by both SPAs. Patterns look like '#/events/:id'.
 *  No framework (YAGNI). Falls back to '#/' when no route matches. */
export class HashRouter {
  private routes: Route[] = []
  on(pattern: string, handler: Handler): this {
    const keys: string[] = []
    const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)' }) + '$')
    this.routes.push({ pattern, keys, regex, handler })
    return this
  }
  private resolve(): void {
    const hash = window.location.hash || '#/'
    for (const r of this.routes) {
      const m = hash.match(r.regex)
      if (m) { r.handler(Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]))); return }
    }
    const home = this.routes.find((r) => r.pattern === '#/')
    home?.handler({})
  }
  start(): void { window.addEventListener('hashchange', () => this.resolve()); this.resolve() }
  go(path: string): void { window.location.hash = path }
}
```

- [ ] **Step 8: Write `src/chrome.ts`** (render helpers trimmed from `mockups/shared/chrome.ts`; no mock-store deps)

```ts
const brand = (label: string, sub?: string) =>
  `<a class="pf-brand" href="#/">play<b>fusion</b>${sub ? `<small>${sub}</small>` : ''}</a>`.replace('</a>', label && sub ? '</a>' : '</a>')

export function renderOrganizerTopbar(active: string): string {
  const link = (href: string, label: string, key: string) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`
  return `<header class="pf-topbar">
    <a class="pf-brand" href="#/">play<b>fusion</b><small>Organizer</small></a>
    <nav>${link('#/', 'Eventi', 'dashboard')}</nav>
  </header>`
}

export interface WorkspaceHeader { name: string; meta: string; phaseLabel?: string; phaseMod?: 'prep' | 'live' | 'done' }
export interface WorkspaceTab { key: string; label: string; href: string }

export function renderOrganizerWorkspace(h: WorkspaceHeader, tabs: WorkspaceTab[], activeKey: string): string {
  const phase = h.phaseLabel ? `<span class="pf-wphase pf-wphase--${h.phaseMod ?? 'prep'}">${h.phaseLabel}</span>` : ''
  const nav = tabs.map((t) => `<a class="pf-wtab${t.key === activeKey ? ' pf-wtab--active' : ''}" href="${t.href}">${t.label}</a>`).join('')
  return `<div class="pf-whero">
    <div class="pf-whero__inner">${phase}<h1>${h.name}</h1><div class="pf-mono pf-muted">${h.meta}</div></div>
    <nav class="pf-wtabs">${nav}</nav>
  </div>`
}

export function renderPublicTopbar(brandHtml?: string): string {
  return `<header class="pf-publicbar"><a class="pf-brand" href="#/">${brandHtml ?? 'play<b>fusion</b>'}</a></header>`
}

export function renderCategoryTag(name: string, count: number, maxTeams: number): string {
  const full = count >= maxTeams
  const pct = maxTeams > 0 ? Math.min(100, Math.round((count / maxTeams) * 100)) : 0
  return `<li class="pf-cat${full ? ' pf-cat--full' : ''}">
    <span class="pf-cat__label">${name}</span>
    <div class="pf-cat__body">
      <div class="pf-cat__cap">${count}/${maxTeams} squadre${full ? ' · completa' : ''}</div>
      <div class="pf-cat__bar"><i style="width:${pct}%"></i></div>
    </div>
  </li>`
}
```

> Remove the stray `brand()` helper above if unused — keep the file to the four exported functions. (It is illustrative; the exported functions inline their own brand markup.)

- [ ] **Step 9: Write `src/chrome.css`** — port the chrome classes from `mockups/shared/ui.css` **verbatim except for the token-name substitutions in the table below**. Copy the base reset (lines ~1–21) and these selector blocks: `.pf-container`, `.pf-container--narrow`, `.pf-topbar`, `.pf-brand` (+ `b`, `small`), `.pf-topbar nav` (+ `a`, hover, `[aria-current]`), `.pf-pagehead`, `.pf-eyebrow` (+ `::before`), `.pf-card` (+ `--link`, hover), `.pf-btn` (+ `--primary`, `--ghost`, `--lg`, disabled), `.pf-catlist`, `.pf-cat` (+ `__label`, `__body`, `__cap`, `__bar`, `--full`), `.pf-publicbar`, `.pf-hero` (+ `__inner`, `h1`, `__meta`), `.pf-muted`, `.pf-mono`, `.pf-row`, `.pf-stack`, `.pf-whero` (+ `__inner`, `h1`), `.pf-wphase` (+ `--prep`, `--live`, `--done`), `.pf-wtabs`, `.pf-wtab` (+ `--active`).

  **Token substitution map (apply to every ported line):**

  | mockup var | → PS-B var |
  | --- | --- |
  | `--color-text` | `--color-text-default` |
  | `--color-surface` | `--color-surface-default` |
  | `--color-bg` | `--color-surface-bg` |
  | `--color-border` | `--color-border-default` |
  | `--color-success` | `--color-feedback-success` |
  | `--color-hero-from` | `--color-hero-gradient-from` |
  | `--color-hero-to` | `--color-hero-gradient-to` |
  | `--space-1` | `--space-xs` |
  | `--space-2` | `--space-sm` |
  | `--space-3` | `12px` (no PS-B token — inline literal) |
  | `--space-4` | `--space-md` |
  | `--space-5` | `--space-lg` |
  | `--space-6` | `--space-xl` |
  | `--space-8` | `--space-2xl` |
  | `--radius-1` | `--radius-md` |
  | `--radius-2` | `8px` (inline literal) |
  | `--shadow-2` | `--shadow-md` |

  Unchanged (already emitted by Task 3 / already in PS-B): `--color-surface-sunken`, `--color-action-accent-hover`, `--color-text-muted`, `--color-text-soft`, `--color-border-strong`, `--color-action-primary`, `--color-action-primary-hover`, `--color-action-accent`, `--radius-pill`, `--font-display`, `--font-sans`, `--font-mono`.

  End the file's base rules with `body { font-family: var(--font-sans); color: var(--color-text-default); background: var(--color-surface-bg); margin: 0; }` and `.pf-mono { font-family: var(--font-mono); }` if not already ported.

- [ ] **Step 10: Write `src/index.ts`**

```ts
export * from './chrome.js'
export * from './router.js'
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `npx vitest run libs/app-shell`
Expected: PASS (chrome + router).

- [ ] **Step 12: Commit**

```bash
git add libs/app-shell tsconfig.base.json vitest.config.ts
git commit -m "feat(s3.2): app-shell chrome (ported from mockups) + hash router"
```

---

### Task 5: `apps/e1-web` shell — dashboard + workspace (no auth yet)

**Files:**
- Create: `apps/e1-web/package.json`, `tsconfig.json`, `index.html`, `vite.config.ts`, `.env.example`, `src/vite-env.d.ts`, `src/config.ts`, `src/main.ts`, `src/views/dashboard.ts`, `src/views/workspace.ts`
- Create test: `apps/e1-web/test/dashboard.test.ts`

**Interfaces:**
- Consumes: `createClient`, `EventSummary`, `EventDetail` (rest-client); `renderOrganizerTopbar`, `renderOrganizerWorkspace`, `HashRouter` (app-shell); `@playfusion/tokens/tokens.css`, `@playfusion/app-shell/chrome.css`, `@playfusion/ui`.
- Produces: `renderDashboard(events: EventSummary[]): string`, `renderWorkspace(event: EventDetail, activeTab: string): string`, `readConfig(env): AppConfig` where `interface AppConfig { apiBaseUrl: string; orgId: string; auth0?: { domain: string; clientId: string; audience: string } }`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@playfusion/e1-web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "serve": "vite", "build": "vite build", "test": "vitest run", "lint": "eslint ." },
  "dependencies": {
    "@playfusion/tokens": "*", "@playfusion/ui": "*",
    "@playfusion/app-shell": "*", "@playfusion/rest-client": "*",
    "@auth0/auth0-spa-js": "^2.1.3"
  },
  "devDependencies": { "vite": "^7.0.0" },
  "nx": { "tags": ["scope:app", "type:app"] }
}
```

- [ ] **Step 2: Install the new dependency**

Run: `npm install` (root) — resolves `@auth0/auth0-spa-js` into the workspace.
Expected: exits 0; `@auth0/auth0-spa-js` present in `node_modules`.

- [ ] **Step 3: Write `tsconfig.json`** (like sample-web: extends base, `lib: ["ES2022","DOM","DOM.Iterable"]`, `types: ["vite/client"]`, `noEmit: true`, `include: ["src","test","vite.config.ts"]`).

- [ ] **Step 4: Write `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_DEFAULT_ORG_ID?: string
  readonly VITE_AUTH0_DOMAIN?: string
  readonly VITE_AUTH0_CLIENT_ID?: string
  readonly VITE_AUTH0_AUDIENCE?: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
```

- [ ] **Step 5: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
export default defineConfig({ root: __dirname, base: '/e1/', build: { outDir: 'dist', emptyOutDir: true } })
```

- [ ] **Step 6: Write `index.html`**

```html
<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PlayFusion — Organizer</title>
  </head>
  <body><div id="app"></div><script type="module" src="/src/main.ts"></script></body>
</html>
```

- [ ] **Step 7: Write `.env.example`**

```
VITE_API_BASE_URL=http://localhost:3000
VITE_DEFAULT_ORG_ID=org-pilot
VITE_AUTH0_DOMAIN=dev-c6din8ya.eu.auth0.com
VITE_AUTH0_CLIENT_ID=65atFepkIh2jiMeaDqZlqgD63ccd2Gw1
VITE_AUTH0_AUDIENCE=https://plafusionapi.it
```

- [ ] **Step 8: Write the failing test** — `apps/e1-web/test/dashboard.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { renderDashboard } from '../src/views/dashboard'
import { renderWorkspace } from '../src/views/workspace'

const ev = { sportEventId: 'e1', sport: 'calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-02' }, status: 'Published' as const }

describe('e1 views', () => {
  it('dashboard lists each event with a link to its workspace', () => {
    const html = renderDashboard([ev])
    expect(html).toContain('calcio')
    expect(html).toContain('#/events/e1')
  })
  it('dashboard shows an empty-state when there are no events', () => {
    expect(renderDashboard([])).toMatch(/Nessun torneo/i)
  })
  it('workspace renders the chrome hero + a placeholder tab body', () => {
    const html = renderWorkspace(ev, 'overview')
    expect(html).toContain('pf-whero')
    expect(html).toMatch(/S4/) // "arriving in S4+" placeholder
  })
})
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `npx vitest run apps/e1-web`
Expected: FAIL — view modules not found.

- [ ] **Step 10: Write `src/config.ts`**

```ts
export interface AppConfig {
  apiBaseUrl: string
  orgId: string
  auth0?: { domain: string; clientId: string; audience: string }
}
export function readConfig(env: ImportMetaEnv): AppConfig {
  const apiBaseUrl = env.VITE_API_BASE_URL ?? ''
  const orgId = env.VITE_DEFAULT_ORG_ID ?? 'org-pilot'
  const auth0 = env.VITE_AUTH0_DOMAIN && env.VITE_AUTH0_CLIENT_ID && env.VITE_AUTH0_AUDIENCE
    ? { domain: env.VITE_AUTH0_DOMAIN, clientId: env.VITE_AUTH0_CLIENT_ID, audience: env.VITE_AUTH0_AUDIENCE }
    : undefined
  return { apiBaseUrl, orgId, auth0 }
}
```

- [ ] **Step 11: Write `src/views/dashboard.ts`**

```ts
import type { EventSummary } from '@playfusion/rest-client'
import { renderOrganizerTopbar } from '@playfusion/app-shell'

export function renderDashboard(events: EventSummary[]): string {
  const cards = events.length
    ? events.map((e) => `<a class="pf-card pf-card--link" style="display:block;text-decoration:none;color:inherit" href="#/events/${e.sportEventId}">
        <div class="pf-eyebrow">${e.sport}</div>
        <h2 style="margin:6px 0 10px">${e.sport} · ${e.categorie.join(', ')}</h2>
        <div class="pf-mono">${e.dates.from} → ${e.dates.to}</div>
      </a>`).join('')
    : `<div class="pf-card pf-muted">Nessun torneo ancora.</div>`
  return `${renderOrganizerTopbar('dashboard')}
    <main class="pf-container">
      <div class="pf-pagehead"><div class="pf-eyebrow">Stagione 2026</div><h1>I tuoi tornei</h1></div>
      <div class="pf-stack">${cards}</div>
    </main>`
}
```

- [ ] **Step 12: Write `src/views/workspace.ts`**

```ts
import type { EventDetail } from '@playfusion/rest-client'
import { renderOrganizerWorkspace, type WorkspaceTab } from '@playfusion/app-shell'

const TABS = (id: string): WorkspaceTab[] => [
  { key: 'overview', label: 'Panoramica', href: `#/events/${id}` },
  { key: 'enroll', label: 'Iscrizioni', href: `#/events/${id}/enroll` },
]

export function renderWorkspace(event: EventDetail, activeTab: string): string {
  const hero = renderOrganizerWorkspace(
    { name: `${event.sport} · ${event.categorie.join(', ')}`, meta: `${event.sport} · ${event.dates.from}→${event.dates.to}` },
    TABS(event.sportEventId), activeTab,
  )
  return `${hero}
    <main class="pf-container">
      <div class="pf-card pf-muted">Questa sezione arriva in S4+ (schermate feature).</div>
    </main>`
}
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `npx vitest run apps/e1-web`
Expected: PASS.

- [ ] **Step 14: Write `src/main.ts`** (wires styles + router + rest-client; auth added in Task 6)

```ts
import '@playfusion/tokens/tokens.css'
import '@playfusion/app-shell/chrome.css'
import '@playfusion/ui'
import { HashRouter } from '@playfusion/app-shell'
import { createClient } from '@playfusion/rest-client'
import { readConfig } from './config.js'
import { renderDashboard } from './views/dashboard.js'
import { renderWorkspace } from './views/workspace.js'

const cfg = readConfig(import.meta.env)
const app = document.getElementById('app')!
const client = createClient({ baseUrl: cfg.apiBaseUrl, orgId: cfg.orgId })

new HashRouter()
  .on('#/', async () => { app.innerHTML = renderDashboard(await client.o3.listEvents()) })
  .on('#/events/:id', async ({ id }) => { app.innerHTML = renderWorkspace(await client.o3.getEvent(id), 'overview') })
  .start()
```

- [ ] **Step 15: Verify the app builds**

Run: `npm run build -w @playfusion/e1-web`
Expected: exits 0; `apps/e1-web/dist/` produced.

- [ ] **Step 16: Commit**

```bash
git add apps/e1-web package-lock.json package.json
git commit -m "feat(s3.2): E1 organizer shell (dashboard + workspace) on PS-B"
```

---

### Task 6: `apps/e1-web` Auth0 wiring — login gate + token → rest-client

**Files:**
- Create: `apps/e1-web/src/auth/auth0.ts`
- Modify: `apps/e1-web/src/main.ts`
- Create test: `apps/e1-web/test/auth0-guard.test.ts`

**Interfaces:**
- Consumes: `AppConfig` (Task 5), `AuthProvider`/`bearer` (rest-client), `@auth0/auth0-spa-js`.
- Produces:
  - `interface Auth0Port { isAuthenticated(): Promise<boolean>; handleRedirectCallback(): Promise<void>; loginWithRedirect(): Promise<void>; logout(): Promise<void>; getToken(): Promise<string>; getOrgId(): Promise<string | undefined> }`
  - `function createAuth0Adapter(cfg: NonNullable<AppConfig['auth0']>): Auth0Port` (wraps the SDK)
  - `async function ensureAuthenticated(port: Auth0Port): Promise<boolean>` — runs the guard state machine; returns true when the app may render.
  - `function authProviderFrom(port: Auth0Port): AuthProvider`

- [ ] **Step 1: Write the failing test** — `apps/e1-web/test/auth0-guard.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest'
import { ensureAuthenticated, authProviderFrom, type Auth0Port } from '../src/auth/auth0'

const port = (over: Partial<Auth0Port>): Auth0Port => ({
  isAuthenticated: vi.fn().mockResolvedValue(false),
  handleRedirectCallback: vi.fn().mockResolvedValue(undefined),
  loginWithRedirect: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  getToken: vi.fn().mockResolvedValue('access-token'),
  getOrgId: vi.fn().mockResolvedValue('org-9'),
  ...over,
})

describe('E1 auth guard', () => {
  it('redirects to login when unauthenticated and returns false', async () => {
    const p = port({ isAuthenticated: vi.fn().mockResolvedValue(false) })
    const ok = await ensureAuthenticated(p)
    expect(p.loginWithRedirect).toHaveBeenCalled()
    expect(ok).toBe(false)
  })
  it('returns true and does not redirect when already authenticated', async () => {
    const p = port({ isAuthenticated: vi.fn().mockResolvedValue(true) })
    const ok = await ensureAuthenticated(p)
    expect(p.loginWithRedirect).not.toHaveBeenCalled()
    expect(ok).toBe(true)
  })
  it('handles the redirect callback when ?code&state are present', async () => {
    const search = '?code=abc&state=xyz'
    const p = port({ isAuthenticated: vi.fn().mockResolvedValue(true) })
    await ensureAuthenticated(p, search)
    expect(p.handleRedirectCallback).toHaveBeenCalled()
  })
  it('authProvider yields a Bearer header from the port token', async () => {
    const p = port({})
    const header = await authProviderFrom(p)()
    expect(header).toEqual({ name: 'authorization', value: 'Bearer access-token' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/e1-web/test/auth0-guard.test.ts`
Expected: FAIL — `../src/auth/auth0` not found.

- [ ] **Step 3: Write `src/auth/auth0.ts`**

```ts
import { createAuth0Client, type Auth0Client } from '@auth0/auth0-spa-js'
import type { AuthProvider } from '@playfusion/rest-client'
import type { AppConfig } from '../config.js'

export interface Auth0Port {
  isAuthenticated(): Promise<boolean>
  handleRedirectCallback(): Promise<void>
  loginWithRedirect(): Promise<void>
  logout(): Promise<void>
  getToken(): Promise<string>
  getOrgId(): Promise<string | undefined>
}

const ORG_CLAIM = 'org_id'

/** Wraps @auth0/auth0-spa-js behind Auth0Port so the guard is unit-testable with a fake. */
export function createAuth0Adapter(cfg: NonNullable<AppConfig['auth0']>): Auth0Port {
  let clientP: Promise<Auth0Client> | null = null
  const redirectUri = `${window.location.origin}/e1/`
  const client = () => (clientP ??= createAuth0Client({
    domain: cfg.domain,
    clientId: cfg.clientId,
    authorizationParams: { redirect_uri: redirectUri, audience: cfg.audience, scope: 'openid profile email' },
    cacheLocation: 'localstorage',
  }))
  return {
    isAuthenticated: async () => (await client()).isAuthenticated(),
    handleRedirectCallback: async () => { await (await client()).handleRedirectCallback(); window.history.replaceState({}, '', '/e1/') },
    loginWithRedirect: async () => (await client()).loginWithRedirect(),
    logout: async () => (await client()).logout({ logoutParams: { returnTo: redirectUri } }),
    getToken: async () => (await client()).getTokenSilently(),
    getOrgId: async () => { const u = await (await client()).getUser(); return (u as Record<string, unknown> | undefined)?.[ORG_CLAIM] as string | undefined },
  }
}

/** Guard state machine. Consumes the redirect callback when returning from Auth0, then
 *  gates on authentication, kicking off login when absent. Returns whether to render. */
export async function ensureAuthenticated(port: Auth0Port, search = window.location.search): Promise<boolean> {
  const params = new URLSearchParams(search)
  if (params.has('code') && params.has('state')) await port.handleRedirectCallback()
  if (await port.isAuthenticated()) return true
  await port.loginWithRedirect()
  return false
}

export const authProviderFrom = (port: Auth0Port): AuthProvider => async () => ({ name: 'authorization', value: `Bearer ${await port.getToken()}` })
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/e1-web/test/auth0-guard.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the guard into `src/main.ts`** — replace the client construction + router start with:

```ts
import '@playfusion/tokens/tokens.css'
import '@playfusion/app-shell/chrome.css'
import '@playfusion/ui'
import { HashRouter } from '@playfusion/app-shell'
import { createClient } from '@playfusion/rest-client'
import { readConfig } from './config.js'
import { renderDashboard } from './views/dashboard.js'
import { renderWorkspace } from './views/workspace.js'
import { createAuth0Adapter, ensureAuthenticated, authProviderFrom } from './auth/auth0.js'

const cfg = readConfig(import.meta.env)
const app = document.getElementById('app')!

async function boot() {
  if (!cfg.auth0) { app.innerHTML = '<main class="pf-container"><div class="pf-card">Config Auth0 mancante (VITE_AUTH0_*).</div></main>'; return }
  const port = createAuth0Adapter(cfg.auth0)
  if (!(await ensureAuthenticated(port))) return // redirecting to Auth0
  const orgId = (await port.getOrgId()) ?? cfg.orgId
  const client = createClient({ baseUrl: cfg.apiBaseUrl, orgId, auth: authProviderFrom(port) })
  new HashRouter()
    .on('#/', async () => { app.innerHTML = renderDashboard(await client.o3.listEvents()) })
    .on('#/events/:id', async ({ id }) => { app.innerHTML = renderWorkspace(await client.o3.getEvent(id), 'overview') })
    .start()
}
boot()
```

- [ ] **Step 6: Verify build + full app test suite**

Run: `npm run build -w @playfusion/e1-web && npx vitest run apps/e1-web`
Expected: both exit 0 / PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/e1-web
git commit -m "feat(s3.4): E1 Auth0 login gate + access-token into rest-client"
```

---

### Task 7: `apps/e3-web` shell — public landing + participants

**Files:**
- Create: `apps/e3-web/package.json`, `tsconfig.json`, `index.html`, `vite.config.ts`, `.env.example`, `src/vite-env.d.ts`, `src/config.ts`, `src/main.ts`, `src/views/landing.ts`, `src/views/participants.ts`
- Create test: `apps/e3-web/test/landing.test.ts`

**Interfaces:**
- Consumes: `createClient`, `EventDetail`, `RegistrationView`, `RegistrationWindowView` (rest-client); `renderPublicTopbar`, `renderCategoryTag`, `HashRouter` (app-shell).
- Produces: `renderLanding(event: EventDetail, window: RegistrationWindowView): string`, `renderParticipants(rows: RegistrationView[]): string`, `readConfig(env): { apiBaseUrl: string }`.

- [ ] **Step 1: Write `package.json`** (no Auth0 dep)

```json
{
  "name": "@playfusion/e3-web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": { "serve": "vite", "build": "vite build", "test": "vitest run", "lint": "eslint ." },
  "dependencies": { "@playfusion/tokens": "*", "@playfusion/ui": "*", "@playfusion/app-shell": "*", "@playfusion/rest-client": "*" },
  "devDependencies": { "vite": "^7.0.0" },
  "nx": { "tags": ["scope:app", "type:app"] }
}
```

- [ ] **Step 2: Write `tsconfig.json`, `src/vite-env.d.ts` (only `VITE_API_BASE_URL`), `vite.config.ts` (`base: '/e3/'`), `index.html` (title "PlayFusion", `#app`), `.env.example` (`VITE_API_BASE_URL=http://localhost:3000`)** — mirror Task 5 shapes.

- [ ] **Step 3: Write the failing test** — `apps/e3-web/test/landing.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { renderLanding, renderParticipants } from '../src/views/landing'

const ev = { sportEventId: 'e1', sport: 'calcio', categorie: ['U10', 'U12'], dates: { from: '2026-09-01', to: '2026-09-02' }, status: 'Published' as const }
const win = { sportEventId: 'e1', state: 'Open' as const, categories: [{ categoria: 'U10', cap: 8, count: 3, remaining: 5 }] }

describe('e3 views', () => {
  it('landing shows the public hero + a category capacity tag', () => {
    const html = renderLanding(ev, win)
    expect(html).toContain('pf-hero')
    expect(html).toContain('3/8')
  })
  it('participants lists confirmed teams', () => {
    const html = renderParticipants([{ registrationId: 'r', participantRef: 'Team A', sportEventId: 'e1', categoria: 'U10', status: 'Confirmed' }])
    expect(html).toContain('Team A')
  })
})
```

> Note: `renderParticipants` lives in `src/views/participants.ts`; re-export it from `src/views/landing.ts` **or** import from its own module — adjust the test import to match the chosen layout. Keep one exported symbol per view file; the test above imports both from `landing` for brevity, so add `export { renderParticipants } from './participants.js'` to `landing.ts`.

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run apps/e3-web`
Expected: FAIL — modules not found.

- [ ] **Step 5: Write `src/views/landing.ts`**

```ts
import type { EventDetail, RegistrationWindowView } from '@playfusion/rest-client'
import { renderPublicTopbar, renderCategoryTag } from '@playfusion/app-shell'

export { renderParticipants } from './participants.js'

export function renderLanding(event: EventDetail, window: RegistrationWindowView): string {
  const capOf = (c: string) => window.categories.find((x) => x.categoria === c)
  const cats = event.categorie.map((c) => { const w = capOf(c); return renderCategoryTag(c, w?.count ?? 0, w?.cap ?? 0) }).join('')
  return `${renderPublicTopbar()}
    <section class="pf-hero"><div class="pf-hero__inner">
      <div class="pf-eyebrow">Evento</div>
      <h1>${event.sport}</h1>
      <div class="pf-hero__meta">${event.dates.from} → ${event.dates.to}</div>
      <ul class="pf-catlist">${cats}</ul>
      <div><a class="pf-btn" href="#/events/${event.sportEventId}/participants">Vedi le squadre iscritte →</a></div>
    </div></section>`
}
```

- [ ] **Step 6: Write `src/views/participants.ts`**

```ts
import type { RegistrationView } from '@playfusion/rest-client'
import { renderPublicTopbar } from '@playfusion/app-shell'

export function renderParticipants(rows: RegistrationView[]): string {
  const items = rows.length
    ? rows.map((r) => `<li class="pf-card"><b>${r.participantRef}</b> · <span class="pf-mono">${r.categoria}</span></li>`).join('')
    : `<li class="pf-card pf-muted">Nessuna squadra confermata.</li>`
  return `${renderPublicTopbar()}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><h1>Squadre iscritte</h1></div>
      <ul class="pf-stack" style="list-style:none;padding:0">${items}</ul>
    </main>`
}
```

- [ ] **Step 7: Write `src/config.ts`** (`export function readConfig(env: ImportMetaEnv) { return { apiBaseUrl: env.VITE_API_BASE_URL ?? '' } }`).

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run apps/e3-web`
Expected: PASS.

- [ ] **Step 9: Write `src/main.ts`** (magic-link auth added in Task 8)

```ts
import '@playfusion/tokens/tokens.css'
import '@playfusion/app-shell/chrome.css'
import '@playfusion/ui'
import { HashRouter } from '@playfusion/app-shell'
import { createClient } from '@playfusion/rest-client'
import { readConfig } from './config.js'
import { renderLanding, renderParticipants } from './views/landing.js'

const cfg = readConfig(import.meta.env)
const app = document.getElementById('app')!
const client = createClient({ baseUrl: cfg.apiBaseUrl })

new HashRouter()
  .on('#/events/:id/participants', async ({ id }) => { app.innerHTML = renderParticipants(await client.o5.listRegistrations(id, 'Confirmed')) })
  .on('#/events/:id', async ({ id }) => { const [ev, win] = await Promise.all([client.o3.getEvent(id), client.o5.getRegistrationWindow(id)]); app.innerHTML = renderLanding(ev, win) })
  .on('#/', () => { app.innerHTML = '<main class="pf-container"><div class="pf-card pf-muted">Apri il link del tuo evento.</div></main>' })
  .start()
```

- [ ] **Step 10: Verify build**

Run: `npm run build -w @playfusion/e3-web`
Expected: exits 0.

- [ ] **Step 11: Commit**

```bash
git add apps/e3-web package.json
git commit -m "feat(s3.3): E3 public shell (landing + participants) on PS-B"
```

---

### Task 8: `apps/e3-web` magic-link auth wiring

**Files:**
- Create: `apps/e3-web/src/auth/magic-link.ts`
- Modify: `apps/e3-web/src/main.ts`
- Create test: `apps/e3-web/test/magic-link.test.ts`

**Interfaces:**
- Consumes: `AuthProvider`/`bearer` (rest-client).
- Produces:
  - `function captureMagicLink(url: URL, storage: Storage): string | null` — extracts `?token=`, persists it, returns it (or the stored one).
  - `function storedToken(storage: Storage): string | null`
  - `function magicLinkAuthProvider(storage: Storage): AuthProvider`

- [ ] **Step 1: Write the failing test** — `apps/e3-web/test/magic-link.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { captureMagicLink, storedToken, magicLinkAuthProvider } from '../src/auth/magic-link'

const mem = (): Storage => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as Storage }

describe('E3 magic-link', () => {
  let s: Storage
  beforeEach(() => { s = mem() })
  it('captures a token from ?token= and persists it', () => {
    const t = captureMagicLink(new URL('https://x/e3/?token=abc.def'), s)
    expect(t).toBe('abc.def')
    expect(storedToken(s)).toBe('abc.def')
  })
  it('returns the stored token when the URL has none', () => {
    s.setItem('pf.e3.magiclink', 'kept')
    expect(captureMagicLink(new URL('https://x/e3/'), s)).toBe('kept')
  })
  it('auth provider emits a Bearer header when a token is stored, null otherwise', async () => {
    expect(await magicLinkAuthProvider(s)()).toBeNull()
    s.setItem('pf.e3.magiclink', 'zzz')
    expect(await magicLinkAuthProvider(s)()).toEqual({ name: 'authorization', value: 'Bearer zzz' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/e3-web/test/magic-link.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/auth/magic-link.ts`**

```ts
import type { AuthProvider } from '@playfusion/rest-client'

const KEY = 'pf.e3.magiclink'

/** Reads ?token= from the landing URL, persists it, and returns the effective token
 *  (URL token wins, else the stored one). Coaches arrive via an emailed magic-link. */
export function captureMagicLink(url: URL, storage: Storage): string | null {
  const fromUrl = url.searchParams.get('token')
  if (fromUrl) { storage.setItem(KEY, fromUrl); return fromUrl }
  return storage.getItem(KEY)
}
export const storedToken = (storage: Storage): string | null => storage.getItem(KEY)
export const magicLinkAuthProvider = (storage: Storage): AuthProvider => () => {
  const t = storage.getItem(KEY)
  return t ? { name: 'authorization', value: `Bearer ${t}` } : null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run apps/e3-web/test/magic-link.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `src/main.ts`** — after `const app = ...`, capture the token, verify it, strip it from the URL, and build the client with the provider:

```ts
import { captureMagicLink, magicLinkAuthProvider, storedToken } from './auth/magic-link.js'
// ...
const token = captureMagicLink(new URL(window.location.href), sessionStorage)
if (token) window.history.replaceState({}, '', '/e3/' + window.location.hash) // strip ?token from the bar
const client = createClient({ baseUrl: cfg.apiBaseUrl, auth: magicLinkAuthProvider(sessionStorage) })

// Optional: confirm the link once and surface an invalid-link notice.
if (storedToken(sessionStorage)) {
  client.o2.verify(storedToken(sessionStorage)!).catch(() => {
    app.insertAdjacentHTML('afterbegin', '<div class="pf-card" style="border-color:var(--color-feedback-danger)">Link non valido o scaduto.</div>')
  })
}
```

- [ ] **Step 6: Verify build + full e3 suite**

Run: `npm run build -w @playfusion/e3-web && npx vitest run apps/e3-web`
Expected: both exit 0 / PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/e3-web
git commit -m "feat(s3.4): E3 coach magic-link capture + verify + rest-client header"
```

---

### Task 9: Infra — API Gateway CORS

**Files:**
- Modify: `infra/cdk/lib/api-stack.ts`

**Interfaces:**
- Consumes: nothing new. Produces a RestApi that answers CORS preflight for browser SPAs.

- [ ] **Step 1: Add the CORS import + options** — in `infra/cdk/lib/api-stack.ts`, change the `RestApi` import line to include `Cors`:

```ts
import { RestApi, LambdaIntegration, Cors } from 'aws-cdk-lib/aws-apigateway'
```

- [ ] **Step 2: Configure preflight on the RestApi** — replace `const api = new RestApi(this, 'api', { restApiName: \`playfusion2-api-${env}\` })` with:

```ts
const api = new RestApi(this, 'api', {
  restApiName: `playfusion2-api-${env}`,
  // Browser SPAs (E1/E3 on CloudFront) call this API cross-origin. Preflight must allow the
  // auth + org + correlation headers the rest-client sends. On stg the CloudFront domain is
  // not known at synth time, so allow any origin; tighten to the exact domain in pr.
  defaultCorsPreflightOptions: {
    allowOrigins: Cors.ALL_ORIGINS,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['content-type', 'authorization', 'x-organization-id', 'x-correlation-id'],
  },
})
```

- [ ] **Step 3: Verify the stack synthesizes**

Run: `cd infra/cdk && npx cdk synth playfusion2-api-stg -c env=stg >/dev/null && cd ../..`
Expected: exits 0 (synth succeeds; `OPTIONS` methods appear on the resources).

> If `cdk synth` needs AWS creds/bootstrap unavailable locally, instead run `npm run build -w @playfusion/... ` equivalent TypeScript compile for infra: `cd infra/cdk && npx tsc --noEmit && cd ../..` and note synth is verified at deploy time.

- [ ] **Step 4: Commit**

```bash
git add infra/cdk/lib/api-stack.ts
git commit -m "feat(s3): CORS preflight on the API Gateway for browser SPAs"
```

---

### Task 10: Infra — hosting serves the built apps + SPA fallback

**Files:**
- Modify: `infra/cdk/lib/hosting-stack.ts`

**Interfaces:**
- Consumes: built `apps/e1-web/dist` and `apps/e3-web/dist` (Tasks 5–8).
- Produces: CloudFront distribution serving real app bundles under `e1/` and `e3/`, with client-routing fallbacks.

- [ ] **Step 1: Swap imports** — in `hosting-stack.ts`, replace `Source` usage: keep `Source` but add `Source.asset`; import `errorResponses` support already in `Distribution`. Change the placeholder `BucketDeployment` block.

- [ ] **Step 2: Replace the `APPS`/placeholder deployment** — build each app's `dist` into its prefix:

```ts
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..', '..', '..')

// ... inside the constructor, replace the placeholder BucketDeployment with:
new BucketDeployment(this, 'e1', {
  destinationBucket: bucket,
  destinationKeyPrefix: 'e1',
  sources: [Source.asset(resolve(REPO, 'apps/e1-web/dist'))],
})
new BucketDeployment(this, 'e3', {
  destinationBucket: bucket,
  destinationKeyPrefix: 'e3',
  sources: [Source.asset(resolve(REPO, 'apps/e3-web/dist'))],
})
```

- [ ] **Step 3: Add SPA fallbacks to the Distribution** — add `errorResponses` so a deep link / refresh under a prefix serves that app's `index.html`:

```ts
new Distribution(this, 'cdn', {
  comment: resourceName('web', env),
  defaultRootObject: 'e3/index.html',
  defaultBehavior: behaviour,
  additionalBehaviors: Object.fromEntries(APPS.map((a) => [`${a.prefix}/*`, behaviour])),
  errorResponses: [
    { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/e3/index.html' },
    { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/e3/index.html' },
  ],
})
```

> Keep the existing `APPS` array (e1/e3 prefixes + behaviours). Only the deployment source and `errorResponses` change. E1 hash-routing survives refresh because its assets live under `/e1/` and its `index.html` bootstraps the hash router; the 403/404 fallback covers unknown deep paths.

- [ ] **Step 4: Verify infra compiles**

Run: `cd infra/cdk && npx tsc --noEmit && cd ../..`
Expected: exits 0. (Full `cdk synth` also requires the app `dist/` dirs to exist — run `npm run build -w @playfusion/e1-web -w @playfusion/e3-web` first if synthesizing.)

- [ ] **Step 5: Commit**

```bash
git add infra/cdk/lib/hosting-stack.ts
git commit -m "feat(s3.2,s3.3): hosting serves built E1/E3 bundles + SPA fallback"
```

---

### Task 11: Config, runbook, README + full-suite verification

**Files:**
- Modify: `infra/cdk/env/stg.json`, `README.md`
- Create: `docs/runbooks/auth0-spa-e1.md`

**Interfaces:** none produced; this task fills config + docs and runs the whole verification.

- [ ] **Step 1: Fill the recycled Auth0 tenant into `infra/cdk/env/stg.json`**

```json
{
  "env": "stg",
  "environmentName": "collaudo",
  "region": "eu-south-1",
  "auth0": {
    "issuer": "https://dev-c6din8ya.eu.auth0.com/",
    "audience": "https://plafusionapi.it",
    "clientId": "65atFepkIh2jiMeaDqZlqgD63ccd2Gw1",
    "rolesClaim": "https://plafusionapi.it/roles",
    "orgClaim": "org_id"
  }
}
```

> This turns on backend Auth0 JWT verification (S2.1 plumbing) on collaudo using the recycled tenant. `rolesClaim` matches the tenant's namespace; `requireOrganizer`'s default `organizerRole: 'organizer'` already matches the tenant's lowercase role value.

- [ ] **Step 2: Write `docs/runbooks/auth0-spa-e1.md`** — document, for the operator: the recycled tenant values; the **manual dashboard step** to add the E1 origins (`https://<cloudfront-domain>/e1/` callback+logout, `https://<cloudfront-domain>` web origin, and `http://localhost:5173` for local dev) to the SPA application's Allowed Callback URLs / Allowed Logout URLs / Allowed Web Origins; and how to point E1 at a local backend (`VITE_API_BASE_URL`). Include a "roles" note: assign the `organizer` role to a test user under the `https://plafusionapi.it/roles` claim via an Auth0 Action/Rule.

- [ ] **Step 3: Update `README.md`** — add a "Running the frontends" section:

```md
### Frontends (S3)
- E1 (organizer): `cp apps/e1-web/.env.example apps/e1-web/.env.local` then `npm run serve -w @playfusion/e1-web` (Auth0 login gate; add localhost to the tenant's allowed URLs — see docs/runbooks/auth0-spa-e1.md).
- E3 (public): `npm run serve -w @playfusion/e3-web` — open `#/events/<id>`; coaches arrive via `?token=<magic-link>`.
- Both need a backend: set `VITE_API_BASE_URL` to the deployed API or a local stack.
```

- [ ] **Step 4: Run the whole unit suite**

Run: `npm run test` (root — `vitest run --project unit`)
Expected: PASS, including the new rest-client, app-shell, e1-web, e3-web tests.

- [ ] **Step 5: Run lint (module-boundary proof)**

Run: `npm run lint`
Expected: PASS — apps depend only on `scope:lib`; no app imports a service directly.

- [ ] **Step 6: Build everything**

Run: `npm run build` (root — `nx run-many -t build`)
Expected: PASS for tokens, ui, app-shell, rest-client, e1-web, e3-web, infra.

- [ ] **Step 7: Local dev smoke (manual, documented)** — with a local backend running (`npm run stack:up` + service handlers, or a deployed `VITE_API_BASE_URL`): `npm run serve -w @playfusion/e3-web`, open `#/events/<seeded-id>`, confirm the hero + participants render; `npm run serve -w @playfusion/e1-web`, confirm the Auth0 login redirect fires (full login completes once the operator adds `localhost` to the tenant — Step 2). Record the outcome in the task's commit message / PR notes.

- [ ] **Step 8: Commit**

```bash
git add infra/cdk/env/stg.json docs/runbooks/auth0-spa-e1.md README.md
git commit -m "feat(s3.4): recycle Auth0 tenant into stg + E1 runbook + FE run docs"
```

---

## Self-Review

**1. Spec coverage:**
- S3.1 rest-client → Tasks 1–2 ✓ (typed per-BC, single seam, no FE logic).
- S3.2 E1 shell on PS-B + mockup chrome → Tasks 3 (tokens), 4 (app-shell), 5 (E1 shell); CloudFront path → Task 10 ✓.
- S3.3 E3 shell → Task 7; CloudFront path → Task 10 ✓.
- S3.4 auth → Task 6 (E1 Auth0), Task 8 (E3 magic-link), Task 11 (backend tenant config) ✓.
- CORS gap → Task 9 ✓. Token reconciliation → Task 3 ✓. Auth0 recycling + runbook → Task 11 ✓.
- Deploy deferred; no push/deploy step present ✓ (matches spec).

**2. Placeholder scan:** no "TBD/implement later". Two explicit implementer-refinement notes (o4 DTO shape in Task 2; the `brand()` illustrative helper in Task 4) are flagged with the exact source to consult, not left vague. The CSS port (Task 4 Step 9) references an in-repo source file + an exact substitution table — mechanical, not a placeholder.

**3. Type consistency:** `HttpConfig`, `AuthProvider`, `AuthHeader`, `createClient`, `Client`, per-BC `O*Api` names are defined in Tasks 1–2 and consumed unchanged in Tasks 5–8. `Auth0Port`, `ensureAuthenticated`, `authProviderFrom` defined and used consistently in Task 6/main.ts. `WorkspaceTab` exported from app-shell (Task 4) and imported in Task 5. `renderParticipants` layout note reconciled in Task 7 Step 3.

## Execution Handoff

Two execution options — see below.
