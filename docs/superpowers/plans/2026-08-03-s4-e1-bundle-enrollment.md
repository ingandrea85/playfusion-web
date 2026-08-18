# S4 — E1 Bundle Enrollment Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the E1 organizer Bundle Enrollment flow real end-to-end — dashboard, create-event, open registration window, share link, inbox confirm/reject, mark fee paid, participants view — on the S3 rest-client + app-shell, plus one minimal o12 fee-status read.

**Architecture:** Seven E1 screens consume `@playfusion/rest-client` and render on `@playfusion/app-shell`. Interactive screens use a `render(data)` (pure) + `mount(root,ctx,data)` (DOM/IO) view-controller wired by the hash router. A small o12 read (`GET /o12/events/:id/fees` over a new `event-index` GSI, `sportEventId` denormalized on the consumer write) exposes fee status.

**Tech Stack:** TypeScript ESM (`moduleResolution: bundler`), Vite 7, Vitest 3 (jsdom for DOM tests), Web Components (`@playfusion/ui`), AWS CDK (aws-cdk-lib), Hono (backend handlers), DynamoDB.

## Global Constraints

- **Node** `>=20 <21`; ESM with explicit `.js` internal import extensions.
- **Module boundaries (ADR-011):** `apps/e1-web` (`scope:app`) depends only on `scope:lib`; backend reached only via `@playfusion/rest-client`. Backend BCs never import another BC (ADR-002).
- **No business logic in the FE (R6):** views map data → HTML and calls → rest-client; escape all dynamic text with `esc()` from `@playfusion/app-shell`; use `encodeURIComponent` for ids in hrefs/paths.
- **Read-model strategy (S1.1):** each BC queries its own store via a GSI; denormalize cross-BC data on the write side; no join on the read path.
- **Backend header contract:** organizer mutations carry `Authorization: Bearer`; org via `x-organization-id`; correlation via `x-correlation-id` (all handled inside rest-client already).
- **Create-event scope:** exactly `{ sport, categorie, dates:{from,to} }` — NO tie-break/playbook/name/location (O6/S6+).
- **Fee semantics:** confirm (S4.5) accepts a pending `Applied` registration; mark-fee-paid (S4.6) records payment on a `Confirmed` participant (`o12.payFee` → `o12-fees.status='Paid'` + `ParticipationFeePaid`). Fee status read via `o12.listFees`.
- **App tests** live under `apps/*/test/**` (already in the root vitest `unit` include). DOM-touching test files need a `// @vitest-environment jsdom` first-line docblock.
- **Deploy scope:** local verify only — unit tests, `nx build`, `cdk synth`, local dev smoke. NO `git push`, NO `cdk deploy`.
- **Commits:** small, per task, on branch `feature/s4-e1-bundle-enrollment`. Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

```
services/o12-payments/src/
  consumer.ts                         (MODIFY — denormalize sportEventId into o12-fees)
  handler.ts                          (MODIFY — add GET /events/:id/fees)
  read-model.ts                       (NEW — FeeView + listFees)
  ports/fee-read-store.ts             (NEW — FeeReadStore port + FeeRecord)
  adapters/dynamodb-fee-store.ts      (NEW — event-index query)
  test/read-model.test.ts            (NEW — fake-backed)
  test/consumer.test.ts              (NEW/MODIFY — denormalization)
infra/cdk/lib/data-stack.ts           (MODIFY — o12-fees event-index GSI)
scripts/provision.ts                  (MODIFY — o12-fees event-index GSI for LocalStack)
libs/rest-client/src/
  types.ts                            (MODIFY — FeeStatus, FeeView)
  o12.ts                              (MODIFY — listFees)
  test/o12.test.ts                    (NEW — listFees mocked fetch)
libs/app-shell/src/
  chrome.css                          (MODIFY — .pf-field, .pf-switch)
  clipboard.ts                        (NEW — copyToClipboard)
  index.ts                            (MODIFY — export clipboard)
  test/clipboard.test.ts             (NEW)
apps/e1-web/src/
  config.ts                           (MODIFY — VITE_E3_BASE_URL)
  vite-env.d.ts                       (MODIFY — VITE_E3_BASE_URL, VITE_DEFAULT_ORG_ID)
  view.ts                             (NEW — ViewCtx, Screen<D>, mountRoute, errorCard, inlineError)
  main.ts                             (MODIFY — router uses Screen<D> + refresh + ctx)
  views/dashboard.ts                  (MODIFY — CTA; render stays pure)
  views/create-event.ts              (NEW — S4.2)
  views/enroll.ts                     (NEW — S4.3/4.4/4.5)
  views/participants.ts              (NEW — S4.6/4.7)
  views/workspace.ts                  (MODIFY — tabs Panoramica/Iscrizioni/Partecipanti)
  test/create-event.test.ts          (NEW)
  test/enroll.test.ts                (NEW)
  test/participants.test.ts          (NEW)
  test/mount-wiring.test.ts          (NEW — jsdom; confirm click → client + refresh)
docs/runbooks/*                       (MODIFY/NEW — o12 fee-read + migration caveat note)
```

---

### Task 1: Backend o12 fee-status read + rest-client `listFees`

**Files:**
- Create: `services/o12-payments/src/read-model.ts`, `src/ports/fee-read-store.ts`, `src/adapters/dynamodb-fee-store.ts`, `test/read-model.test.ts`, `test/consumer.test.ts`
- Modify: `services/o12-payments/src/handler.ts`, `src/consumer.ts`, `infra/cdk/lib/data-stack.ts`, `scripts/provision.ts`, `libs/rest-client/src/types.ts`, `libs/rest-client/src/o12.ts`
- Create test: `libs/rest-client/test/o12.test.ts`

**Interfaces:**
- Produces: `FeeStatus = 'Requested' | 'Paid'`; `FeeView = { registrationId: string; status: FeeStatus }`;
  `FeeRecord = { registrationId: string; sportEventId: string; status: FeeStatus }`;
  `interface FeeReadStore { listByEvent(sportEventId: string): Promise<FeeRecord[]> }`;
  `listFees(store: FeeReadStore): (sportEventId: string) => Promise<FeeView[]>`;
  rest-client `o12.listFees(eventId: string): Promise<FeeView[]>` (GET `/o12/events/:id/fees`).

