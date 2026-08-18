import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from 'hono/aws-lambda';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { withCorrelation, makeDocClient, toHttpError, resourceName } from '@playfusion/platform-lib';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { signToken, verifyToken } from './token.js';

const db = makeDocClient();
const app = new Hono();
// Actual (non-preflight) responses need CORS headers too: API Gateway's
// defaultCorsPreflightOptions only answers OPTIONS, so browsers block GET/POST replies
// unless the Lambda sets Access-Control-Allow-Origin itself.
app.use('*', cors({ origin: '*', allowHeaders: ['content-type', 'authorization', 'x-organization-id', 'x-correlation-id'], allowMethods: ['GET', 'POST', 'OPTIONS'] }));
const body = z.object({
  contact: z.string(),
  roles: z.array(z.string()).default([]),
  purpose: z.string().optional(),      // e.g. 'coach-enrollment' for the S2.3 coach link
  ttlSeconds: z.number().int().positive().optional(),
});

app.post('/identities/magic-link', async (c) => {
  const b = body.parse(await c.req.json());
  const subject = randomUUID();
  await db.send(new PutCommand({ TableName: resourceName('o2-identities'), Item: { subject, contact: b.contact, roles: b.roles } }));
  // In production the token is emailed as a link, not returned in the response.
  return c.json({ subject, token: signToken(subject, b.roles, { purpose: b.purpose, ttlSeconds: b.ttlSeconds }) }, 201);
});
app.get('/identities/verify', (c) => {
  const claims = verifyToken(c.req.header('authorization') ?? '');
  return claims ? c.json(claims) : c.json({ code: 'INVALID_TOKEN' }, 401);
});
app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any); });

export { app };
const inner = handle(app);
export const handler = (event: any, ctx: any) => {
  // API Gateway mounts this BC at /o2/{proxy+}; route on the proxied sub-path only.
  if (event?.pathParameters?.proxy != null) event.path = `/${event.pathParameters.proxy}`;
  return withCorrelation(event.headers?.['x-correlation-id'] ?? randomUUID(), () => inner(event, ctx));
};
