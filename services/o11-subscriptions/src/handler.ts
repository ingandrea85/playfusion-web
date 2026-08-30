import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { randomUUID } from 'node:crypto';
import {
  withCorrelation, currentCorrelationId, toHttpError, checkpoint,
  makeDocClient, auth0ConfigFromEnv, createAuth0Verifier, requireOrganizer, requireOwner, requirePlatformAdmin,
} from '@playfusion/platform-lib';
import { z } from 'zod';
import { DynamoDbSubscriptionRepository } from './adapters/dynamodb-subscription-repository.js';
import { getOrProvision, activatePro, expireTrial, adminSetPlan } from './application/subscription.js';

const db = makeDocClient();
const repo = new DynamoDbSubscriptionRepository(db);
const deps = { repo };

const auth0cfg = auth0ConfigFromEnv();
const verifier = auth0cfg ? createAuth0Verifier(auth0cfg) : undefined;
// GET is organizer-readable (the E1 shell reads the plan at boot to compute entitlements) and also
// platform_admin-readable (S21 E4 monitoring reads any org's plan). The billing levers (activate/
// expire) are owner-only (T4); the admin plan setter is platform_admin (S21).
const organizer = requireOrganizer({ auth0: verifier, allowPlatformAdmin: true });
const owner = requireOwner({ auth0: verifier });
const platformAdmin = requirePlatformAdmin({ auth0: verifier });

const app = new Hono();
app.use('*', cors({ origin: '*', allowHeaders: ['content-type', 'authorization', 'x-organization-id', 'x-correlation-id'], allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));

// Read the tenant subscription (provisions a PRO trial on first read — trial-first). Organizer only.
app.get('/organizations/:orgId/subscription', organizer, async (c) => c.json(await getOrProvision(deps)(c.req.param('orgId'))));
// Fake upgrade to paid Pro. Owner-only.
app.post('/organizations/:orgId/subscription:activate-pro', owner, async (c) => c.json(await activatePro(deps)(c.req.param('orgId'))));
// Demo lever: expire the trial → limited Free. Owner-only.
app.post('/organizations/:orgId/subscription:expire-trial', owner, async (c) => c.json(await expireTrial(deps)(c.req.param('orgId'))));

// S21 admin: set any org's plan (ACTIVE) or grant a fresh PRO trial. platform_admin only.
const setPlanBody = z.object({ plan: z.enum(['FREE', 'PRO', 'BUSINESS']), trial: z.boolean().optional() });
app.put('/admin/organizations/:orgId/subscription', platformAdmin, async (c) => {
  const b = setPlanBody.parse(await c.req.json());
  return c.json(await adminSetPlan(deps)(c.req.param('orgId'), b.plan, b.trial ?? false));
});

app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any); });

export { app };

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