- [ ] **Step 1: Write the failing backend read-model test** — `services/o12-payments/test/read-model.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { listFees } from '../src/read-model.js'
import type { FeeReadStore } from '../src/ports/fee-read-store.js'

const store = (rows: Array<{ registrationId: string; sportEventId: string; status: 'Requested' | 'Paid' }>): FeeReadStore => ({
  listByEvent: async (sportEventId) => rows.filter((r) => r.sportEventId === sportEventId),
})

describe('o12 listFees', () => {
  it('projects fee rows for an event to {registrationId,status}, dropping internal fields', async () => {
    const out = await listFees(store([
      { registrationId: 'r1', sportEventId: 'e1', status: 'Paid' },
      { registrationId: 'r2', sportEventId: 'e1', status: 'Requested' },
      { registrationId: 'r3', sportEventId: 'e2', status: 'Paid' },
    ]))('e1')
    expect(out).toEqual([{ registrationId: 'r1', status: 'Paid' }, { registrationId: 'r2', status: 'Requested' }])
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run services/o12-payments/test/read-model.test.ts`
Expected: FAIL — `../src/read-model.js` / `../src/ports/fee-read-store.js` not found.

- [ ] **Step 3: Write `src/ports/fee-read-store.ts`**

```ts
export type FeeStatus = 'Requested' | 'Paid';
/** Persisted fee record. `sportEventId` is denormalized in from RegistrationApplied so
 *  fees can be listed per event via the `event-index` GSI (S1.1 read-model strategy). */
export interface FeeRecord { registrationId: string; sportEventId: string; status: FeeStatus }
/** Read seam for O12 fees. DynamoDB adapter queries `event-index`; a fake mirrors it in tests. */
export interface FeeReadStore { listByEvent(sportEventId: string): Promise<FeeRecord[]> }
```

- [ ] **Step 4: Write `src/read-model.ts`**

```ts
import type { FeeReadStore, FeeStatus } from './ports/fee-read-store.js';

/** Public fee projection: internal `sportEventId`/`paymentRef` are not part of the read contract. */
export type FeeView = { registrationId: string; status: FeeStatus };

export const listFees = (store: FeeReadStore) => async (sportEventId: string): Promise<FeeView[]> =>
  (await store.listByEvent(sportEventId)).map((f) => ({ registrationId: f.registrationId, status: f.status }));
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx vitest run services/o12-payments/test/read-model.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the DynamoDB adapter** `src/adapters/dynamodb-fee-store.ts` (mirror `o5` `findByEvent`)

```ts
import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import type { FeeReadStore, FeeRecord } from '../ports/fee-read-store.js';

export class DynamoDbFeeStore implements FeeReadStore {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o12-fees')) {}
  async listByEvent(sportEventId: string): Promise<FeeRecord[]> {
    const res = await this.db.send(new QueryCommand({
      TableName: this.table, IndexName: 'event-index',
      KeyConditionExpression: 'sportEventId = :e',
      ExpressionAttributeValues: { ':e': sportEventId },
    }));
    return (res.Items ?? []) as FeeRecord[];
  }
}
```

- [ ] **Step 7: Wire the read into the handler** — in `services/o12-payments/src/handler.ts`, add the store + route (place after the existing `POST /payments/:registrationId/pay`):

```ts
import { DynamoDbFeeStore } from './adapters/dynamodb-fee-store.js';
import { listFees } from './read-model.js';
// ...after `const app = new Hono();` and `const publisher = ...`:
const feeStore = new DynamoDbFeeStore(db);
// S4: fee status per event (read side). Public projection [{registrationId,status}].
app.get('/events/:id/fees', async (c) => c.json(await listFees(feeStore)(c.req.param('id'))));
```

- [ ] **Step 8: Denormalize `sportEventId` on the consumer write** — in `services/o12-payments/src/consumer.ts`, change the `PutCommand` Item to include `sportEventId` from the event detail:

```ts
await db.send(new PutCommand({ TableName: resourceName('o12-fees'), Item: { registrationId: detail.registrationId, sportEventId: detail.sportEventId, status: 'Requested' } }));
```

- [ ] **Step 9: Write the consumer denormalization test** — `services/o12-payments/test/consumer.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The consumer builds its own DocClient + publisher at import; assert the PutCommand Item.
// Mock @aws-sdk/lib-dynamodb's PutCommand + platform-lib's makeDocClient/publisher.
const sent: any[] = []
vi.mock('@playfusion/platform-lib', async (orig) => ({
  ...(await orig<typeof import('@playfusion/platform-lib')>()),
  makeDocClient: () => ({ send: (cmd: any) => { sent.push(cmd); return Promise.resolve({}) } }),
  EventBridgeEventPublisher: class { publish() { return Promise.resolve() } },
  busName: () => 'bus', resourceName: (b: string) => b,
}))

beforeEach(() => { sent.length = 0 })

it('stores sportEventId on the fee row from RegistrationApplied', async () => {
  const { handler } = await import('../src/consumer.js')
  await handler({ detail: { registrationId: 'r1', sportEventId: 'e9', participantRef: 'p', envelope: { organizationId: 'org', correlationId: 'c' } } })
  const put = sent.find((c) => c?.input?.Item?.registrationId === 'r1')
  expect(put.input.Item).toMatchObject({ registrationId: 'r1', sportEventId: 'e9', status: 'Requested' })
})
```

> If mocking the module-level client proves awkward, instead refactor the consumer's persistence into a tiny exported `feeItem(detail)` pure function and unit-test that; keep the handler calling it. Note the choice in the report.

- [ ] **Step 10: Add the GSI to `infra/cdk/lib/data-stack.ts`** — replace the `o12-fees` line with a table that has the `event-index` GSI (mirror `o3-events`/`o5-registrations`):

```ts
const fees = table('o12-fees', 'registrationId');
fees.addGlobalSecondaryIndex({ indexName: 'event-index', partitionKey: { name: 'sportEventId', type: AttributeType.STRING } });
this.tables['o12-fees'] = fees;
```

- [ ] **Step 11: Add the GSI to `scripts/provision.ts`** — on the `o12-fees` table definition (around the existing `resourceName('o12-fees')` block), add `AttributeDefinitions` for `sportEventId` and a `GlobalSecondaryIndexes` entry mirroring line ~39's `event-index` shape (`KeySchema: [{ AttributeName: 'sportEventId', KeyType: 'HASH' }], Projection: { ProjectionType: 'ALL' }`).

- [ ] **Step 12: Write the failing rest-client test** — `libs/rest-client/test/o12.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'
const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

