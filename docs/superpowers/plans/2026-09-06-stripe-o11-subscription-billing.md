# Stripe ↔ O11 Subscription Billing (stage, test mode) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace O11's faked subscription lifecycle with real Stripe (test mode) on `stage`: Stripe is the billing source of truth; O11 keeps a webhook-synced projection.

**Architecture:** On registration the app calls O11 `:provision`, which creates a Stripe Customer + a native 14-day trial subscription on the Club price (no card). Stripe webhooks drive O11's local projection (`TRIAL/ACTIVE/PAST_DUE/FREE`). Payment/card management happens on Stripe's hosted Billing Portal. In-app reads return the projection; no in-app checkout.

**Tech Stack:** TypeScript (ESM), Hono on AWS Lambda, DynamoDB (single-table per BC), `stripe` Node SDK, AWS CDK, GitHub Actions (OIDC), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-06-stripe-o11-subscription-billing-design.md`

## Global Constraints

- **BC boundary:** all changes are in O11 Billing (`services/o11-subscriptions/`) + its consumers (rest-client, E1, E4) + infra. Do NOT touch O12 payments. No cross-BC code imports (ADR-002).
- **Secrets:** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are **test-mode** keys, injected only via GitHub Actions secrets → `process.env` → o11 Lambda env (never committed, never in `env/*.json`). Non-secret price ids go in `infra/cdk/env/stg.json`.
- **Plan keys:** `FREE | STARTER | CLUB | ENTERPRISE`. Trial = plan `CLUB`. `SubStatus = TRIAL | ACTIVE | PAST_DUE`.
- **Money model:** Stripe recurring subscriptions, **monthly only** (annual = deferred slice 2). Enterprise is quote-based/admin — NOT self-serve, NOT provisioned by `:provision`.
- **Branch:** `feature/stripe-o11-billing` (already checked out). Commit locally only; no push/merge/tag without explicit user authorization.
- **Test isolation:** unit + integration tests mock the Stripe gateway — no network. Only the e2e is gated on real stage + Stripe test keys.
- **Node SDK:** pin `stripe` to a current major (`^17`), `apiVersion` set explicitly in the client.

---

### Task 1: Domain — extend types + `subscriptionFromStripe` mapper

**Files:**
- Modify: `services/o11-subscriptions/src/domain.ts`
- Test: `services/o11-subscriptions/test/domain-stripe.test.ts` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `type SubStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE'`
  - `interface Subscription { organizationId; plan: PlanKey; status: SubStatus; renewsOn: string; stripeCustomerId?: string; stripeSubscriptionId?: string }`
  - `type PriceToPlan = Record<string, PlanKey>`
  - `interface StripeSubShape { id: string; status: string; customer: string; trial_end: number | null; current_period_end: number | null; items: { data: Array<{ price: { id: string } }> } }`
  - `subscriptionFromStripe(organizationId: string, sub: StripeSubShape, priceToPlan: PriceToPlan): Subscription`
  - `freeSubscription(organizationId, now, ids?): Subscription` (retains stripe ids when passed)
  - `trialDaysLeft(sub, now): number` (unchanged)

- [ ] **Step 1: Write the failing tests**

```ts
// services/o11-subscriptions/test/domain-stripe.test.ts
import { describe, it, expect } from 'vitest';
import { subscriptionFromStripe, freeSubscription, type PriceToPlan, type StripeSubShape } from '../src/domain.js';

const MAP: PriceToPlan = { price_starter: 'STARTER', price_club: 'CLUB' };
const base = (over: Partial<StripeSubShape> = {}): StripeSubShape => ({
  id: 'sub_1', status: 'trialing', customer: 'cus_1', trial_end: 1767225600 /* 2026-01-01 */, current_period_end: 1769817600,
  items: { data: [{ price: { id: 'price_club' } }] }, ...over,
});

describe('subscriptionFromStripe', () => {
  it('maps a trialing club subscription to TRIAL/CLUB with renewsOn = trial_end', () => {
    expect(subscriptionFromStripe('org-1', base(), MAP)).toEqual({
      organizationId: 'org-1', plan: 'CLUB', status: 'TRIAL', renewsOn: '2026-01-01',
      stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1',
    });
  });
  it('maps active → ACTIVE with renewsOn = current_period_end', () => {
    const s = subscriptionFromStripe('org-1', base({ status: 'active', trial_end: null, current_period_end: 1769817600 }), MAP);
    expect(s).toMatchObject({ status: 'ACTIVE', plan: 'CLUB', renewsOn: '2026-01-31' });
  });
  it('maps past_due and unpaid → PAST_DUE', () => {
    expect(subscriptionFromStripe('o', base({ status: 'past_due' }), MAP).status).toBe('PAST_DUE');
    expect(subscriptionFromStripe('o', base({ status: 'unpaid' }), MAP).status).toBe('PAST_DUE');
  });
  it('maps the price id to the plan (starter)', () => {
    const s = subscriptionFromStripe('o', base({ items: { data: [{ price: { id: 'price_starter' } }] } }), MAP);
    expect(s.plan).toBe('STARTER');
  });
});

