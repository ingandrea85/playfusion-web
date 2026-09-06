# Stripe ↔ O11 Subscription Billing (stage, test mode) — Design

**Date:** 2026-09-06
**Status:** Design — approved in brainstorming, pending spec review
**BC:** O11 Billing (Playfusion → Organization). NOT O12 Payments (Organization → Cliente).
**Scope:** Wire the ratified Free/Starter/Club/Enterprise subscription model to real Stripe (test mode) on the `stage` environment. Stripe becomes the billing system of record; O11 keeps a local projection synced by webhooks.

## Context & goal

Today O11 subscription lifecycle is faked: `activatePlan` is an instant fake upgrade, the 14-day trial is computed locally, no money moves. The org now has a Stripe account used for the economic/administrative side, an existing marketing site ("vetrina") that shows the plans, and Auth0-based registration inside the app.

Target flow:
1. User clicks **Prova gratis** (from the vetrina) → **registers in the app via Auth0** → an Organization is created.
2. **Right after registration**, the PlayFusion backend (O11) creates a **Stripe Customer + Subscription in trial** for that org — using **Stripe's native trial** (`trial_period_days = 14`) on the **Club** price (trial gives full features = Club), **no credit card required**.
3. Stripe is the **source of truth** for trial/renewal/lifecycle; **webhooks** update O11's local projection.
4. At trial end **without a payment method**, Stripe cancels the subscription → O11 sets the org to **Free** (degrade, never lock — the ratified model).
5. To pay (keep Club, or take Starter, or add a card), the user **lands on Stripe** (Billing Portal) — no in-app checkout is built.

The app's E1 subscription surface becomes a **state reflector** (projection + "Gestisci abbonamento" → Billing Portal), not a checkout initiator.

**Supersedes:** the deferred "anchor trial to first tournament" slice — with Stripe's native trial created at registration, the trial is anchored to signup by design.

## Approach (decided)

**Stripe source of truth, webhook-synced projection (Approach ①).** O11 creates the Stripe trial subscription at registration and thereafter stores only a projection `{plan, status, renewsOn, stripeCustomerId, stripeSubscriptionId}`, updated **exclusively by webhooks**. In-app reads return the local projection (fast, no Stripe call on the hot path). Payment and card management go through the hosted **Stripe Billing Portal**. A manual "resync from Stripe" admin lever covers missed-webhook debugging on stage; automatic reconciliation is deferred.

Rejected: synchronous read-through on Stripe (latency + rate limits on the hot path, and webhooks are needed for async events anyway); hybrid periodic reconcile (YAGNI for a first stage integration).

## 1. Domain (O11) — the projection

`services/o11-subscriptions/src/domain.ts`:
- `Subscription` gains optional `stripeCustomerId?: string` and `stripeSubscriptionId?: string` (persisted transparently — the DynamoDB adapter puts the full item; `makeDocClient` strips undefined).
- `SubStatus` becomes `'TRIAL' | 'ACTIVE' | 'PAST_DUE'` (new `PAST_DUE`).
- `renewsOn` mirrors Stripe: `trial_end` while trialing, `current_period_end` while active.
- New **pure mapper** `subscriptionFromStripe(orgId, stripeSub, priceToPlan)`:
  - Stripe `status` → `SubStatus`: `trialing`→`TRIAL`, `active`→`ACTIVE`, `past_due|unpaid`→`PAST_DUE`, `canceled|incomplete_expired`→(caller downgrades to FREE via `freeSubscription`).
  - Stripe subscription item `price.id` → `PlanKey` via the `priceToPlan` map (from env: `priceStarter`→STARTER, `priceClub`→CLUB).
  - `renewsOn` = `trial_end ?? current_period_end` (ISO date slice).
  - carries `stripeCustomerId`, `stripeSubscriptionId`.
- `freeSubscription(orgId, now)` retained for the cancellation path (clears/keeps ids as chosen; keep ids for audit, status ACTIVE plan FREE).
- `trialDaysLeft` unchanged (computed from `renewsOn`).

**Entitlements** (`libs/entitlements`): unchanged. TRIAL still resolves to plan `CLUB` (full features). **PAST_DUE keeps the plan's entitlements** (grace period) until a `canceled` event downgrades to FREE — so a failed payment doesn't instantly lock a paying org. The entitlements table is keyed by `PlanKey`, which is unaffected by `PAST_DUE` (a status, not a plan).