describe('o12 api', () => {
  it('listFees GETs /o12/events/:id/fees', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([{ registrationId: 'r1', status: 'Paid' }]))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: fetchMock })
    const out = await c.o12.listFees('e1')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api/prod/o12/events/e1/fees')
    expect(out).toEqual([{ registrationId: 'r1', status: 'Paid' }])
  })
})
```

- [ ] **Step 13: Run it to confirm it fails**

Run: `npx vitest run libs/rest-client/test/o12.test.ts`
Expected: FAIL — `listFees` is not a function.

- [ ] **Step 14: Extend `libs/rest-client/src/types.ts`** (append)

```ts
// o12 fee read (S4)
export type FeeStatus = 'Requested' | 'Paid'
export interface FeeView { registrationId: string; status: FeeStatus }
```

- [ ] **Step 15: Extend `libs/rest-client/src/o12.ts`**

```ts
import { request, type HttpConfig } from './http.js'
import type { FeeView } from './types.js'
export interface O12Api {
  payFee(registrationId: string): Promise<unknown>
  listFees(eventId: string): Promise<FeeView[]>
}
export const o12 = (cfg: HttpConfig): O12Api => ({
  payFee: (registrationId) => request(cfg, 'POST', `/o12/payments/${encodeURIComponent(registrationId)}/pay`),
  listFees: (eventId) => request(cfg, 'GET', `/o12/events/${encodeURIComponent(eventId)}/fees`),
})
```

- [ ] **Step 16: Run all affected tests + synth + tsc**

Run: `npx vitest run libs/rest-client services/o12-payments && cd infra/cdk && npx cdk synth playfusion2-data-stg -c env=stg >/dev/null && npx tsc --noEmit && cd ../..`
Expected: tests PASS; synth exits 0 (o12-fees now has `event-index`); tsc clean.

- [ ] **Step 17: Commit**

```bash
git add services/o12-payments libs/rest-client infra/cdk/lib/data-stack.ts scripts/provision.ts
git commit -m "feat(s4): o12 fee-status read (event-index GSI + GET /o12/events/:id/fees) + rest-client listFees"
```

---

### Task 2: app-shell form primitives + clipboard helper

**Files:**
- Modify: `libs/app-shell/src/chrome.css`, `libs/app-shell/src/index.ts`
- Create: `libs/app-shell/src/clipboard.ts`, `libs/app-shell/test/clipboard.test.ts`

**Interfaces:**
- Produces: CSS classes `.pf-field` (+ `label`, `input`/`select`/`textarea`, focus) and `.pf-switch`;
  `copyToClipboard(text: string): Promise<boolean>` (true on success, false on failure — never throws).

- [ ] **Step 1: Port the form CSS into `libs/app-shell/src/chrome.css`** — copy these blocks from `mockups/shared/ui.css` (lines ~96–101 and the `.pf-switch` rule ~173), applying the S3 token map (`--space-3`→`12px`, `--space-4`→`--space-md`, `--radius-2`→`8px`, `--color-border-strong`/`--color-action-primary`/`--color-text-soft` unchanged — they already resolve):

```css
.pf-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: var(--space-md); }
.pf-field label { font-weight: 700; font-size: 13px; color: var(--color-text-soft); }
.pf-field input, .pf-field select, .pf-field textarea { padding: 11px 12px; border: 1px solid var(--color-border-strong); border-radius: 8px; font: inherit; background: var(--color-surface-default); color: var(--color-text-default); }
.pf-field textarea { resize: vertical; }
.pf-field input:focus, .pf-field select:focus, .pf-field textarea:focus { outline: none; border-color: var(--color-action-primary); }
.pf-switch { display: inline-flex; align-items: center; gap: var(--space-sm); }
.pf-switch input { width: 18px; height: 18px; accent-color: var(--color-action-primary); }
```

After writing, re-run the S3 dangling-var check: `grep -oE 'var\(--[a-z0-9-]+\)' libs/app-shell/src/chrome.css | sort -u` and confirm each var is defined in `libs/tokens/src/tokens.css`. Report the result.

- [ ] **Step 2: Write the failing clipboard test** — `libs/app-shell/test/clipboard.test.ts`

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { copyToClipboard } from '../src/clipboard'

describe('copyToClipboard', () => {
  it('writes text via navigator.clipboard and returns true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    expect(await copyToClipboard('hello')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })
  it('returns false instead of throwing when the clipboard API rejects', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    expect(await copyToClipboard('x')).toBe(false)
  })
})
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run libs/app-shell/test/clipboard.test.ts`
Expected: FAIL — `../src/clipboard` not found.

- [ ] **Step 4: Write `libs/app-shell/src/clipboard.ts`**

```ts
/** Copy text to the clipboard. Resolves true on success, false on failure — never throws,
 *  so callers can show a fallback (e.g. a selectable input) without a try/catch. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}
```

- [ ] **Step 5: Export from `libs/app-shell/src/index.ts`** — add `export * from './clipboard.js'`.

- [ ] **Step 6: Run tests to confirm they pass**

Run: `npx vitest run libs/app-shell`
Expected: PASS (chrome + router + html + clipboard).

- [ ] **Step 7: Commit**

```bash
git add libs/app-shell
git commit -m "feat(s4): app-shell form primitives (.pf-field/.pf-switch) + copyToClipboard"
```

---

### Task 3: E1 view-controller infra + router refactor + config

**Files:**
- Create: `apps/e1-web/src/view.ts`
- Modify: `apps/e1-web/src/main.ts`, `apps/e1-web/src/config.ts`, `apps/e1-web/src/vite-env.d.ts`, `apps/e1-web/src/views/workspace.ts`
- Create test: `apps/e1-web/test/router-wiring.test.ts`

**Interfaces:**
- Consumes: `HashRouter` (app-shell), `createClient`/`Client` (rest-client), the Auth0 adapter (existing).
- Produces:
  - `interface ViewCtx { client: Client; orgId: string; e3BaseUrl: string; navigate: (hash: string) => void; refresh: () => void }`
  - `interface Screen<D> { load(ctx: ViewCtx, params: Record<string,string>): Promise<D>; render(data: D): string; mount?(root: HTMLElement, ctx: ViewCtx, data: D): void }`
  - `function errorCard(msg: string): string` and `function inlineError(msg: string): string`
  - `function runScreen<D>(root: HTMLElement, ctx: ViewCtx, params: Record<string,string>, screen: Screen<D>): Promise<void>`
  - `AppConfig` gains `e3BaseUrl: string`.

- [ ] **Step 1: Write `apps/e1-web/src/view.ts`**

```ts
import type { Client } from '@playfusion/rest-client'

export interface ViewCtx {
  client: Client
  orgId: string
  e3BaseUrl: string
  navigate: (hash: string) => void
  refresh: () => void
}

/** A screen = pure render(data) + optional mount(root,ctx,data) that wires DOM events and
 *  calls the rest-client. load() fetches the data render() needs. Keeps render testable. */
export interface Screen<D> {
  load(ctx: ViewCtx, params: Record<string, string>): Promise<D>
  render(data: D): string
  mount?(root: HTMLElement, ctx: ViewCtx, data: D): void
}

export const errorCard = (msg: string): string =>
  `<main class="pf-container"><div class="pf-card">${msg}</div></main>`
export const inlineError = (msg: string): string =>
  `<div class="pf-card" role="alert" style="border-color:var(--color-feedback-danger);margin-bottom:var(--space-md)">${msg}</div>`

/** Load → render → mount for one route; a load failure renders the error card (never blank). */
export async function runScreen<D>(root: HTMLElement, ctx: ViewCtx, params: Record<string, string>, screen: Screen<D>): Promise<void> {
  try {
    const data = await screen.load(ctx, params)
    root.innerHTML = screen.render(data)
    screen.mount?.(root, ctx, data)
  } catch {
    root.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.')
  }
}
```

