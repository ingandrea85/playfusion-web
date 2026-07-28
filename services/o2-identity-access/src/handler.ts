import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { withCorrelation, makeDocClient, toHttpError } from '@playfusion/platform-lib';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { signToken, verifyToken } from './token.js';

const db = makeDocClient();
const app = new Hono();
const body = z.object({ contact: z.string(), roles: z.array(z.string()).default([]) });

app.post('/identities/magic-link', async (c) => {
  const b = body.parse(await c.req.json());
  const subject = randomUUID();
  await db.send(new PutCommand({ TableName: 'o2-identities', Item: { subject, contact: b.contact, roles: b.roles } }));
  return c.json({ subject, token: signToken(subject, b.roles) }, 201); // in production the token is emailed as a link, not returned
});
app.get('/identities/verify', (c) => {
  const claims = verifyToken(c.req.header('authorization') ?? '');
  return claims ? c.json(claims) : c.json({ code: 'INVALID_TOKEN' }, 401);
});
app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any); });

export { app };
const inner = handle(app);
export const handler = (event: any, ctx: any) => withCorrelation(event.headers?.['x-correlation-id'] ?? randomUUID(), () => inner(event, ctx));
