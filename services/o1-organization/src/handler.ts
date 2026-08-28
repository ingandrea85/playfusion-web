import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  withCorrelation, currentCorrelationId, toHttpError, checkpoint,
  makeDocClient, auth0ConfigFromEnv, createAuth0Verifier, requireOwner,
} from '@playfusion/platform-lib';
import { DynamoDbBrandRepository } from './adapters/dynamodb-brand-repository.js';
import { getBrand, setBrand, resetBrand } from './application/brand.js';
import { getSite, setSite } from './application/site.js';
import type { OrgSiteDefaults } from './domain.js';

const db = makeDocClient();
const repo = new DynamoDbBrandRepository(db);

const auth0cfg = auth0ConfigFromEnv();
// T4: brand is an owner-only capability (billing/brand/members). GET stays public.
const owner = requireOwner({ auth0: auth0cfg ? createAuth0Verifier(auth0cfg) : undefined });

const app = new Hono();
app.use('*', cors({ origin: '*', allowHeaders: ['content-type', 'authorization', 'x-organization-id', 'x-correlation-id'], allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));

// Public: the tenant brand (E3 portal + E1 shell resolve it). null = default PlayFusion theme.
app.get('/organizations/:orgId/brand', async (c) => {
  return c.json(await getBrand({ repo })(c.req.param('orgId')));
});

// Owner: save / update the brand.
const brandBody = z.object({ logoText: z.string().min(1), primaryColor: z.string(), accentColor: z.string() });
app.put('/organizations/:orgId/brand', owner, async (c) => {
  const b = brandBody.parse(await c.req.json());
  return c.json(await setBrand({ repo })(c.req.param('orgId'), b));
});

// Owner: reset to the default theme.
app.delete('/organizations/:orgId/brand', owner, async (c) => {
  await resetBrand({ repo })(c.req.param('orgId'));
  return c.body(null, 204);
});

// Event Site — org-level defaults. Public read (E3), owner write.
app.get('/organizations/:orgId/site', async (c) => c.json(await getSite({ repo })(c.req.param('orgId'))));
app.put('/organizations/:orgId/site', owner, async (c) => {
  const body = (await c.req.json()) as OrgSiteDefaults;
  return c.json(await setSite({ repo })(c.req.param('orgId'), body));
});

app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any); });

export { app };

import { handle } from 'hono/aws-lambda';
const inner = handle(app);
export const handler = async (event: any, ctx: any) => {
  if (event?.pathParameters?.proxy != null) event.path = `/${event.pathParameters.proxy}`;
  const correlationId = event.headers?.['x-correlation-id'] ?? randomUUID();
  return withCorrelation(correlationId, async () => {
    checkpoint('o1-handler', 'START', { path: event.rawPath ?? event.path, correlationId: currentCorrelationId() });
    try { return await inner(event, ctx); }
    finally { checkpoint('o1-handler', 'STOP', {}); }
  });
};