- [ ] **Step 2: Add `e3BaseUrl` to config** — `apps/e1-web/src/config.ts`: add `e3BaseUrl: string` to `AppConfig` and in `readConfig`:

```ts
const e3BaseUrl = env.VITE_E3_BASE_URL ?? (typeof window !== 'undefined' ? window.location.origin : '')
return { apiBaseUrl, orgId, e3BaseUrl, auth0 }
```

And `apps/e1-web/src/vite-env.d.ts`: add `readonly VITE_E3_BASE_URL?: string` (and, if missing, `readonly VITE_DEFAULT_ORG_ID?: string`).

- [ ] **Step 3: Refactor `apps/e1-web/src/main.ts`** to build a `ViewCtx` and route to `Screen`s via `runScreen`, with a working `refresh` that re-runs the current route:

```ts
import '@playfusion/tokens/tokens.css'
import '@playfusion/app-shell/chrome.css'
import '@playfusion/ui'
import { HashRouter } from '@playfusion/app-shell'
import { createClient } from '@playfusion/rest-client'
import { readConfig } from './config.js'
import { runScreen, errorCard, type ViewCtx, type Screen } from './view.js'
import { dashboardScreen } from './views/dashboard.js'
import { createEventScreen } from './views/create-event.js'
import { workspaceScreen } from './views/workspace.js'
import { enrollScreen } from './views/enroll.js'
import { participantsScreen } from './views/participants.js'
import { createAuth0Adapter, ensureAuthenticated, authProviderFrom } from './auth/auth0.js'

const cfg = readConfig(import.meta.env)
const app = document.getElementById('app')!

async function boot() {
  try {
    if (!cfg.auth0) { app.innerHTML = errorCard('Config Auth0 mancante (VITE_AUTH0_*).'); return }
    const port = createAuth0Adapter(cfg.auth0)
    if (!(await ensureAuthenticated(port))) return
    const orgId = (await port.getOrgId()) ?? cfg.orgId
    const client = createClient({ baseUrl: cfg.apiBaseUrl, orgId, auth: authProviderFrom(port) })

    let current: () => Promise<void> = async () => {}
    const ctx: ViewCtx = {
      client, orgId, e3BaseUrl: cfg.e3BaseUrl,
      navigate: (hash) => { window.location.hash = hash },
      refresh: () => { void current() },
    }
    const route = <D>(screen: Screen<D>, params: Record<string, string>) => {
      current = () => runScreen(app, ctx, params, screen)
      return current()
    }
    new HashRouter()
      .on('#/', () => route(dashboardScreen, {}))
      .on('#/events/new', () => route(createEventScreen, {}))
      .on('#/events/:id/enroll', (p) => route(enrollScreen, p))
      .on('#/events/:id/participants', (p) => route(participantsScreen, p))
      .on('#/events/:id', (p) => route(workspaceScreen, p))
      .start()
  } catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.') }
}
boot()
```

> The `dashboardScreen`/`workspaceScreen`/`createEventScreen`/`enrollScreen`/`participantsScreen` `Screen` objects are created in Tasks 4–6. To keep this task compiling and testable NOW, create thin placeholder `Screen`s for the not-yet-built ones (createEvent/enroll/participants) in their view files: `export const enrollScreen: Screen<unknown> = { load: async () => ({}), render: () => '<main class="pf-container"><div class="pf-card pf-muted">In arrivo (S4).</div></main>' }` etc. Tasks 4–6 replace these bodies.

- [ ] **Step 4: Convert `views/dashboard.ts` and `views/workspace.ts` to `Screen`s** (keep their pure `render` functions; wrap in a `Screen`).
  - `dashboard.ts`: keep `renderDashboard(events)`; add
    `export const dashboardScreen: Screen<EventSummary[]> = { load: (ctx) => ctx.client.o3.listEvents(), render: renderDashboard }`.
  - `workspace.ts`: keep `renderWorkspace(event, active)`; update `tabs()` to the three S4 tabs and add
    `export const workspaceScreen: Screen<EventDetail> = { load: (ctx, p) => ctx.client.o3.getEvent(p.id), render: (e) => renderWorkspace(e, 'overview') }`.
    New `tabs()`:
    ```ts
    const tabs = (id: string): WorkspaceTab[] => [
      { key: 'overview', label: 'Panoramica', href: `#/events/${encodeURIComponent(id)}` },
      { key: 'enroll', label: 'Iscrizioni', href: `#/events/${encodeURIComponent(id)}/enroll` },
      { key: 'participants', label: 'Partecipanti', href: `#/events/${encodeURIComponent(id)}/participants` },
    ]
    ```

- [ ] **Step 5: Write a router-wiring test** — `apps/e1-web/test/router-wiring.test.ts`

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { errorCard, inlineError, runScreen, type Screen, type ViewCtx } from '../src/view'

const ctx = { client: {} as any, orgId: 'o', e3BaseUrl: 'https://x', navigate: () => {}, refresh: () => {} } satisfies ViewCtx

describe('view infra', () => {
  it('runScreen loads, renders, then mounts', async () => {
    const calls: string[] = []
    const screen: Screen<{ n: number }> = {
      load: async () => { calls.push('load'); return { n: 1 } },
      render: (d) => { calls.push('render'); return `<i>${d.n}</i>` },
      mount: () => { calls.push('mount') },
    }
    const root = document.createElement('div')
    await runScreen(root, ctx, {}, screen)
    expect(calls).toEqual(['load', 'render', 'mount'])
    expect(root.innerHTML).toContain('<i>1</i>')
  })
  it('runScreen renders the error card when load rejects', async () => {
    const root = document.createElement('div')
    await runScreen(root, ctx, {}, { load: async () => { throw new Error('x') }, render: () => '' })
    expect(root.innerHTML).toContain('Si è verificato un errore')
  })
  it('errorCard/inlineError produce cards', () => {
    expect(errorCard('m')).toContain('pf-card'); expect(inlineError('m')).toContain('role="alert"')
  })
})
```

- [ ] **Step 6: Run tests + build**

Run: `npx vitest run apps/e1-web && npm run build -w @playfusion/e1-web`
Expected: PASS; build exits 0 (with placeholder screens for the not-yet-built routes).

