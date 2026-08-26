import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  withCorrelation, currentCorrelationId, toHttpError, checkpoint,
  makeDocClient, auth0ConfigFromEnv, createAuth0Verifier, requireOrganizer, getIdentity,
} from '@playfusion/platform-lib';
import { DynamoDbAnnouncementRepository } from './adapters/dynamodb-announcement-repository.js';
import { publish } from './application/publish.js';
import { list } from './application/list.js';
import { remove } from './application/remove.js';
import { setPin } from './application/set-pin.js';

const db = makeDocClient();
const repo = new DynamoDbAnnouncementRepository(db);
const orgOf = (c: any) => getIdentity(c)?.organizationId ?? c.req.header('x-organization-id') ?? 'org-pilot';

const auth0cfg = auth0ConfigFromEnv();
const organizer = requireOrganizer({ auth0: auth0cfg ? createAuth0Verifier(auth0cfg) : undefined });

const app = new Hono();
app.use('*', cors({ origin: '*', allowHeaders: ['content-type', 'authorization', 'x-organization-id', 'x-correlation-id'], allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));

// Publish an announcement (organizer). categoryId null / absent = whole event.
const publishBody = z.object({
  categoryId: z.string().min(1).nullish(),
  title: z.string().min(1),
  body: z.string().min(1),
  pinned: z.boolean().optional(),
});
app.post('/events/:id/announcements', organizer, async (c) => {
  const b = publishBody.parse(await c.req.json());
  const ann = await publish({ repo })({
    announcementId: randomUUID(), sportEventId: c.req.param('id'), organizationId: orgOf(c),
    categoryId: b.categoryId ?? null, title: b.title, body: b.body, pinned: b.pinned ?? false,
  });
  return c.json(ann, 201);
});

// Public: all announcements of an event (pinned first, then most recent).
app.get('/events/:id/announcements', async (c) => {
  return c.json(await list({ repo })(c.req.param('id')));
});

// Delete (organizer).
app.delete('/announcements/:id', organizer, async (c) => {
  await remove({ repo })(c.req.param('id'));
  return c.body(null, 204);
});

// Pin/unpin (organizer).
app.post('/announcements/:id/pin', organizer, async (c) => {
  const { pinned } = z.object({ pinned: z.boolean() }).parse(await c.req.json());
  return c.json(await setPin({ repo })({ announcementId: c.req.param('id'), pinned }));
});

app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any); });

export { app };

import { handle } from 'hono/aws-lambda';
const inner = handle(app);
export const handler = async (event: any, ctx: any) => {
  if (event?.pathParameters?.proxy != null) event.path = `/${event.pathParameters.proxy}`;
  const correlationId = event.headers?.['x-correlation-id'] ?? randomUUID();
  return withCorrelation(correlationId, async () => {
    checkpoint('o9-handler', 'START', { path: event.rawPath ?? event.path, correlationId: currentCorrelationId() });
    try { return await inner(event, ctx); }
    finally { checkpoint('o9-handler', 'STOP', {}); }
  });
};
