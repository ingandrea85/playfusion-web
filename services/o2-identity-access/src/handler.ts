import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from 'hono/aws-lambda';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { withCorrelation, makeDocClient, toHttpError, resourceName, bearerToken, auth0ConfigFromEnv, createAuth0Verifier, requireOrganizer } from '@playfusion/platform-lib';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { signToken, verifyToken } from './token.js';
import { DynamoDbMemberRepository, DynamoDbInvitationRepository } from './adapters/dynamodb-membership.js';
import { listMembers, listInvitations, invite, acceptInvitation, revokeInvitation, changeMemberRole, removeMember } from './application/membership.js';

const db = makeDocClient();
const members = new DynamoDbMemberRepository(db);
const invitations = new DynamoDbInvitationRepository(db);
const deps = { members, invitations };
const auth0cfg = auth0ConfigFromEnv();
const organizer = requireOrganizer({ auth0: auth0cfg ? createAuth0Verifier(auth0cfg) : undefined });

const app = new Hono();
// Actual (non-preflight) responses need CORS headers too: API Gateway's
// defaultCorsPreflightOptions only answers OPTIONS, so browsers block GET/POST replies
// unless the Lambda sets Access-Control-Allow-Origin itself.
app.use('*', cors({ origin: '*', allowHeaders: ['content-type', 'authorization', 'x-organization-id', 'x-correlation-id'], allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'] }));
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
  // Accept both a raw token and a `Bearer <token>` header (the rest-client sends Bearer, like
  // every other authed call). bearerToken strips the prefix; without this a Bearer token 401s.
  const claims = verifyToken(bearerToken(c));
  return claims ? c.json(claims) : c.json({ code: 'INVALID_TOKEN' }, 401);
});
// S19 — per-tenant membership & roles. All mutations organizer-guarded (Auth0 / bridge).
const invitationBody = z.object({ name: z.string().min(1), email: z.string().min(1), role: z.string() });
app.get('/organizations/:orgId/members', organizer, async (c) => c.json(await listMembers(deps)(c.req.param('orgId'))));
app.get('/organizations/:orgId/invitations', organizer, async (c) => c.json(await listInvitations(deps)(c.req.param('orgId'))));
app.post('/organizations/:orgId/invitations', organizer, async (c) => {
  const b = invitationBody.parse(await c.req.json());
  const inv = await invite(deps)({ invitationId: randomUUID(), organizationId: c.req.param('orgId'), ...b });
  return c.json(inv, 201);
});
app.post('/invitations/:id/accept', organizer, async (c) =>
  c.json(await acceptInvitation(deps)({ invitationId: c.req.param('id'), memberId: randomUUID() }), 201));
app.delete('/invitations/:id', organizer, async (c) => { await revokeInvitation(deps)(c.req.param('id')); return c.body(null, 204); });
app.put('/members/:id/role', organizer, async (c) => {
  const { role } = z.object({ role: z.string() }).parse(await c.req.json());
  return c.json(await changeMemberRole(deps)({ memberId: c.req.param('id'), role }));
});
app.delete('/members/:id', organizer, async (c) => { await removeMember(deps)(c.req.param('id')); return c.body(null, 204); });

app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any); });

export { app };
const inner = handle(app);
export const handler = (event: any, ctx: any) => {
  // API Gateway mounts this BC at /o2/{proxy+}; route on the proxied sub-path only.
  if (event?.pathParameters?.proxy != null) event.path = `/${event.pathParameters.proxy}`;
  return withCorrelation(event.headers?.['x-correlation-id'] ?? randomUUID(), () => inner(event, ctx));
};