## 2. Provisioning — create the Stripe trial at registration

New endpoint **`POST /o11/organizations/:orgId/subscription:provision`** (owner-authed), called by the onboarding flow immediately after Auth0 registration/org creation.

- **Idempotent:** if a Stripe subscription already exists for the org (projection has `stripeSubscriptionId`, or a Stripe lookup by `metadata.organizationId` finds one), it is a no-op returning the current projection.
- **Action:** `stripe.customers.create({ email, metadata: { organizationId } })` then `stripe.subscriptions.create({ customer, items: [{ price: CLUB_PRICE }], trial_period_days: 14, metadata: { organizationId }, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } })` — **no payment method collected** (the trial goes straight to `trialing`; no `payment_behavior` override, which would otherwise leave the subscription `incomplete`).
- Persist `stripeCustomerId`/`stripeSubscriptionId` and set the projection to `TRIAL`/`CLUB`/`renewsOn = trial_end` **immediately from the create response** (do not wait for the webhook; the webhook keeps it fresh afterwards).

**Removed:** the old lazy `getOrProvision` behaviour that created a locally-computed 14-day trial on first read. `GET subscription` becomes a **pure read** of the projection (returns a not-provisioned/`FREE`-shaped default if provisioning hasn't happened yet, without side effects).

**Removed/replaced:** the fake `POST subscription:activate` (instant fake upgrade) and the demo `POST subscription:expire-trial`. Payment now happens on Stripe (Billing Portal, §4). A stage-only admin **resync** replaces the demo expiry lever (§4/§5).

## 3. Webhook endpoint & event mapping

New **public** route **`POST /o11/webhooks/stripe`** (mounted under the existing `/o11/{proxy+}` API Gateway integration; **no JWT middleware**, exactly like O12's unauthenticated routes).

- **Verification:** read the **raw body** with `c.req.text()` and verify with `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)` using the `stripe-signature` header. Invalid signature → HTTP 400 (`UnauthorizedError`). No JWT; the Stripe signature is the auth.
- **Org resolution:** from `event.data.object` → `metadata.organizationId` (set at creation on both customer and subscription). This is the primary key; no reverse-lookup index needed.
- **Handled events → projection:**
  - `customer.subscription.created` / `customer.subscription.updated` → upsert projection via `subscriptionFromStripe` (status + price + renewsOn + ids).
  - `customer.subscription.deleted` → `freeSubscription` (org → **FREE**).
  - `invoice.payment_failed` → **PAST_DUE**.
  - `invoice.paid` → **ACTIVE** (redundant with `subscription.updated`, handled idempotently).
  - `customer.subscription.trial_will_end` → log only (email nudge = follow-up).
  - Any other event type → 200 ignore (Stripe requires a 2xx).
- **Idempotency & ordering:** state-set operations are idempotent; the handler trusts the `subscription` object embedded in each event as the current state rather than reconstructing from diffs, so out-of-order/duplicate deliveries converge. (A per-org "last event created-at, skip older" guard is optional hardening, deferred.)

## 4. Reads & UI

- **`GET /o11/organizations/:orgId/subscription`** — pure read of the projection (shape unchanged + optional new fields). `trialDaysLeft` computed from `renewsOn`.
- New **`POST /o11/organizations/:orgId/subscription:portal`** (owner-authed) → `stripe.billingPortal.sessions.create({ customer, return_url })` → returns the hosted URL.
- **E1 subscription view** (`apps/e1-web/src/views/subscription.ts`): remove the fake "Attiva Starter/Club" buttons and the `activatePlan` wiring. Add **"Gestisci abbonamento / Aggiungi metodo di pagamento"** → calls `:portal` → redirects to Stripe. Trial banner shows days left from `renewsOn`. Enterprise unchanged ("Contattaci"). Show a PAST_DUE notice with a portal CTA.
- **E4 admin** (`apps/e4-web/src/views/organization.ts`): show plan/status incl. `PAST_DUE`; replace the local set-plan buttons with a **"Risincronizza da Stripe"** lever (calls a resync endpoint that refetches the org's Stripe subscription and rewrites the projection). Rationale: Stripe is the source of truth, so local plan mutation would drift. An optional flagged debug override may stay behind a clear "non-authoritative" label.

## 5. Infra / secret / CDK / deploy

- Add `stripe` dependency to `services/o11-subscriptions/package.json`.
- **Secrets (stage test mode):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` as **GitHub Actions secrets** → injected via `env:` on the `cdk synth`/`cdk deploy` steps in `.github/workflows/deploy-stage.yml` → written as env vars on the **o11 Lambda only** in `infra/cdk/lib/api-stack.ts`, following the existing `AUTH0_MGMT_CLIENT_SECRET` recipe (`handler.addEnvironment(...)` guarded by `process.env`). Read at runtime via `process.env`. **Test keys only on stage; never live keys.**
- **Non-secret config:** add a `stripe` block to `infra/cdk/env/stg.json` → `{ publishableKey, priceStarter, priceClub }`; extend the `cfg` type in `infra/cdk/bin/app.ts` and pass to `ApiStack` (a `StripeEnvConfig` interface mirroring `Auth0EnvConfig`); inject as o11 Lambda env. The publishable key also goes to the frontend build config.
- **Webhook bootstrap order (documented runbook):** deploy → obtain the API Gateway URL `…/o11/webhooks/stripe` → register it as a webhook endpoint in the Stripe **test** dashboard (subscribe to the events in §3) → copy the signing secret into the `STRIPE_WEBHOOK_SECRET` GitHub secret → redeploy.
- **Prod (live keys) via AWS Secrets Manager:** explicit **follow-up**, not in this slice. The repo has no Secrets Manager pattern today; introducing it is scoped to the prod-live-key step.

## 6. Testing

- **Unit (pure / mocked, no network):**
  - `subscriptionFromStripe` table tests: `trialing`→TRIAL/CLUB, `active`→ACTIVE, `past_due`→PAST_DUE, `canceled`→FREE; `priceStarter`→STARTER, `priceClub`→CLUB; `renewsOn` from `trial_end`/`current_period_end`.
  - Webhook signature verification: valid → processed; tampered/absent → 400.
  - Idempotency: replaying the same event yields the same projection.
- **Integration:** the O11 handler with a **mocked Stripe SDK** (stub `subscriptions.create`, `customers.create`, `billingPortal.sessions.create`, `webhooks.constructEvent`). Assert provision creates customer+trial sub and returns TRIAL/CLUB; portal returns a URL; webhook events drive the projection. No real network.
- **E2E on stage (gated, like the existing `skipIf(!API)`):** real test-mode flow — provision → Stripe trial created → advance a **Stripe test clock** to trial end → webhook → org FREE; add a test card via the portal → subscription active. Requires stage + Stripe test keys; skipped otherwise.

## 7. Documentation & governance

- Update `playfusion-blueprint` **D-O11-1 / D-O11-2**: Stripe is the billing **system of record**; O11 stores a **projection** synced by webhooks; the trial is Stripe-native (supersedes the local 14-day counter); add `stripeCustomerId`/`stripeSubscriptionId` and the `PAST_DUE` status. The O11 (subscription, Playfusion→Org) vs O12 (registration fees, Org→Cliente) boundary is unchanged.
- Add **Stripe** to `~/.claude/authorized-services.md` (date, rationale, scope = test-mode subscription payments on stage).

## Out of scope (YAGNI for this slice)

- **Monthly only** — annual price + interval toggle is the deferred pricing slice 2.
- No IT electronic invoicing (CP20), no proration UI, no in-app invoice history (the Billing Portal covers management/invoices).
- No AWS Secrets Manager / prod live keys — follow-up.
- No automatic reconciliation cron — only the manual "resync from Stripe" lever.
- The vetrina itself (marketing page) is out of scope; it already exists and only needs to deep-link users into the app's Auth0 registration / Stripe portal.

## Open items to confirm during planning

- Exact onboarding hook that calls `:provision` after Auth0 registration (frontend post-signup call vs an O1 `OrganizationCreated` consumer). Recommended: a frontend post-signup call to `:provision`, keeping O11 free of new EventBridge wiring for now.
- Whether `freeSubscription` clears or retains the Stripe ids after cancellation (recommended: retain for audit).