- [ ] **Step 7: Commit**

```bash
git add apps/e1-web
git commit -m "feat(s4): E1 view-controller infra (ViewCtx/Screen/runScreen) + router + 3 workspace tabs"
```

---

### Task 4: S4.1 Dashboard completion + S4.2 Create event

**Files:**
- Modify: `apps/e1-web/src/views/dashboard.ts`
- Create: `apps/e1-web/src/views/create-event.ts`, `apps/e1-web/test/create-event.test.ts`
- Modify: `apps/e1-web/test/dashboard.test.ts` (add CTA assertion)

**Interfaces:**
- Consumes: `Screen`, `ViewCtx`, `inlineError` (view.ts); `esc`, `renderOrganizerTopbar` (app-shell); `o3.createEvent`, `EventSummary`, `CreateEventInput` (rest-client).
- Produces: `dashboardScreen` (already a Screen; add the CTA to `renderDashboard`); `createEventScreen: Screen<null>` with `renderCreateEvent(): string` and a `mount` that submits the form.

- [ ] **Step 1: Add the "Crea evento" CTA to `renderDashboard`** (dashboard.ts) — insert next to the page head:

```ts
// inside renderDashboard, replace the pagehead block:
`<div class="pf-row" style="margin-bottom:var(--space-lg)">
   <div class="pf-pagehead" style="margin-bottom:0"><div class="pf-eyebrow">Stagione 2026</div><h1>I tuoi tornei</h1></div>
   <a class="pf-btn pf-btn--primary" href="#/events/new">＋ Crea evento</a>
 </div>`
```

- [ ] **Step 2: Extend `apps/e1-web/test/dashboard.test.ts`** — add:

```ts
it('dashboard shows a create-event CTA', () => {
  expect(renderDashboard([])).toContain('#/events/new')
})
```

- [ ] **Step 3: Write the failing create-event test** — `apps/e1-web/test/create-event.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { renderCreateEvent } from '../src/views/create-event'

describe('create-event render', () => {
  it('renders sport, category and date fields and a submit', () => {
    const html = renderCreateEvent()
    expect(html).toContain('name="sport"')
    expect(html).toContain('data-cat-add') // add-category control
    expect(html).toContain('name="from"')
    expect(html).toContain('name="to"')
    expect(html).toMatch(/type="submit"|js-create/)
  })
})
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npx vitest run apps/e1-web/test/create-event.test.ts`
Expected: FAIL — `../src/views/create-event` not found.

- [ ] **Step 5: Write `apps/e1-web/src/views/create-event.ts`**

```ts
import { renderOrganizerTopbar, esc } from '@playfusion/app-shell'
import type { CreateEventInput } from '@playfusion/rest-client'
import { inlineError, type Screen, type ViewCtx } from '../view.js'

export function renderCreateEvent(categorie: string[] = []): string {
  const chips = categorie.map((c, i) =>
    `<li class="pf-cat"><span class="pf-cat__label">${esc(c)}</span><button type="button" class="pf-btn pf-btn--ghost" data-cat-remove="${i}">✕</button></li>`).join('')
  return `${renderOrganizerTopbar('dashboard')}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">Nuovo</div><h1>Crea evento</h1></div>
      <div id="err"></div>
      <form id="form" class="pf-card">
        <div class="pf-field"><label>Sport</label><input name="sport" required placeholder="es. Calcio a 5" /></div>
        <div class="pf-field"><label>Categorie</label>
          <div class="pf-row"><input id="cat" placeholder="es. U10" /><button type="button" class="pf-btn" data-cat-add>Aggiungi</button></div>
          <ul class="pf-catlist" id="cats">${chips}</ul>
        </div>
        <div class="pf-row">
          <div class="pf-field" style="flex:1"><label>Dal</label><input type="date" name="from" required /></div>
          <div class="pf-field" style="flex:1"><label>Al</label><input type="date" name="to" required /></div>
        </div>
        <button class="pf-btn pf-btn--primary pf-btn--lg" type="submit" data-create>Crea evento</button>
      </form>
    </main>`
}

/** Create-event is stateful (the category list), so mount keeps a local array and re-renders
 *  the chips in place; submit builds CreateEventInput and calls o3.createEvent. */
export const createEventScreen: Screen<null> = {
  load: async () => null,
  render: () => renderCreateEvent([]),
  mount(root, ctx: ViewCtx) {
    const categorie: string[] = []
    const cats = root.querySelector('#cats')!
    const catInput = root.querySelector<HTMLInputElement>('#cat')!
    const err = root.querySelector('#err')!
    const redraw = () => { cats.innerHTML = renderCreateEvent(categorie).match(/<ul class="pf-catlist" id="cats">([\s\S]*?)<\/ul>/)![1] }
    root.querySelector('[data-cat-add]')!.addEventListener('click', () => {
      const v = catInput.value.trim(); if (!v) return; categorie.push(v); catInput.value = ''; redraw()
    })
    cats.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-cat-remove]'); if (!b) return
      categorie.splice(Number(b.getAttribute('data-cat-remove')), 1); redraw()
    })
    root.querySelector('#form')!.addEventListener('submit', async (e) => {
      e.preventDefault()
      const f = e.target as HTMLFormElement
      const data = new FormData(f)
      const input: CreateEventInput = {
        sport: String(data.get('sport') ?? '').trim(),
        categorie: [...categorie],
        dates: { from: String(data.get('from') ?? ''), to: String(data.get('to') ?? '') },
      }
      if (!input.sport || !input.categorie.length || !input.dates.from || !input.dates.to) {
        err.innerHTML = inlineError('Compila sport, almeno una categoria e le date.'); return
      }
      const btn = f.querySelector<HTMLButtonElement>('[data-create]')!; btn.disabled = true
      try {
        const created = await ctx.client.o3.createEvent(input)
        ctx.navigate(`#/events/${encodeURIComponent((created as { sportEventId: string }).sportEventId)}`)
      } catch { err.innerHTML = inlineError('Creazione non riuscita. Riprova.'); btn.disabled = false }
    })
  },
}
```

> `redraw()` re-extracts the chip markup from `renderCreateEvent` to avoid duplicating the chip template — keep the regex-extract simple; if it feels fragile, factor a small `renderCatChips(categorie)` helper exported from this file and call it from both `renderCreateEvent` and `redraw`. Prefer the helper.

- [ ] **Step 6: Replace the placeholder `createEventScreen`** in `main.ts`'s imports (it now comes from `create-event.ts`).

- [ ] **Step 7: Run tests + build**

Run: `npx vitest run apps/e1-web && npm run build -w @playfusion/e1-web`
Expected: PASS; build 0.

- [ ] **Step 8: Commit**

```bash
git add apps/e1-web
git commit -m "feat(s4.1,s4.2): E1 dashboard CTA + create-event form (o3.createEvent)"
```

---

### Task 5: S4.3/S4.4/S4.5 — Iscrizioni tab (open window + share link + inbox)

**Files:**
- Create: `apps/e1-web/src/views/enroll.ts`, `apps/e1-web/test/enroll.test.ts`

**Interfaces:**
- Consumes: `Screen`, `ViewCtx`, `inlineError` (view.ts); `renderOrganizerWorkspace`, `esc`, `copyToClipboard` (app-shell); `o3.getEvent`, `o5.getRegistrationWindow`, `o5.openRegistrationWindow`, `o5.listRegistrations`, `o5.confirmRegistration`, `o5.rejectRegistration` (rest-client).
- Produces: `renderEnroll(data: EnrollData): string` (pure) and `enrollScreen: Screen<EnrollData>` where
  `EnrollData = { event: EventDetail; window: RegistrationWindowView; pending: RegistrationView[]; e3BaseUrl: string }`.

- [ ] **Step 1: Write the failing render test** — `apps/e1-web/test/enroll.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { renderEnroll } from '../src/views/enroll'

