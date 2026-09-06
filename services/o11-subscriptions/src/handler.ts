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

import { handle } from 'hono/aws-lambda';

// Lazy singleton: constructing the live Stripe/DynamoDB clients at module-import time would run
// (and crash, given an empty STRIPE_SECRET_KEY) whenever this module is merely imported for its
// named exports (e.g. `makeApp` in tests). Defer to the first real Lambda invocation instead.
let cachedInner: ReturnType<typeof handle> | undefined;
const getInner = () => (cachedInner ??= handle(makeApp(defaultDeps())));

export const handler = async (event: any, ctx: any) => {
  if (event?.pathParameters?.proxy != null) event.path = `/${event.pathParameters.proxy}`;
  const correlationId = event.headers?.['x-correlation-id'] ?? randomUUID();
  return withCorrelation(correlationId, async () => {
    checkpoint('o11-handler', 'START', { path: event.rawPath ?? event.path, correlationId: currentCorrelationId() });
    try { return await getInner()(event, ctx); }
    finally { checkpoint('o11-handler', 'STOP', {}); }
  });
};
