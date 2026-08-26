import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  withCorrelation, currentCorrelationId, toHttpError, checkpoint,
  makeDocClient, auth0ConfigFromEnv, createAuth0Verifier, requireOrganizer,
} from '@playfusion/platform-lib';
import { DynamoDbBrandRepository } from './adapters/dynamodb-brand-repository.js';
import { getBrand, setBrand, resetBrand } from './application/brand.js';

const db = makeDocClient();
const repo = new DynamoDbBrandRepository(db);

const auth0cfg = auth0ConfigFromEnv();
const organizer = requireOrganizer({ auth0: auth0cfg ? createAuth0Verifier(auth0cfg) : undefined });

const app = new Hono();
app.use('*', cors({ origin: '*', allowHeaders: ['content-type', 'authorization', 'x-organization-id', 'x-correlation-id'], allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));

// Public: the tenant brand (E3 portal + E1 shell resolve it). null = default PlayFusion theme.
app.get('/organizations/:orgId/brand', async (c) => {
  return c.json(await getBrand({ repo })(c.req.param('orgId')));
});

// Organizer: save / update the brand.
const brandBody = z.object({ logoText: z.string().min(1), primaryColor: z.string(), accentColor: z.string() });
app.put('/organizations/:orgId/brand', organizer, async (c) => {
  const b = brandBody.parse(await c.req.json());
  return c.json(await setBrand({ repo })(c.req.param('orgId'), b));
});

// Organizer: reset to the default theme.
app.delete('/organizations/:orgId/brand', organizer, async (c) => {
  await resetBrand({ repo })(c.req.param('orgId'));
  return c.body(null, 204);
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