describe('freeSubscription', () => {
  it('returns FREE/ACTIVE and retains stripe ids when given', () => {
    const s = freeSubscription('org-1', new Date('2026-01-02T00:00:00Z'), { stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    expect(s).toMatchObject({ plan: 'FREE', status: 'ACTIVE', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/o11-subscriptions/test/domain-stripe.test.ts`
Expected: FAIL (`subscriptionFromStripe` not exported).

- [ ] **Step 3: Rewrite `domain.ts`**

Replace the whole file with:

```ts
// services/o11-subscriptions/src/domain.ts
// O11 subscriptions — Stripe-backed billing (Blueprint D-O11-2). Stripe is the source of truth;
// O11 stores a projection updated by webhooks. A tenant is born in a Stripe-native 14-day CLUB
// trial (no card); at trial end without a payment method Stripe cancels → the org degrades to FREE.
export type PlanKey = 'FREE' | 'STARTER' | 'CLUB' | 'ENTERPRISE';
export type SubStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE';

export interface Subscription {
  organizationId: string;
  plan: PlanKey;
  status: SubStatus;
  renewsOn: string; // 'YYYY-MM-DD' — mirrors Stripe trial_end / current_period_end
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

/** Map of Stripe price id → plan (from env: priceStarter, priceClub). */
export type PriceToPlan = Record<string, PlanKey>;

/** The subset of a Stripe Subscription object this domain reads. */
export interface StripeSubShape {
  id: string;
  status: string; // trialing | active | past_due | unpaid | canceled | incomplete | incomplete_expired
  customer: string;
  trial_end: number | null;         // unix seconds
  current_period_end: number | null; // unix seconds
  items: { data: Array<{ price: { id: string } }> };
}

const isoDay = (unixSeconds: number | null): string =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString().slice(0, 10) : '';
const addDays = (from: Date, days: number): string =>
  new Date(from.getTime() + days * 86400000).toISOString().slice(0, 10);

const STATUS: Record<string, SubStatus> = {
  trialing: 'TRIAL', active: 'ACTIVE', past_due: 'PAST_DUE', unpaid: 'PAST_DUE',
};

/** Pure projection of a Stripe subscription into our domain shape. Caller handles
 *  canceled/incomplete_expired separately (→ freeSubscription). */
export function subscriptionFromStripe(organizationId: string, sub: StripeSubShape, priceToPlan: PriceToPlan): Subscription {
  const status = STATUS[sub.status] ?? 'PAST_DUE';
  const priceId = sub.items.data[0]?.price.id ?? '';
  const plan: PlanKey = priceToPlan[priceId] ?? 'CLUB';
  const renewsOn = status === 'TRIAL' ? isoDay(sub.trial_end) : isoDay(sub.current_period_end);
  return { organizationId, plan, status, renewsOn, stripeCustomerId: sub.customer, stripeSubscriptionId: sub.id };
}

/** Cancellation / trial-lapse → limited Free (renewsOn in the past marks it lapsed). Retains ids for audit. */
export function freeSubscription(organizationId: string, now: Date, ids?: { stripeCustomerId?: string; stripeSubscriptionId?: string }): Subscription {
  return { organizationId, plan: 'FREE', status: 'ACTIVE', renewsOn: addDays(now, -1), ...ids };
}

/** Whole days left in the trial (0 once past renewsOn); only meaningful while status TRIAL. */
export function trialDaysLeft(sub: Subscription, now: Date): number {
  if (sub.status !== 'TRIAL') return 0;
  const today = new Date(now.toISOString().slice(0, 10)).getTime();
  const end = new Date(sub.renewsOn).getTime();
  return Math.max(0, Math.round((end - today) / 86400000));
}
```

Note: this deletes the old fake constructors (`trialSubscription`, `paidSubscription`, `enterpriseSubscription`, `planSubscription`). Tasks 5–6 remove their callers; the build will be red until Task 6 — that is expected within this branch.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run services/o11-subscriptions/test/domain-stripe.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/o11-subscriptions/src/domain.ts services/o11-subscriptions/test/domain-stripe.test.ts
git commit -m "feat(o11): Stripe-backed domain projection + subscriptionFromStripe mapper"
```

---

### Task 2: Stripe gateway port + adapter

**Files:**
- Modify: `services/o11-subscriptions/package.json` (add `stripe`)
- Create: `services/o11-subscriptions/src/ports/stripe-gateway.ts`
- Create: `services/o11-subscriptions/src/adapters/stripe-gateway-live.ts`
- Test: `services/o11-subscriptions/test/stripe-gateway-live.test.ts`

**Interfaces:**
- Produces:
  - `interface StripeGateway {`
    - `createTrialSubscription(input: { organizationId: string; email?: string }): Promise<StripeSubShape>`
    - `getSubscription(stripeSubscriptionId: string): Promise<StripeSubShape>`
    - `findSubscriptionByOrg(organizationId: string): Promise<StripeSubShape | undefined>`
    - `createBillingPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>`
    - `parseEvent(rawBody: string, signature: string): { type: string; object: StripeSubShape | { customer: string; subscription?: string } }`
  - `}`
  - `makeLiveStripeGateway(cfg: { secretKey: string; webhookSecret: string; clubPriceId: string }): StripeGateway`

- [ ] **Step 1: Add the dependency**

Edit `services/o11-subscriptions/package.json` `dependencies` to add:

```json
"stripe": "^17.0.0"
```

Run: `npm install` (root) to sync the lockfile.

- [ ] **Step 2: Write the port interface**

```ts
// services/o11-subscriptions/src/ports/stripe-gateway.ts
import type { StripeSubShape } from '../domain.js';

export interface StripeWebhookEvent {
  type: string;
  // For subscription.* events this is a StripeSubShape; for invoice.* it carries customer + subscription id.
  object: StripeSubShape | { customer: string; subscription?: string };
}

export interface StripeGateway {
  createTrialSubscription(input: { organizationId: string; email?: string }): Promise<StripeSubShape>;
  getSubscription(stripeSubscriptionId: string): Promise<StripeSubShape>;
  findSubscriptionByOrg(organizationId: string): Promise<StripeSubShape | undefined>;
  createBillingPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  parseEvent(rawBody: string, signature: string): StripeWebhookEvent;
}
```

- [ ] **Step 3: Write the live adapter test (constructs from cfg; delegates)**

```ts
// services/o11-subscriptions/test/stripe-gateway-live.test.ts
import { describe, it, expect, vi } from 'vitest';
import { makeLiveStripeGateway } from '../src/adapters/stripe-gateway-live.js';

// Minimal fake of the stripe SDK surface we use.
const fakeStripe = () => ({
  customers: { create: vi.fn().mockResolvedValue({ id: 'cus_1' }) },
  subscriptions: {
    create: vi.fn().mockResolvedValue({ id: 'sub_1', status: 'trialing', customer: 'cus_1', trial_end: 1, current_period_end: 2, items: { data: [{ price: { id: 'price_club' } }] } }),
    retrieve: vi.fn().mockResolvedValue({ id: 'sub_1', status: 'active', customer: 'cus_1', trial_end: null, current_period_end: 2, items: { data: [{ price: { id: 'price_club' } }] } }),
    list: vi.fn().mockResolvedValue({ data: [] }),
  },
  billingPortal: { sessions: { create: vi.fn().mockResolvedValue({ url: 'https://portal' }) } },
  webhooks: { constructEvent: vi.fn().mockReturnValue({ type: 'x', data: { object: { id: 'sub_1' } } }) },
});

describe('makeLiveStripeGateway', () => {
  it('createTrialSubscription creates a customer + trial sub with org metadata and no card', async () => {
    const s = fakeStripe();
    const gw = makeLiveStripeGateway({ secretKey: 'sk', webhookSecret: 'wh', clubPriceId: 'price_club' }, s as any);
    const sub = await gw.createTrialSubscription({ organizationId: 'org-1', email: 'a@b.c' });
    expect(s.customers.create).toHaveBeenCalledWith({ email: 'a@b.c', metadata: { organizationId: 'org-1' } });
    expect(s.subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_1', items: [{ price: 'price_club' }], trial_period_days: 14,
      metadata: { organizationId: 'org-1' }, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
    }));
    expect(sub.id).toBe('sub_1');
  });
  it('parseEvent verifies the signature and returns type + object', () => {
    const s = fakeStripe();
    const gw = makeLiveStripeGateway({ secretKey: 'sk', webhookSecret: 'wh', clubPriceId: 'price_club' }, s as any);
    const ev = gw.parseEvent('{"a":1}', 'sig');
    expect(s.webhooks.constructEvent).toHaveBeenCalledWith('{"a":1}', 'sig', 'wh');
    expect(ev.type).toBe('x');
  });
});
```

- [ ] **Step 4: Write the live adapter**

```ts
// services/o11-subscriptions/src/adapters/stripe-gateway-live.ts
import Stripe from 'stripe';
import type { StripeGateway, StripeWebhookEvent } from '../ports/stripe-gateway.js';
import type { StripeSubShape } from '../domain.js';

export interface StripeGatewayConfig { secretKey: string; webhookSecret: string; clubPriceId: string }

// `sdk` is injectable for tests; defaults to a real Stripe client.
export function makeLiveStripeGateway(cfg: StripeGatewayConfig, sdk?: Stripe): StripeGateway {
  const stripe = sdk ?? new Stripe(cfg.secretKey, { apiVersion: '2025-08-27.basil' });
  return {
    async createTrialSubscription({ organizationId, email }) {
      const customer = await stripe.customers.create({ email, metadata: { organizationId } });
      const sub = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: cfg.clubPriceId }],
        trial_period_days: 14,
        metadata: { organizationId },
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      });
      return sub as unknown as StripeSubShape;
    },
    async getSubscription(id) {
      return (await stripe.subscriptions.retrieve(id)) as unknown as StripeSubShape;
    },
    async findSubscriptionByOrg(organizationId) {
      // metadata is not directly queryable; search by customer metadata via the Search API.
      const res = await stripe.subscriptions.search({ query: `metadata['organizationId']:'${organizationId}'`, limit: 1 });
      return (res.data[0] as unknown as StripeSubShape) ?? undefined;
    },
    async createBillingPortalSession({ customerId, returnUrl }) {
      const s = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
      return { url: s.url };
    },
    parseEvent(rawBody, signature): StripeWebhookEvent {
      const ev = stripe.webhooks.constructEvent(rawBody, signature, cfg.webhookSecret);
      return { type: ev.type, object: ev.data.object as StripeWebhookEvent['object'] };
    },
  };
}
```

- [ ] **Step 5: Run the adapter test**

Run: `npx vitest run services/o11-subscriptions/test/stripe-gateway-live.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/o11-subscriptions/package.json services/o11-subscriptions/src/ports/stripe-gateway.ts services/o11-subscriptions/src/adapters/stripe-gateway-live.ts services/o11-subscriptions/test/stripe-gateway-live.test.ts package-lock.json
git commit -m "feat(o11): Stripe gateway port + live adapter (trial, portal, webhook parse)"
```

---

### Task 3: Application — provision (create Stripe trial, idempotent)

**Files:**
- Modify: `services/o11-subscriptions/src/application/subscription.ts`
- Test: `services/o11-subscriptions/test/subscription.test.ts` (rewrite)

**Interfaces:**
- Consumes: `SubscriptionRepository` (`get`/`save`), `StripeGateway`, `PriceToPlan`, `subscriptionFromStripe`, `freeSubscription`, `trialDaysLeft`.
- Produces:
  - `type Deps = { repo: SubscriptionRepository; stripe: StripeGateway; priceToPlan: PriceToPlan; now?: () => Date }`
  - `getSubscription(d)(orgId): Promise<SubscriptionView>` — pure read (no side effects)
  - `provision(d)(orgId, email?): Promise<SubscriptionView>` — idempotent Stripe trial creation
  - `SubscriptionView extends Subscription { trialDaysLeft: number }`

- [ ] **Step 1: Write failing tests**

```ts
// services/o11-subscriptions/test/subscription.test.ts
import { describe, it, expect, vi } from 'vitest';
import { getSubscription, provision } from '../src/application/subscription.js';
import type { SubscriptionRepository } from '../src/ports.js';
import type { Subscription } from '../src/domain.js';
import type { StripeGateway } from '../src/ports/stripe-gateway.js';

class InMemoryRepo implements SubscriptionRepository {
  readonly byOrg = new Map<string, Subscription>();
  async get(o: string) { return this.byOrg.get(o); }
  async save(s: Subscription) { this.byOrg.set(s.organizationId, s); }
}
const MAP = { price_club: 'CLUB' as const, price_starter: 'STARTER' as const };
const now = () => new Date('2026-01-01T00:00:00Z');
const trialSub = { id: 'sub_1', status: 'trialing', customer: 'cus_1', trial_end: 1767225600, current_period_end: 1769817600, items: { data: [{ price: { id: 'price_club' } }] } };
const gw = (over: Partial<StripeGateway> = {}): StripeGateway => ({
  createTrialSubscription: vi.fn().mockResolvedValue(trialSub),
  getSubscription: vi.fn().mockResolvedValue(trialSub),
  findSubscriptionByOrg: vi.fn().mockResolvedValue(undefined),
  createBillingPortalSession: vi.fn().mockResolvedValue({ url: 'https://portal' }),
  parseEvent: vi.fn(),
  ...over,
});

describe('provision', () => {
  it('creates a Stripe trial and stores a CLUB/TRIAL projection', async () => {
    const repo = new InMemoryRepo(); const stripe = gw();
    const s = await provision({ repo, stripe, priceToPlan: MAP, now })('org-1', 'a@b.c');
    expect(stripe.createTrialSubscription).toHaveBeenCalledWith({ organizationId: 'org-1', email: 'a@b.c' });
    expect(s).toMatchObject({ plan: 'CLUB', status: 'TRIAL', stripeSubscriptionId: 'sub_1', trialDaysLeft: expect.any(Number) });
    expect(repo.byOrg.get('org-1')).toBeTruthy();
  });
  it('is idempotent: if a projection with a stripe sub exists, it does not create another', async () => {
    const repo = new InMemoryRepo();
    await repo.save({ organizationId: 'org-1', plan: 'CLUB', status: 'TRIAL', renewsOn: '2026-01-15', stripeSubscriptionId: 'sub_1' });
    const stripe = gw();
    await provision({ repo, stripe, priceToPlan: MAP, now })('org-1');
    expect(stripe.createTrialSubscription).not.toHaveBeenCalled();
  });
});

describe('getSubscription', () => {
  it('returns the stored projection without side effects', async () => {
    const repo = new InMemoryRepo();
    await repo.save({ organizationId: 'org-1', plan: 'STARTER', status: 'ACTIVE', renewsOn: '2026-02-01', stripeSubscriptionId: 'sub_9' });
    const stripe = gw();
    const s = await getSubscription({ repo, stripe, priceToPlan: MAP, now })('org-1');
    expect(s).toMatchObject({ plan: 'STARTER', status: 'ACTIVE', trialDaysLeft: 0 });
    expect(stripe.createTrialSubscription).not.toHaveBeenCalled();
  });
  it('returns a FREE-shaped default when nothing is provisioned', async () => {
    const s = await getSubscription({ repo: new InMemoryRepo(), stripe: gw(), priceToPlan: MAP, now })('org-x');
    expect(s).toMatchObject({ plan: 'FREE', status: 'ACTIVE' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/o11-subscriptions/test/subscription.test.ts`
Expected: FAIL (`provision` not exported; old `activatePro`/`expireTrial`/`adminSetPlan` imports gone).

- [ ] **Step 3: Rewrite `application/subscription.ts`**

```ts
// services/o11-subscriptions/src/application/subscription.ts
import { checkpoint } from '@playfusion/platform-lib';
import { subscriptionFromStripe, freeSubscription, trialDaysLeft, type Subscription, type PriceToPlan } from '../domain.js';
import type { SubscriptionRepository } from '../ports.js';
import type { StripeGateway } from '../ports/stripe-gateway.js';

export type Deps = { repo: SubscriptionRepository; stripe: StripeGateway; priceToPlan: PriceToPlan; now?: () => Date };
const clock = (d: Deps) => (d.now ?? (() => new Date()))();

export interface SubscriptionView extends Subscription { trialDaysLeft: number }
const view = (sub: Subscription, now: Date): SubscriptionView => ({ ...sub, trialDaysLeft: trialDaysLeft(sub, now) });

/** Pure read of the projection. No side effects; FREE-shaped default when unprovisioned. */
export const getSubscription = (d: Deps) => async (organizationId: string): Promise<SubscriptionView> => {
  const now = clock(d);
  const existing = await d.repo.get(organizationId);
  return view(existing ?? { organizationId, plan: 'FREE', status: 'ACTIVE', renewsOn: '' }, now);
};

/** Create a Stripe-native 14-day CLUB trial (no card) and store the projection. Idempotent. */
export const provision = (d: Deps) => async (organizationId: string, email?: string): Promise<SubscriptionView> => {
  const now = clock(d);
  const existing = await d.repo.get(organizationId);
  if (existing?.stripeSubscriptionId) return view(existing, now);
  const stripeSub = await d.stripe.createTrialSubscription({ organizationId, email });
  const sub = subscriptionFromStripe(organizationId, stripeSub, d.priceToPlan);
  await d.repo.save(sub);
  checkpoint('provisionTrial', 'STOP', { organizationId, stripeSubscriptionId: sub.stripeSubscriptionId, renewsOn: sub.renewsOn });
  return view(sub, now);
};
```

(freeSubscription import stays available for Task 4/5; keep it imported there.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run services/o11-subscriptions/test/subscription.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/o11-subscriptions/src/application/subscription.ts services/o11-subscriptions/test/subscription.test.ts
git commit -m "feat(o11): pure getSubscription + idempotent provision (Stripe trial)"
```

---

### Task 4: Application — portal + resync

**Files:**
- Modify: `services/o11-subscriptions/src/application/subscription.ts`
- Test: `services/o11-subscriptions/test/subscription-portal-resync.test.ts` (create)

**Interfaces:**
- Produces:
  - `billingPortal(d)(orgId, returnUrl): Promise<{ url: string }>`
  - `resync(d)(orgId): Promise<SubscriptionView>` — refetch from Stripe, rewrite projection

- [ ] **Step 1: Write failing tests**

```ts
// services/o11-subscriptions/test/subscription-portal-resync.test.ts
import { describe, it, expect, vi } from 'vitest';
import { billingPortal, resync } from '../src/application/subscription.js';
import type { SubscriptionRepository } from '../src/ports.js';
import type { Subscription } from '../src/domain.js';
import type { StripeGateway } from '../src/ports/stripe-gateway.js';

class Repo implements SubscriptionRepository { m = new Map<string, Subscription>(); async get(o:string){return this.m.get(o);} async save(s:Subscription){this.m.set(s.organizationId,s);} }
const MAP = { price_club: 'CLUB' as const };
const now = () => new Date('2026-01-01T00:00:00Z');
const gw = (over: Partial<StripeGateway> = {}): StripeGateway => ({
  createTrialSubscription: vi.fn(), getSubscription: vi.fn(), findSubscriptionByOrg: vi.fn(),
  createBillingPortalSession: vi.fn().mockResolvedValue({ url: 'https://portal' }), parseEvent: vi.fn(), ...over,
});

describe('billingPortal', () => {
  it('creates a portal session for the org customer', async () => {
    const repo = new Repo(); await repo.save({ organizationId: 'org-1', plan: 'CLUB', status: 'TRIAL', renewsOn: '2026-01-15', stripeCustomerId: 'cus_1' });
    const stripe = gw();
    const out = await billingPortal({ repo, stripe, priceToPlan: MAP, now })('org-1', 'https://app/return');
    expect(stripe.createBillingPortalSession).toHaveBeenCalledWith({ customerId: 'cus_1', returnUrl: 'https://app/return' });
    expect(out.url).toBe('https://portal');
  });
});

describe('resync', () => {
  it('refetches the Stripe sub and rewrites the projection', async () => {
    const repo = new Repo(); await repo.save({ organizationId: 'org-1', plan: 'CLUB', status: 'TRIAL', renewsOn: 'x', stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1' });
    const stripe = gw({ getSubscription: vi.fn().mockResolvedValue({ id: 'sub_1', status: 'active', customer: 'cus_1', trial_end: null, current_period_end: 1769817600, items: { data: [{ price: { id: 'price_club' } }] } }) });
    const s = await resync({ repo, stripe, priceToPlan: MAP, now })('org-1');
    expect(s).toMatchObject({ status: 'ACTIVE', plan: 'CLUB', renewsOn: '2026-01-31' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/o11-subscriptions/test/subscription-portal-resync.test.ts`
Expected: FAIL (`billingPortal`/`resync` not exported).

- [ ] **Step 3: Append to `application/subscription.ts`**

```ts
import { DomainError } from '@playfusion/platform-lib';

/** Create a hosted Stripe Billing Portal session for the org's customer. */
export const billingPortal = (d: Deps) => async (organizationId: string, returnUrl: string): Promise<{ url: string }> => {
  const sub = await d.repo.get(organizationId);
  if (!sub?.stripeCustomerId) throw new DomainError('No Stripe customer for this organization', 409);
  return d.stripe.createBillingPortalSession({ customerId: sub.stripeCustomerId, returnUrl });
};

/** Debug/admin: refetch the org's Stripe subscription and rewrite the local projection. */
export const resync = (d: Deps) => async (organizationId: string): Promise<SubscriptionView> => {
  const now = clock(d);
  const cur = await d.repo.get(organizationId);
  if (!cur?.stripeSubscriptionId) throw new DomainError('Nothing to resync (no Stripe subscription)', 409);
  const stripeSub = await d.stripe.getSubscription(cur.stripeSubscriptionId);
  const sub = subscriptionFromStripe(organizationId, stripeSub, d.priceToPlan);
  await d.repo.save(sub);
  return view(sub, now);
};
```

(Verify `DomainError`'s constructor signature `(message, httpStatus)` against `libs/platform-lib/src/errors.ts`; adjust the call if it differs.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run services/o11-subscriptions/test/subscription-portal-resync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/o11-subscriptions/src/application/subscription.ts services/o11-subscriptions/test/subscription-portal-resync.test.ts
git commit -m "feat(o11): billing portal session + admin resync"
```

---

### Task 5: Application — webhook event handling

**Files:**
- Create: `services/o11-subscriptions/src/application/webhook.ts`
- Test: `services/o11-subscriptions/test/webhook.test.ts`

**Interfaces:**
- Produces: `handleStripeEvent(d)(rawBody: string, signature: string): Promise<{ handled: string }>`
  - verifies signature via `d.stripe.parseEvent`
  - maps event.type → projection write (`subscriptionFromStripe` or `freeSubscription`)
  - resolves org from `object.metadata.organizationId` (subscription events) or by looking up the stored projection via `stripeCustomerId`/`stripeSubscriptionId` (invoice events)

- [ ] **Step 1: Write failing tests**

```ts
// services/o11-subscriptions/test/webhook.test.ts
import { describe, it, expect, vi } from 'vitest';
import { handleStripeEvent } from '../src/application/webhook.js';
import type { SubscriptionRepository } from '../src/ports.js';
import type { Subscription } from '../src/domain.js';
import type { StripeGateway, StripeWebhookEvent } from '../src/ports/stripe-gateway.js';

class Repo implements SubscriptionRepository { m = new Map<string, Subscription>(); async get(o:string){return this.m.get(o);} async save(s:Subscription){this.m.set(s.organizationId,s);} }
const MAP = { price_club: 'CLUB' as const, price_starter: 'STARTER' as const };
const now = () => new Date('2026-01-01T00:00:00Z');
const subObj = (over = {}) => ({ id: 'sub_1', status: 'active', customer: 'cus_1', trial_end: null, current_period_end: 1769817600, items: { data: [{ price: { id: 'price_club' } }] }, metadata: { organizationId: 'org-1' }, ...over });
const gw = (event: StripeWebhookEvent): StripeGateway => ({
  createTrialSubscription: vi.fn(), getSubscription: vi.fn(), findSubscriptionByOrg: vi.fn(),
  createBillingPortalSession: vi.fn(), parseEvent: vi.fn().mockReturnValue(event),
});

describe('handleStripeEvent', () => {
  it('subscription.updated → writes the projection (ACTIVE/CLUB)', async () => {
    const repo = new Repo();
    await handleStripeEvent({ repo, stripe: gw({ type: 'customer.subscription.updated', object: subObj() as any }), priceToPlan: MAP, now })('{}', 'sig');
    expect(repo.m.get('org-1')).toMatchObject({ status: 'ACTIVE', plan: 'CLUB' });
  });
  it('subscription.deleted → FREE', async () => {
    const repo = new Repo(); await repo.save({ organizationId: 'org-1', plan: 'CLUB', status: 'TRIAL', renewsOn: 'x', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    await handleStripeEvent({ repo, stripe: gw({ type: 'customer.subscription.deleted', object: subObj({ status: 'canceled' }) as any }), priceToPlan: MAP, now })('{}', 'sig');
    expect(repo.m.get('org-1')).toMatchObject({ plan: 'FREE', status: 'ACTIVE', stripeCustomerId: 'cus_1' });
  });
  it('invoice.payment_failed → PAST_DUE (org resolved by stored subscription id)', async () => {
    const repo = new Repo(); await repo.save({ organizationId: 'org-1', plan: 'CLUB', status: 'ACTIVE', renewsOn: 'x', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    await handleStripeEvent({ repo, stripe: gw({ type: 'invoice.payment_failed', object: { customer: 'cus_1', subscription: 'sub_1' } }), priceToPlan: MAP, now })('{}', 'sig');
    expect(repo.m.get('org-1')).toMatchObject({ status: 'PAST_DUE' });
  });
  it('ignores unrelated event types', async () => {
    const repo = new Repo();
    const out = await handleStripeEvent({ repo, stripe: gw({ type: 'customer.created', object: subObj() as any }), priceToPlan: MAP, now })('{}', 'sig');
    expect(out.handled).toBe('ignored');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/o11-subscriptions/test/webhook.test.ts`
Expected: FAIL (`handleStripeEvent` not defined).

- [ ] **Step 3: Write `application/webhook.ts`**

```ts
// services/o11-subscriptions/src/application/webhook.ts
import { checkpoint } from '@playfusion/platform-lib';
import { subscriptionFromStripe, freeSubscription, type Subscription, type StripeSubShape } from '../domain.js';
import type { Deps } from './subscription.js';

type OrgId = string;
async function orgFromStored(d: Deps, subscriptionId?: string, customerId?: string): Promise<Subscription | undefined> {
  // We key the projection by organizationId, so a reverse lookup would need a scan; instead invoice.*
  // events carry the subscription/customer id and we already stored them. In practice the paired
  // subscription.updated event (which carries metadata.organizationId) arrives too, so PAST_DUE can
  // also be derived there. For robustness we look up by the subscription object's metadata first.
  return undefined; // resolved by caller via metadata; see below.
}

export const handleStripeEvent = (d: Deps) => async (rawBody: string, signature: string): Promise<{ handled: string }> => {
  const now = (d.now ?? (() => new Date()))();
  const ev = d.stripe.parseEvent(rawBody, signature); // throws on bad signature
  const obj = ev.object as any;

  const resolveOrg = (): OrgId | undefined => obj?.metadata?.organizationId;

  switch (ev.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const orgId = resolveOrg();
      if (!orgId) return { handled: 'no-org' };
      await d.repo.save(subscriptionFromStripe(orgId, obj as StripeSubShape, d.priceToPlan));
      checkpoint('stripeWebhook', 'STOP', { type: ev.type, orgId });
      return { handled: ev.type };
    }
    case 'customer.subscription.deleted': {
      const orgId = resolveOrg();
      if (!orgId) return { handled: 'no-org' };
      const prev = await d.repo.get(orgId);
      await d.repo.save(freeSubscription(orgId, now, { stripeCustomerId: prev?.stripeCustomerId, stripeSubscriptionId: prev?.stripeSubscriptionId }));
      return { handled: ev.type };
    }
    case 'invoice.payment_failed': {
      const subId = obj?.subscription as string | undefined;
      const stripeSub = subId ? await d.stripe.getSubscription(subId) : undefined;
      const orgId = (stripeSub as any)?.metadata?.organizationId;
      if (!orgId || !stripeSub) return { handled: 'no-org' };
      await d.repo.save({ ...subscriptionFromStripe(orgId, stripeSub, d.priceToPlan), status: 'PAST_DUE' });
      return { handled: ev.type };
    }
    case 'invoice.paid': {
      const subId = obj?.subscription as string | undefined;
      const stripeSub = subId ? await d.stripe.getSubscription(subId) : undefined;
      const orgId = (stripeSub as any)?.metadata?.organizationId;
      if (!orgId || !stripeSub) return { handled: 'no-org' };
      await d.repo.save(subscriptionFromStripe(orgId, stripeSub, d.priceToPlan));
      return { handled: ev.type };
    }
    default:
      return { handled: 'ignored' };
  }
};
```

Note: `getSubscription` returns the raw Stripe object which we extend to expose `metadata`; ensure `StripeSubShape` retrieval in the gateway does not strip `metadata` (it doesn't — the SDK object carries it). Delete the unused `orgFromStored` stub before committing.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run services/o11-subscriptions/test/webhook.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add services/o11-subscriptions/src/application/webhook.ts services/o11-subscriptions/test/webhook.test.ts
git commit -m "feat(o11): map Stripe webhook events to the subscription projection"
```

---

### Task 6: Handler — routes (provision/portal/resync/webhook), remove fakes, deps wiring

**Files:**
- Modify: `services/o11-subscriptions/src/handler.ts`
- Test: `services/o11-subscriptions/test/handler.test.ts` (create)

**Interfaces:**
- Routes: `GET /organizations/:orgId/subscription` (organizer), `POST .../subscription:provision` (owner, body `{ email? }`), `POST .../subscription:portal` (owner, body `{ returnUrl }` → `{ url }`), `POST .../subscription:resync` (platformAdmin), `POST /webhooks/stripe` (public, raw body + `stripe-signature`).
- Deps built from env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_CLUB`, `STRIPE_PRICE_STARTER`.

- [ ] **Step 1: Write the handler test (mocked gateway via env-less deps)**

Because the handler builds its own gateway from env, extract a `buildDeps()` you can override in tests, OR test the app with a factory. Use the factory form:

```ts
// services/o11-subscriptions/test/handler.test.ts
import { describe, it, expect, vi } from 'vitest';
import { makeApp } from '../src/handler.js';
import type { StripeGateway } from '../src/ports/stripe-gateway.js';
import type { SubscriptionRepository } from '../src/ports.js';
import type { Subscription } from '../src/domain.js';

class Repo implements SubscriptionRepository { m = new Map<string, Subscription>(); async get(o:string){return this.m.get(o);} async save(s:Subscription){this.m.set(s.organizationId,s);} }
const trialSub = { id: 'sub_1', status: 'trialing', customer: 'cus_1', trial_end: 1767225600, current_period_end: 1769817600, items: { data: [{ price: { id: 'price_club' } }] }, metadata: { organizationId: 'org-1' } };
const gw: StripeGateway = {
  createTrialSubscription: vi.fn().mockResolvedValue(trialSub), getSubscription: vi.fn().mockResolvedValue(trialSub),
  findSubscriptionByOrg: vi.fn(), createBillingPortalSession: vi.fn().mockResolvedValue({ url: 'https://portal' }),
  parseEvent: vi.fn().mockReturnValue({ type: 'customer.subscription.updated', object: { ...trialSub, status: 'active' } }),
};

const deps = () => ({ repo: new Repo(), stripe: gw, priceToPlan: { price_club: 'CLUB' as const } });

describe('o11 webhook route (public)', () => {
  it('processes a signed webhook without auth', async () => {
    const app = makeApp(deps());
    const res = await app.request('/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 'sig' }, body: '{}' });
    expect(res.status).toBe(200);
  });
  it('rejects a webhook with a bad signature', async () => {
    const bad = { ...gw, parseEvent: vi.fn(() => { throw new Error('bad sig'); }) };
    const app = makeApp({ ...deps(), stripe: bad });
    const res = await app.request('/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 'x' }, body: '{}' });
    expect(res.status).toBe(400);
  });
});
```

(Auth-protected routes are covered by the integration flow; the unit test focuses on the public webhook and signature handling, which is the novel surface.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/o11-subscriptions/test/handler.test.ts`
Expected: FAIL (`makeApp` not exported).

- [ ] **Step 3: Rewrite `handler.ts`**

```ts
// services/o11-subscriptions/src/handler.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { randomUUID } from 'node:crypto';
import {
  withCorrelation, currentCorrelationId, toHttpError, checkpoint,
  makeDocClient, auth0ConfigFromEnv, createAuth0Verifier, requireOrganizer, requireOwner, requirePlatformAdmin,
} from '@playfusion/platform-lib';
import { z } from 'zod';
import { DynamoDbSubscriptionRepository } from './adapters/dynamodb-subscription-repository.js';
import { makeLiveStripeGateway } from './adapters/stripe-gateway-live.js';
import { getSubscription, provision, billingPortal, resync, type Deps } from './application/subscription.js';
import { handleStripeEvent } from './application/webhook.js';
import type { StripeGateway } from './ports/stripe-gateway.js';
import type { PriceToPlan } from './domain.js';

const auth0cfg = auth0ConfigFromEnv();
const verifier = auth0cfg ? createAuth0Verifier(auth0cfg) : undefined;
const organizer = requireOrganizer({ auth0: verifier, allowPlatformAdmin: true });
const owner = requireOwner({ auth0: verifier });
const platformAdmin = requirePlatformAdmin({ auth0: verifier });

const priceToPlan: PriceToPlan = {
  ...(process.env.STRIPE_PRICE_STARTER ? { [process.env.STRIPE_PRICE_STARTER]: 'STARTER' as const } : {}),
  ...(process.env.STRIPE_PRICE_CLUB ? { [process.env.STRIPE_PRICE_CLUB]: 'CLUB' as const } : {}),
};

export function defaultDeps(): Deps {
  const repo = new DynamoDbSubscriptionRepository(makeDocClient());
  const stripe: StripeGateway = makeLiveStripeGateway({
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    clubPriceId: process.env.STRIPE_PRICE_CLUB ?? '',
  });
  return { repo, stripe, priceToPlan };
}

const provisionBody = z.object({ email: z.string().email().optional() });
const portalBody = z.object({ returnUrl: z.string().url() });

export function makeApp(deps: Deps): Hono {
  const app = new Hono();
  app.use('*', cors({ origin: '*', allowHeaders: ['content-type', 'authorization', 'x-organization-id', 'x-correlation-id', 'stripe-signature'], allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));

  // Public Stripe webhook — no JWT; the Stripe signature is the auth. Uses the RAW body.
  app.post('/webhooks/stripe', async (c) => {
    const sig = c.req.header('stripe-signature') ?? '';
    const raw = await c.req.text();
    const out = await handleStripeEvent(deps)(raw, sig);
    return c.json(out);
  });

  app.get('/organizations/:orgId/subscription', organizer, async (c) => c.json(await getSubscription(deps)(c.req.param('orgId'))));
  app.post('/organizations/:orgId/subscription:provision', owner, async (c) => {
    const b = provisionBody.parse(await c.req.json().catch(() => ({})));
    return c.json(await provision(deps)(c.req.param('orgId'), b.email));
  });
  app.post('/organizations/:orgId/subscription:portal', owner, async (c) => {
    const b = portalBody.parse(await c.req.json());
    return c.json(await billingPortal(deps)(c.req.param('orgId'), b.returnUrl));
  });
  app.post('/admin/organizations/:orgId/subscription:resync', platformAdmin, async (c) => c.json(await resync(deps)(c.req.param('orgId'))));

  app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any); });
  return app;
}

export const app = makeApp(defaultDeps());

import { handle } from 'hono/aws-lambda';
const inner = handle(app);
export const handler = async (event: any, ctx: any) => {
  if (event?.pathParameters?.proxy != null) event.path = `/${event.pathParameters.proxy}`;
  const correlationId = event.headers?.['x-correlation-id'] ?? randomUUID();
  return withCorrelation(correlationId, async () => {
    checkpoint('o11-handler', 'START', { path: event.rawPath ?? event.path, correlationId: currentCorrelationId() });
    try { return await inner(event, ctx); }
    finally { checkpoint('o11-handler', 'STOP', {}); }
  });
};
```

Notes:
- The bad-signature test relies on `toHttpError` mapping a thrown error to a status. Stripe's `constructEvent` throws a plain `Error`; to get **400** (not 500), wrap `parseEvent` failures: in `handleStripeEvent`, catch the throw and rethrow as `new DomainError('Invalid Stripe signature', 400)`. Add that try/catch around `d.stripe.parseEvent(...)` in Task 5's file and add a test for it (or adjust the Task 6 test to expect 400 via that mapping).
- **Raw body + API Gateway:** confirm the REST API is not base64-encoding the JSON body (default for `application/json` is not binary). `c.req.text()` yields the exact raw string Stripe signed. If a future change adds binary media types, the webhook must decode base64 first.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run services/o11-subscriptions/test/handler.test.ts`
Expected: PASS.

- [ ] **Step 5: Update Task 5 for the signature→400 mapping**

In `application/webhook.ts`, wrap the parse:

```ts
import { DomainError } from '@playfusion/platform-lib';
// ...
let ev;
try { ev = d.stripe.parseEvent(rawBody, signature); }
catch { throw new DomainError('Invalid Stripe signature', 400); }
```

Add a test in `webhook.test.ts`:

```ts
it('throws 400 on a bad signature', async () => {
  const stripe = gw({ type: 'x', object: {} as any });
  (stripe.parseEvent as any) = vi.fn(() => { throw new Error('bad'); });
  await expect(handleStripeEvent({ repo: new Repo(), stripe, priceToPlan: MAP, now })('{}', 'x'))
    .rejects.toMatchObject({ httpStatus: 400 });
});
```

Run: `npx vitest run services/o11-subscriptions/test/webhook.test.ts services/o11-subscriptions/test/handler.test.ts`
Expected: PASS. (Adjust the `httpStatus` property name to match `DomainError`.)

- [ ] **Step 6: Commit**

```bash
git add services/o11-subscriptions/src/handler.ts services/o11-subscriptions/src/application/webhook.ts services/o11-subscriptions/test/handler.test.ts services/o11-subscriptions/test/webhook.test.ts
git commit -m "feat(o11): handler routes (provision/portal/resync/webhook); remove fake activate/expire/adminSetPlan"
```

---

### Task 7: rest-client — O11 API surface

**Files:**
- Modify: `libs/rest-client/src/o11.ts`
- Modify: `libs/rest-client/src/types.ts` (remove `AdminSetPlanInput`; keep `Subscription` + add optional stripe ids + `SubStatus` PAST_DUE)
- Modify: `libs/rest-client/test/o11.test.ts`
- Modify: `libs/rest-client/test/admin.test.ts` (drop the `adminSetPlan` case)

**Interfaces:**
- Produces `O11Api`: `getSubscription(orgId)`, `provision(orgId, email?)`, `openBillingPortal(orgId, returnUrl): Promise<{ url: string }>`, `resync(orgId)`. Remove `activatePlan`, `expireTrial`, `adminSetPlan`.

- [ ] **Step 1: Update `types.ts`**

```ts
// replace the S20 block
export type PlanKey = 'FREE' | 'STARTER' | 'CLUB' | 'ENTERPRISE'
export type SubStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE'
export interface Subscription { organizationId: string; plan: PlanKey; status: SubStatus; renewsOn: string; trialDaysLeft: number; stripeCustomerId?: string; stripeSubscriptionId?: string }
```

Delete `export interface AdminSetPlanInput ...`. Remove `SelfServePlan` if now unused (grep first).

- [ ] **Step 2: Update `o11.ts`**

```ts
import { request, type HttpConfig } from './http.js'
import type { Subscription } from './types.js'

export interface O11Api {
  getSubscription(organizationId: string): Promise<Subscription>
  provision(organizationId: string, email?: string): Promise<Subscription>
  openBillingPortal(organizationId: string, returnUrl: string): Promise<{ url: string }>
  resync(organizationId: string): Promise<Subscription>
}
const enc = encodeURIComponent
export const o11 = (cfg: HttpConfig): O11Api => ({
  getSubscription: (orgId) => request(cfg, 'GET', `/o11/organizations/${enc(orgId)}/subscription`),
  provision: (orgId, email) => request(cfg, 'POST', `/o11/organizations/${enc(orgId)}/subscription:provision`, email ? { email } : {}),
  openBillingPortal: (orgId, returnUrl) => request(cfg, 'POST', `/o11/organizations/${enc(orgId)}/subscription:portal`, { returnUrl }),
  resync: (orgId) => request(cfg, 'POST', `/o11/admin/organizations/${enc(orgId)}/subscription:resync`),
})
```

- [ ] **Step 3: Rewrite `libs/rest-client/test/o11.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../src/client'
const res = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

describe('o11 subscription api', () => {
  it('provision POSTs to subscription:provision', async () => {
    const f = vi.fn().mockResolvedValue(res({ organizationId: 'o', plan: 'CLUB', status: 'TRIAL', renewsOn: '2026-01-15', trialDaysLeft: 14 }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: f })
    const out = await c.o11.provision('o', 'a@b.c')
    expect(f.mock.calls[0][0]).toBe('https://api/prod/o11/organizations/o/subscription:provision')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ email: 'a@b.c' })
    expect(out.status).toBe('TRIAL')
  })
  it('openBillingPortal returns the hosted url', async () => {
    const f = vi.fn().mockResolvedValue(res({ url: 'https://portal' }))
    const c = createClient({ baseUrl: 'https://api/prod', fetch: f })
    const out = await c.o11.openBillingPortal('o', 'https://app/return')
    expect(f.mock.calls[0][0]).toBe('https://api/prod/o11/organizations/o/subscription:portal')
    expect(out.url).toBe('https://portal')
  })
})
```

- [ ] **Step 4: Fix `admin.test.ts`**

Delete the `o11.adminSetPlan` test case (the `adminSetPlan` method no longer exists). Leave the other admin cases.

- [ ] **Step 5: Run**

Run: `npx vitest run libs/rest-client`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/rest-client/src/o11.ts libs/rest-client/src/types.ts libs/rest-client/test/o11.test.ts libs/rest-client/test/admin.test.ts
git commit -m "feat(rest-client): O11 provision/portal/resync; drop fake activate/adminSetPlan"
```

---

### Task 8: E1 subscription view — Billing Portal + PAST_DUE

**Files:**
- Modify: `apps/e1-web/src/views/subscription.ts`
- Modify: `apps/e1-web/test/subscription.test.ts`

**Interfaces:** the view calls `ctx.client.o11.openBillingPortal(orgId, <currentUrl>)` and redirects to the returned `url`.

- [ ] **Step 1: Update the view**

Replace the plan-card CTAs so paid cards no longer call the removed `activatePlan`. The single management action is a **"Gestisci abbonamento"** button (`id="manage-billing"`) shown when the org has a Stripe customer (TRIAL/ACTIVE/PAST_DUE). Add a PAST_DUE notice line in `statusLine`:

```ts
function statusLine(sub: Subscription): string {
  if (sub.status === 'TRIAL') return `<span class="pf-badge">Prova Club</span> <b>${sub.trialDaysLeft}</b> giorn${sub.trialDaysLeft === 1 ? 'o' : 'i'} rimast${sub.trialDaysLeft === 1 ? 'o' : 'i'}`
  if (sub.status === 'PAST_DUE') return `<span class="pf-badge pf-badge--warn">Pagamento in sospeso</span> Aggiorna il metodo di pagamento`
  return sub.plan === 'FREE' ? `<span class="pf-badge">Free</span> Piano gratuito limitato` : `<span class="pf-badge">${esc(planLabel(sub.plan))}</span> Attivo · rinnovo ${esc(sub.renewsOn)}`
}
```

In `renderSubscription`, replace the trial `expire-trial` lever and the per-card activate buttons with a single management button (rendered when `sub.plan !== 'FREE' || sub.status !== 'ACTIVE'`):

```ts
const manage = (sub.status !== 'ACTIVE' || sub.plan !== 'FREE')
  ? `<button class="pf-btn pf-btn--primary" id="manage-billing">Gestisci abbonamento</button>`
  : ''
```

Keep the 4 plan cards as **informational** (price + features), Enterprise still "Contattaci". Remove `id="activate-starter"`/`id="activate-club"` buttons.

In `mount`, replace the activate handlers with:

```ts
root.querySelector<HTMLButtonElement>('#manage-billing')?.addEventListener('click', async () => {
  try { const { url } = await ctx.client.o11.openBillingPortal(ctx.orgId, location.href); location.assign(url) }
  catch { fail('Impossibile aprire la gestione abbonamento. Riprova.') }
})
```

- [ ] **Step 2: Update `apps/e1-web/test/subscription.test.ts`**

```ts
const sub = (over: Partial<Subscription> = {}): Subscription =>
  ({ organizationId: 'org-1', plan: 'CLUB', status: 'TRIAL', renewsOn: '2026-09-15', trialDaysLeft: 14, stripeCustomerId: 'cus_1', ...over })

describe('renderSubscription', () => {
  it('trial shows days left and the manage-billing CTA', () => {
    const html = renderSubscription(sub())
    expect(html).toContain('Prova Club'); expect(html).toContain('id="manage-billing"')
  })
  it('past_due shows the warning and manage CTA', () => {
    const html = renderSubscription(sub({ status: 'PAST_DUE' }))
    expect(html).toContain('Pagamento in sospeso'); expect(html).toContain('id="manage-billing"')
  })
  it('free shows no manage CTA', () => {
    const html = renderSubscription(sub({ plan: 'FREE', status: 'ACTIVE', trialDaysLeft: 0 }))
    expect(html).not.toContain('id="manage-billing"')
  })
})

describe('subscription mount', () => {
  it('manage-billing opens the portal and redirects', async () => {
    const o11 = { openBillingPortal: vi.fn().mockResolvedValue({ url: 'https://portal' }) }
    const assign = vi.fn(); Object.defineProperty(window, 'location', { value: { href: 'https://app/x', assign }, writable: true })
    const ctx = { client: { o11 } as any, orgId: 'org-1', e3BaseUrl: '', navigate: () => {}, refresh: vi.fn() }
    const root = document.createElement('div'); root.innerHTML = renderSubscription(sub())
    subscriptionScreen.mount!(root, ctx as any, { sub: sub() })
    root.querySelector<HTMLButtonElement>('#manage-billing')!.click()
    await vi.waitFor(() => expect(o11.openBillingPortal).toHaveBeenCalledWith('org-1', 'https://app/x'))
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('https://portal'))
  })
})
```

Remove the old create-event cap tests only if they referenced removed symbols; keep the entitlements cap tests (they use `entitlements('CLUB')`, still valid).

- [ ] **Step 3: Run**

Run: `npx vitest run apps/e1-web/test/subscription.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/e1-web/src/views/subscription.ts apps/e1-web/test/subscription.test.ts
git commit -m "feat(e1): subscription view uses Stripe Billing Portal; PAST_DUE state"
```

---

### Task 9: E4 admin view — resync instead of local set-plan

**Files:**
- Modify: `apps/e4-web/src/views/organization.ts`
- Modify: `apps/e4-web/src/views/organizations.ts` (add PAST_DUE label)
- Modify: `apps/e4-web/test/organization.test.ts`, `apps/e4-web/test/organizations.test.ts`

- [ ] **Step 1: Update `organization.ts`** — replace the set-plan/grant-trial buttons block with a single resync action:

```ts
    <div class="pf-eyebrow" style="margin-top:var(--space-md)">Stripe</div>
    <div class="pf-row" style="gap:var(--space-sm);margin-top:var(--space-sm)">
      <button class="pf-btn pf-btn--ghost" data-resync="1">Risincronizza da Stripe</button>
    </div>
```

Rewrite `wireOrganization` to call an injected `resync(orgId)` on `[data-resync]` click (drop the `setPlan`/`[data-plan]`/`[data-trial]` wiring):

```ts
export function wireOrganization(root: ParentNode, orgId: string, api: { resync(orgId: string): Promise<unknown>; fail(msg: string): void; onDone(): void }): void {
  root.querySelectorAll<HTMLButtonElement>('[data-resync]').forEach((b) =>
    b.addEventListener('click', async () => { b.disabled = true; try { await api.resync(orgId); api.onDone() } catch { api.fail('Risync non riuscito. Riprova.'); b.disabled = false } }))
}
```

- [ ] **Step 2: Update `organizations.ts`** — extend `PLAN_LABELS`/status handling so `PAST_DUE` shows a label:

```ts
export function planLabel(sub?: Subscription | null): string {
  if (!sub) return '—'
  if (sub.status === 'TRIAL') return `Prova Club · ${sub.trialDaysLeft}g`
  if (sub.status === 'PAST_DUE') return `${PLAN_LABELS[sub.plan] ?? sub.plan} · in sospeso`
  return PLAN_LABELS[sub.plan] ?? sub.plan
}
```

- [ ] **Step 3: Update the E4 tests** — replace the `data-plan="ENTERPRISE"`/`setPlan` assertions with `data-resync` + `resync`; add a `PAST_DUE` label assertion in `organizations.test.ts`. Concretely, in `organization.test.ts`:

```ts
it('shows a resync action', () => { expect(renderOrganization(data)).toContain('data-resync="1"') })
it('resync calls api.resync then onDone', async () => {
  const root = document.createElement('div'); root.innerHTML = renderOrganization(data)
  const resync = vi.fn().mockResolvedValue({}); const onDone = vi.fn()
  wireOrganization(root, 'org_a', { resync, fail: () => {}, onDone })
  root.querySelector<HTMLButtonElement>('[data-resync]')!.click()
  await vi.waitFor(() => expect(resync).toHaveBeenCalledWith('org_a'))
  await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
})
```

Update the caller of `wireOrganization` in the E4 view wiring (search `apps/e4-web/src` for `wireOrganization(` and `setPlan`) to pass `{ resync: (id) => client.o11.resync(id), ... }`.

- [ ] **Step 4: Run**

Run: `npx vitest run apps/e4-web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/e4-web/src/views/organization.ts apps/e4-web/src/views/organizations.ts apps/e4-web/test/organization.test.ts apps/e4-web/test/organizations.test.ts
git commit -m "feat(e4): admin resync-from-Stripe; PAST_DUE label; drop local set-plan"
```

---

### Task 10: CDK — Stripe env config injected on the o11 Lambda

**Files:**
- Modify: `infra/cdk/lib/api-stack.ts`
- Modify: `infra/cdk/bin/app.ts`
- Modify: `infra/cdk/env/stg.json`

- [ ] **Step 1: Add non-secret price ids to `env/stg.json`** (real test-mode price ids from the Stripe dashboard):

```json
  "stripe": { "priceStarter": "price_REPLACE_STARTER", "priceClub": "price_REPLACE_CLUB" }
```

(These are non-secret Stripe price ids — safe to commit. The engineer fills the real `price_...` values created in the Stripe test dashboard.)

- [ ] **Step 2: Extend `bin/app.ts` cfg type + prop** — add to the `cfg` cast:

```ts
  stripe?: { priceStarter: string; priceClub: string };
```

and pass it to `ApiStack`:

```ts
new ApiStack(app, `playfusion2-api-${envToken}`, { env: stackEnv, appEnv: envToken, data, auth0: cfg.auth0, auth0mgmt: cfg.auth0mgmt, stripe: cfg.stripe });
```

- [ ] **Step 3: Add `StripeEnvConfig` + injection in `api-stack.ts`**

Add the interface near `Auth0MgmtEnvConfig`:

```ts
/** Non-secret Stripe config (price ids). Secret keys are injected via env (STRIPE_SECRET_KEY,
 *  STRIPE_WEBHOOK_SECRET), like AUTH0_MGMT_CLIENT_SECRET — never here. */
export interface StripeEnvConfig { readonly priceStarter: string; readonly priceClub: string }
```

Add to `ApiStackProps`:

```ts
  readonly stripe?: StripeEnvConfig;
```

Inside the `for (const bc of BCS)` loop, after the o2 block, inject on the o11 handler only:

```ts
      if (bc.route === 'o11' && props.stripe) {
        handler.addEnvironment('STRIPE_PRICE_STARTER', props.stripe.priceStarter);
        handler.addEnvironment('STRIPE_PRICE_CLUB', props.stripe.priceClub);
        if (process.env.STRIPE_SECRET_KEY) handler.addEnvironment('STRIPE_SECRET_KEY', process.env.STRIPE_SECRET_KEY);
        if (process.env.STRIPE_WEBHOOK_SECRET) handler.addEnvironment('STRIPE_WEBHOOK_SECRET', process.env.STRIPE_WEBHOOK_SECRET);
      }
```

- [ ] **Step 4: Verify synth**

Run: `cd infra/cdk && STRIPE_SECRET_KEY=sk_test_x STRIPE_WEBHOOK_SECRET=whsec_x npx cdk synth -c env=stg >/dev/null && echo SYNTH_OK`
Expected: `SYNTH_OK` (no type errors). Then `cd ../..`.

- [ ] **Step 5: Commit**

```bash
git add infra/cdk/lib/api-stack.ts infra/cdk/bin/app.ts infra/cdk/env/stg.json
git commit -m "chore(infra): inject Stripe price ids + secret keys on the o11 Lambda (stage)"
```

---

### Task 11: Deploy workflow — inject Stripe secrets

**Files:**
- Modify: `.github/workflows/deploy-stage.yml`

- [ ] **Step 1:** Add the two secrets to the `env:` of BOTH the synth and deploy steps (alongside `AUTH0_MGMT_CLIENT_SECRET`):

```yaml
        env:
          AUTH0_MGMT_CLIENT_SECRET: ${{ secrets.AUTH0_MGMT_CLIENT_SECRET }}
          STRIPE_SECRET_KEY: ${{ secrets.STRIPE_SECRET_KEY }}
          STRIPE_WEBHOOK_SECRET: ${{ secrets.STRIPE_WEBHOOK_SECRET }}
```

Update the step comment to note these are **test-mode** keys on stage.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy-stage.yml
git commit -m "ci(stage): inject Stripe test-mode secret + webhook signing secret"
```

(No push/tag here — deployment is a separate, explicitly-authorized step. The webhook signing secret must be created in the Stripe dashboard against the deployed URL first; see Task 13 runbook.)

---

### Task 12: E2E — Stripe-gated trial lifecycle (test clock)

**Files:**
- Modify: `test/e2e/s20-subscription.e2e.test.ts`

- [ ] **Step 1: Rewrite the e2e** to the Stripe flow, gated on both `API_BASE_URL` and a Stripe test key. Because it exercises real Stripe test mode + webhooks, keep it a documented, skip-by-default acceptance test:

```ts
import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// Acceptance E2E (O11 · Stripe test mode): provision → Stripe CLUB trial → (test clock advances to
// trial end, no card) → webhook → org FREE. Gated on API_BASE_URL + STRIPE_TEST_KEY; skipped otherwise.
const API = process.env.API_BASE_URL;
const STRIPE = process.env.STRIPE_TEST_KEY;
const run = test.skipIf(!API || !STRIPE);

run('test_e2e_stripe_trial_then_free', async () => {
  // 1) register/provision an org via the owner path, asserting TRIAL/CLUB with a stripeSubscriptionId.
  // 2) using the Stripe test SDK + a test clock, advance past trial_end with no payment method.
  // 3) poll GET subscription until plan === 'FREE' (webhook delivered) within a timeout.
  // Implementation uses the `stripe` SDK test-clock API; see the runbook in the plan header.
  expect(true).toBe(true); // placeholder body — fill with the test-clock flow when stage keys exist
}, 180_000);
```

Note: the concrete test-clock body depends on the deployed stage URL + a Stripe test secret being available to CI/local; write it when those exist. The gate keeps CI green until then. This is the one place a stubbed body is acceptable because the surface is external and environment-gated — flag it clearly.

- [ ] **Step 2: Run (skips without env)**

Run: `npx vitest run test/e2e/s20-subscription.e2e.test.ts`
Expected: SKIPPED (no `API_BASE_URL`/`STRIPE_TEST_KEY`).

- [ ] **Step 3: Commit**

```bash
git add test/e2e/s20-subscription.e2e.test.ts
git commit -m "test(e2e): gate O11 lifecycle on Stripe test mode (test clock)"
```

---

### Task 13: Docs — blueprint, authorized-services, webhook runbook

**Files:**
- Modify (blueprint repo): `playfusion-blueprint/20-domain/bc/o11-billing.md`
- Modify: `~/.claude/authorized-services.md`
- Create: `docs/runbooks/stripe-stage-setup.md`

- [ ] **Step 1: Blueprint D-O11-1/D-O11-2** — add a note: Stripe is the billing system of record; O11 stores a webhook-synced projection; the trial is Stripe-native (supersedes the local 14-day counter); `Subscription` gains `stripeCustomerId`/`stripeSubscriptionId`; `SubStatus` gains `PAST_DUE`. The O11 (subscription) vs O12 (registration fees) boundary is unchanged. (Commit in the blueprint repo on a `feature/` branch — do NOT commit to its `main` without authorization.)

- [ ] **Step 2: authorized-services** — append an entry:

```markdown
- **Stripe** — added 2026-09-06. Scope: subscription billing on the `stage` environment in **test mode** only (test keys). Rationale: O11 subscription payments (Playfusion→Organization). Live/prod keys are a separate future authorization.
```

- [ ] **Step 3: Runbook** `docs/runbooks/stripe-stage-setup.md` — document the bootstrap order:
  1. In the Stripe **test** dashboard create Products + monthly Prices for Starter and Club; copy the `price_...` ids into `infra/cdk/env/stg.json`.
  2. Add `STRIPE_SECRET_KEY` (test `sk_test_...`) as a GitHub Actions secret.
  3. Deploy stage (authorized tag) to create the API Gateway; note the URL `…/o11/webhooks/stripe`.
  4. In Stripe → Webhooks (test) add that endpoint, subscribe to `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`; copy the signing secret.
  5. Add `STRIPE_WEBHOOK_SECRET` (`whsec_...`) as a GitHub Actions secret; redeploy.
  6. Verify: provision an org → Stripe test dashboard shows a trialing subscription → app shows TRIAL/Club.

- [ ] **Step 4: Commit** (web repo docs + authorized-services; blueprint separately)

```bash
git add docs/runbooks/stripe-stage-setup.md
git commit -m "docs(o11): Stripe stage setup runbook"
```

---

## Provisioning hook (cross-task note)

`:provision` must be called once, right after Auth0 registration creates the org. Recommended: the app's post-signup onboarding step calls `client.o11.provision(orgId, email)`. Locate the existing post-Auth0-signup/onboarding code (search `apps/e1-web/src` for the org-creation/onboarding flow) and add the call there as a small follow-up wiring task during execution; it is not a standalone task because it depends on where onboarding lives, which the executor confirms in-repo. Until wired, `:provision` can be exercised via the E4 admin/manual call for stage testing.

## Self-Review

**Spec coverage:** §1 domain → Task 1; §2 provisioning → Task 3 (+hook note); §3 webhook → Tasks 5–6; §4 reads/UI → Tasks 3 (getSubscription), 7 (portal client), 8 (E1), 9 (E4); §5 infra/secret → Tasks 2 (dep), 10 (CDK), 11 (workflow); §6 testing → unit in Tasks 1–9, integration in Task 6, e2e in Task 12; §7 docs → Task 13. All spec sections map to a task.

**Placeholder scan:** the only intentional stub is the Task 12 e2e body, explicitly flagged as environment-gated/external — acceptable per the spec's e2e note. No other TODOs.

**Type consistency:** `Subscription`, `SubStatus` (with `PAST_DUE`), `PriceToPlan`, `StripeSubShape`, `StripeGateway`, `Deps` are defined in Tasks 1–3 and reused verbatim in Tasks 4–7. `openBillingPortal`/`provision`/`resync` names match between rest-client (Task 7) and its consumers (Tasks 8–9). `wireOrganization`'s new `{ resync }` shape (Task 9) matches its updated caller.

**Known follow-ups (out of this plan):** annual price + interval toggle (slice 2); AWS Secrets Manager + prod live keys; automatic reconciliation cron; the concrete e2e test-clock body; wiring `:provision` into the exact onboarding location.