const base = {
  event: { sportEventId: 'e1', sport: 'calcio', categorie: ['U10', 'U12'], dates: { from: 'a', to: 'b' }, status: 'Published' as const },
  e3BaseUrl: 'https://host',
}

describe('enroll render', () => {
  it('shows a per-category cap input for each category', () => {
    const html = renderEnroll({ ...base, window: { sportEventId: 'e1', state: 'Closed', categories: [] }, pending: [] })
    expect(html).toContain('data-cap="U10"')
    expect(html).toContain('data-cap="U12"')
  })
  it('shows the share link and inbox rows with confirm/reject when the window is open', () => {
    const html = renderEnroll({
      ...base,
      window: { sportEventId: 'e1', state: 'Open', categories: [{ categoria: 'U10', cap: 8, count: 1, remaining: 7 }] },
      pending: [{ registrationId: 'r1', participantRef: 'Team A', sportEventId: 'e1', categoria: 'U10', status: 'Applied' }],
    })
    expect(html).toContain('https://host/e3/#/events/e1')
    expect(html).toContain('Team A')
    expect(html).toContain('data-confirm="r1"')
    expect(html).toContain('data-reject="r1"')
  })
  it('shows an empty inbox message when no pending registrations', () => {
    expect(renderEnroll({ ...base, window: { sportEventId: 'e1', state: 'Open', categories: [] }, pending: [] }))
      .toMatch(/Nessuna richiesta/i)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run apps/e1-web/test/enroll.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `apps/e1-web/src/views/enroll.ts`**

```ts
import { renderOrganizerWorkspace, esc, copyToClipboard, type WorkspaceTab } from '@playfusion/app-shell'
import type { EventDetail, RegistrationView, RegistrationWindowView } from '@playfusion/rest-client'
import { inlineError, type Screen, type ViewCtx } from '../view.js'

export interface EnrollData { event: EventDetail; window: RegistrationWindowView; pending: RegistrationView[]; e3BaseUrl: string }

const tabs = (id: string): WorkspaceTab[] => [
  { key: 'overview', label: 'Panoramica', href: `#/events/${encodeURIComponent(id)}` },
  { key: 'enroll', label: 'Iscrizioni', href: `#/events/${encodeURIComponent(id)}/enroll` },
  { key: 'participants', label: 'Partecipanti', href: `#/events/${encodeURIComponent(id)}/participants` },
]

export function renderEnroll(d: EnrollData): string {
  const id = d.event.sportEventId
  const open = d.window.state === 'Open'
  const remaining = (c: string) => d.window.categories.find((x) => x.categoria === c)
  const capRows = d.event.categorie.map((c) => {
    const w = remaining(c)
    return `<div class="pf-field"><label>${esc(c)}${w ? ` · ${w.count}/${w.cap} (${w.remaining} liberi)` : ''}</label>
      <input type="number" min="0" data-cap="${esc(c)}" value="${w ? w.cap : ''}" placeholder="posti" /></div>`
  }).join('')
  const shareUrl = `${d.e3BaseUrl}/e3/#/events/${encodeURIComponent(id)}`
  const shareCard = open ? `<div class="pf-card"><h2>Link iscrizioni</h2>
      <div class="pf-row"><input id="share" readonly value="${esc(shareUrl)}" style="flex:1" />
        <button class="pf-btn" data-copy>Copia</button><a class="pf-btn" href="${esc(shareUrl)}" target="_blank" rel="noopener">Apri</a></div>
      <span id="copied" class="pf-muted"></span></div>` : ''
  const inbox = d.pending.length
    ? d.pending.map((r) => `<li class="pf-card"><div class="pf-row">
        <span><b>${esc(r.participantRef)}</b> · <span class="pf-mono">${esc(r.categoria)}</span></span>
        <span><button class="pf-btn pf-btn--primary" data-confirm="${esc(r.registrationId)}">Conferma</button>
          <button class="pf-btn" data-reject="${esc(r.registrationId)}">Rifiuta</button></span></div></li>`).join('')
    : `<li class="pf-card pf-muted">Nessuna richiesta in attesa.</li>`
  return `${renderOrganizerWorkspace({ name: `${esc(d.event.sport)} · ${esc(d.event.categorie.join(', '))}`, meta: `${esc(d.event.dates.from)}→${esc(d.event.dates.to)}` }, tabs(id), 'enroll')}
    <main class="pf-container">
      <div id="err"></div>
      <div class="pf-card"><h2>Finestra iscrizioni · <span class="pf-mono">${open ? 'Aperta' : 'Chiusa'}</span></h2>
        ${capRows}
        <button class="pf-btn pf-btn--primary" data-open>${open ? 'Aggiorna posti' : 'Apri iscrizioni'}</button></div>
      ${shareCard}
      <div class="pf-pagehead" style="margin-top:var(--space-lg)"><h2>Richieste in attesa</h2></div>
      <ul class="pf-stack" style="list-style:none;padding:0">${inbox}</ul>
    </main>`
}

export const enrollScreen: Screen<EnrollData> = {
  load: async (ctx, p) => {
    const [event, window, pending] = await Promise.all([
      ctx.client.o3.getEvent(p.id),
      ctx.client.o5.getRegistrationWindow(p.id),
      ctx.client.o5.listRegistrations(p.id, 'Applied'),
    ])
    return { event, window, pending, e3BaseUrl: ctx.e3BaseUrl }
  },
  render: renderEnroll,
  mount(root, ctx, d) {
    const id = d.event.sportEventId
    const err = root.querySelector('#err')!
    const fail = (m: string) => { err.innerHTML = inlineError(m) }
    root.querySelector('[data-open]')?.addEventListener('click', async () => {
      const caps: Record<string, number> = {}
      root.querySelectorAll<HTMLInputElement>('[data-cap]').forEach((i) => {
        const v = Number(i.value); if (i.value !== '' && v >= 0) caps[i.getAttribute('data-cap')!] = v
      })
      try { await ctx.client.o5.openRegistrationWindow(id, caps); ctx.refresh() } catch { fail('Apertura non riuscita.') }
    })
    root.querySelector('[data-copy]')?.addEventListener('click', async () => {
      const ok = await copyToClipboard(`${d.e3BaseUrl}/e3/#/events/${encodeURIComponent(id)}`)
      const el = root.querySelector('#copied')!; el.textContent = ok ? 'Copiato ✓' : 'Copia manuale'
    })
    root.addEventListener('click', async (e) => {
      const t = e.target as HTMLElement
      const cId = t.closest('[data-confirm]')?.getAttribute('data-confirm')
      const rId = t.closest('[data-reject]')?.getAttribute('data-reject')
      try {
        if (cId) { await ctx.client.o5.confirmRegistration(cId); ctx.refresh() }
        else if (rId) { await ctx.client.o5.rejectRegistration(rId, 'rejected by organizer'); ctx.refresh() }
      } catch { fail('Operazione non riuscita.') }
    })
  },
}
```

- [ ] **Step 4: Wire `enrollScreen`** — `main.ts` already imports `enrollScreen` from `./views/enroll.js` (Task 3 placeholder replaced by this real one).

- [ ] **Step 5: Run tests + build**

Run: `npx vitest run apps/e1-web && npm run build -w @playfusion/e1-web`
Expected: PASS; build 0.

- [ ] **Step 6: Commit**

```bash
git add apps/e1-web
git commit -m "feat(s4.3,s4.4,s4.5): Iscrizioni tab — open window (per-cat cap), share link, inbox confirm/reject"
```

---

### Task 6: S4.6/S4.7 — Partecipanti tab (confirmed + fee status + mark paid)

**Files:**
- Create: `apps/e1-web/src/views/participants.ts`, `apps/e1-web/test/participants.test.ts`, `apps/e1-web/test/mount-wiring.test.ts`

**Interfaces:**
- Consumes: `Screen`, `ViewCtx`, `inlineError` (view.ts); `renderOrganizerWorkspace`, `esc` (app-shell); `o3.getEvent`, `o5.listRegistrations(id,'Confirmed')`, `o12.listFees`, `o12.payFee` (rest-client); `FeeView`, `RegistrationView`, `EventDetail`.
- Produces: `renderParticipants(data: ParticipantsData): string` and `participantsScreen: Screen<ParticipantsData>` where
  `ParticipantsData = { event: EventDetail; confirmed: RegistrationView[]; fees: Record<string, 'Requested'|'Paid'> }`.

- [ ] **Step 1: Write the failing render test** — `apps/e1-web/test/participants.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { renderParticipants } from '../src/views/participants'

const event = { sportEventId: 'e1', sport: 'calcio', categorie: ['U10'], dates: { from: 'a', to: 'b' }, status: 'Published' as const }

describe('participants render', () => {
  it('lists confirmed participants with fee status and a pay button when unpaid', () => {
    const html = renderParticipants({
      event,
      confirmed: [
        { registrationId: 'r1', participantRef: 'Team A', sportEventId: 'e1', categoria: 'U10', status: 'Confirmed' },
        { registrationId: 'r2', participantRef: 'Team B', sportEventId: 'e1', categoria: 'U10', status: 'Confirmed' },
      ],
      fees: { r1: 'Paid', r2: 'Requested' },
    })
    expect(html).toContain('Team A'); expect(html).toContain('Pagata')
    expect(html).toContain('Team B'); expect(html).toContain('Richiesta')
    expect(html).toContain('data-pay="r2"')     // unpaid → pay button
    expect(html).not.toContain('data-pay="r1"') // paid → no pay button
  })
  it('shows an empty-state when there are no confirmed participants', () => {
    expect(renderParticipants({ event, confirmed: [], fees: {} })).toMatch(/Nessun partecipante/i)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run apps/e1-web/test/participants.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `apps/e1-web/src/views/participants.ts`**

```ts
import { renderOrganizerWorkspace, esc, type WorkspaceTab } from '@playfusion/app-shell'
import type { EventDetail, RegistrationView, FeeStatus } from '@playfusion/rest-client'
import { inlineError, type Screen } from '../view.js'

export interface ParticipantsData { event: EventDetail; confirmed: RegistrationView[]; fees: Record<string, FeeStatus> }

const tabs = (id: string): WorkspaceTab[] => [
  { key: 'overview', label: 'Panoramica', href: `#/events/${encodeURIComponent(id)}` },
  { key: 'enroll', label: 'Iscrizioni', href: `#/events/${encodeURIComponent(id)}/enroll` },
  { key: 'participants', label: 'Partecipanti', href: `#/events/${encodeURIComponent(id)}/participants` },
]

export function renderParticipants(d: ParticipantsData): string {
  const id = d.event.sportEventId
  const rows = d.confirmed.length
    ? d.confirmed.map((r) => {
        const paid = d.fees[r.registrationId] === 'Paid'
        const badge = paid ? `<span class="pf-badge" style="color:var(--color-feedback-success)">Pagata</span>`
                           : `<span class="pf-badge pf-muted">Richiesta</span>`
        const pay = paid ? '' : `<button class="pf-btn pf-btn--primary" data-pay="${esc(r.registrationId)}">Segna quota pagata</button>`
        return `<li class="pf-card"><div class="pf-row">
          <span><b>${esc(r.participantRef)}</b> · <span class="pf-mono">${esc(r.categoria)}</span></span>
          <span>${badge} ${pay}</span></div></li>`
      }).join('')
    : `<li class="pf-card pf-muted">Nessun partecipante confermato.</li>`
  return `${renderOrganizerWorkspace({ name: `${esc(d.event.sport)} · ${esc(d.event.categorie.join(', '))}`, meta: `${esc(d.event.dates.from)}→${esc(d.event.dates.to)}` }, tabs(id), 'participants')}
    <main class="pf-container">
      <div id="err"></div>
      <div class="pf-pagehead"><h1>Partecipanti confermati</h1></div>
      <ul class="pf-stack" style="list-style:none;padding:0">${rows}</ul>
    </main>`
}

export const participantsScreen: Screen<ParticipantsData> = {
  load: async (ctx, p) => {
    const [event, confirmed, feeList] = await Promise.all([
      ctx.client.o3.getEvent(p.id),
      ctx.client.o5.listRegistrations(p.id, 'Confirmed'),
      ctx.client.o12.listFees(p.id),
    ])
    const fees = Object.fromEntries(feeList.map((f) => [f.registrationId, f.status]))
    return { event, confirmed, fees }
  },
  render: renderParticipants,
  mount(root, ctx) {
    root.addEventListener('click', async (e) => {
      const rId = (e.target as HTMLElement).closest('[data-pay]')?.getAttribute('data-pay')
      if (!rId) return
      try { await ctx.client.o12.payFee(rId); ctx.refresh() }
      catch { root.querySelector('#err')!.innerHTML = inlineError('Aggiornamento quota non riuscito.') }
    })
  },
}
```

> If `libs/ui` has no `pf-badge` CSS in `chrome.css`, the badge still renders as inert markup — acceptable. If a badge style is wanted, it is out of scope here; the fee state is conveyed by the "Pagata"/"Richiesta" text.

- [ ] **Step 4: Write the mount-wiring jsdom test** — `apps/e1-web/test/mount-wiring.test.ts`

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { participantsScreen, renderParticipants } from '../src/views/participants'

it('clicking pay calls o12.payFee then refresh', async () => {
  const payFee = vi.fn().mockResolvedValue({})
  const refresh = vi.fn()
  const ctx = { client: { o12: { payFee } } as any, orgId: 'o', e3BaseUrl: '', navigate: () => {}, refresh }
  const data = { event: { sportEventId: 'e1', sport: 's', categorie: ['U10'], dates: { from: 'a', to: 'b' }, status: 'Published' as const },
    confirmed: [{ registrationId: 'r2', participantRef: 'B', sportEventId: 'e1', categoria: 'U10', status: 'Confirmed' as const }], fees: { r2: 'Requested' as const } }
  const root = document.createElement('div'); root.innerHTML = renderParticipants(data)
  participantsScreen.mount!(root, ctx as any, data)
  root.querySelector<HTMLButtonElement>('[data-pay="r2"]')!.click()
  await vi.waitFor(() => expect(payFee).toHaveBeenCalledWith('r2'))
  expect(refresh).toHaveBeenCalled()
})
```

- [ ] **Step 5: Run tests + build**

Run: `npx vitest run apps/e1-web && npm run build -w @playfusion/e1-web`
Expected: PASS; build 0.

- [ ] **Step 6: Commit**

```bash
git add apps/e1-web
git commit -m "feat(s4.6,s4.7): Partecipanti tab — confirmed list + fee status merge + mark paid"
```

---

### Task 7: Docs + full verification

**Files:**
- Modify: `README.md` (frontends section already exists — add the S4 flow note), `docs/runbooks/s0.14-first-stg-deploy.md` (o12 GSI + fee-read note; and the pre-existing-rows migration caveat)

**Interfaces:** none produced; final verification of the whole slice.

- [ ] **Step 1: Document the o12 fee-read + migration caveat** — add a short note to `docs/runbooks/s0.14-first-stg-deploy.md`: the new `o12-fees` `event-index` GSI requires a redeploy of the data + api stacks; fee rows created before this change lack `sportEventId` and won't appear in `GET /o12/events/:id/fees` (fresh collaudo unaffected).

- [ ] **Step 2: README** — under the existing "Frontends (S3)" section, note the S4 E1 flow (dashboard → create event → open window/share link → inbox → participants/fee) is now available in `apps/e1-web`.

- [ ] **Step 3: Full unit suite**

Run: `npm run test`
Expected: all green, including the new o12, rest-client, app-shell clipboard, and e1-web view/create-event/enroll/participants/mount tests.

- [ ] **Step 4: Lint (boundary proof)**

Run: `npm run lint`
Expected: PASS — `apps/e1-web` depends only on `scope:lib`; no service import; ignore pre-existing `cdk.out` warnings.

- [ ] **Step 5: Build everything**

Run: `npm run build`
Expected: all projects build.

- [ ] **Step 6: CDK synth (GSI + route)**

Run: `cd infra/cdk && npx cdk synth playfusion2-data-stg -c env=stg >/dev/null && npx tsc --noEmit && cd ../..`
Expected: exits 0; `o12-fees` has `event-index`.

- [ ] **Step 7: Local dev smoke (documented)** — with a backend (`VITE_API_BASE_URL` to a deployed/local stack) run `npm run serve -w @playfusion/e1-web` and walk: dashboard → Crea evento → open window with a cap → copy the share link → (apply a coach registration out-of-band) → Iscrizioni inbox confirm → Partecipanti → mark fee paid. Record the outcome; the full live walk depends on the pending Auth0 allow-list + a running backend, so document what was exercised vs. deferred.

- [ ] **Step 8: Commit**

```bash
git add README.md docs/runbooks/s0.14-first-stg-deploy.md
git commit -m "docs(s4): note o12 fee-read GSI/migration + E1 bundle-enrollment flow"
```

---

## Self-Review

**1. Spec coverage:**
- S4.1 dashboard → Task 4 (CTA + org-scoped list from S3) ✓
- S4.2 create event → Task 4 ✓
- S4.3 open window per-cat cap → Task 5 ✓
- S4.4 shareable link → Task 5 ✓
- S4.5 inbox confirm/reject → Task 5 ✓
- S4.6 mark fee paid → Task 6 (+ o12.payFee, event emitted by handler) ✓
- S4.7 participants + fee status → Task 6 (+ o12.listFees read, Task 1) ✓
- Backend fee read → Task 1 ✓; view-controller infra → Task 3 ✓; form CSS + clipboard → Task 2 ✓

**2. Placeholder scan:** no TBD/"implement later". Two implementer-judgment notes carry the exact fallback (create-event chip helper vs regex-extract in Task 4; consumer test mock-vs-`feeItem` refactor in Task 1) — both name the concrete alternative, not a vague deferral. The CSS port (Task 2 Step 1) gives the exact ported rules with tokens already substituted.

**3. Type consistency:** `FeeStatus`/`FeeView` defined in Task 1 (backend `read-model.ts` + rest-client `types.ts`) and consumed in Task 6. `ViewCtx`/`Screen<D>`/`runScreen`/`errorCard`/`inlineError` defined in Task 3, consumed in Tasks 4–6. `EnrollData`/`ParticipantsData` defined where produced. Workspace `tabs()` (3 tabs) defined identically in Task 3 (workspace) and reused in enroll/participants views — keep the three-entry list identical across the three files. rest-client method names (`o5.confirmRegistration`, `o5.rejectRegistration(id,reason)`, `o5.openRegistrationWindow(id,caps)`, `o12.listFees`, `o12.payFee`) match `libs/rest-client/src/{o5,o12}.ts`.

## Execution Handoff

After saving, offer the two execution options (subagent-driven recommended / inline).
