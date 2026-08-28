import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from 'hono/aws-lambda';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { withCorrelation, makeDocClient, toHttpError, resourceName, bearerToken, auth0ConfigFromEnv, createAuth0Verifier, requireOwner, DomainError } from '@playfusion/platform-lib';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { signToken, verifyToken } from './token.js';
import { Auth0MembershipDirectory, auth0MgmtConfigFromEnv } from './adapters/auth0-membership.js';
import { listMembers, listInvitations, invite, revokeInvitation, changeMemberRole, removeMember } from './application/membership.js';

const db = makeDocClient();
// T3: membership is backed by Auth0 Organizations. Absent config → the membership endpoints
// return 503 (the magic-link identity endpoints below stay available regardless).
const mgmtCfg = auth0MgmtConfigFromEnv();
const deps = mgmtCfg ? { directory: new Auth0MembershipDirectory(mgmtCfg) } : undefined;
const requireDirectory = () => {
  if (!deps) throw new DomainError('MEMBERSHIP_UNAVAILABLE', 'Auth0 Organizations is not configured', 503);
  return deps;
};
const auth0cfg = auth0ConfigFromEnv();
const verifier = auth0cfg ? createAuth0Verifier(auth0cfg) : undefined;
// T4: managing members/roles/invitations is owner-only (billing/brand/members capability).
const owner = requireOwner({ auth0: verifier });

const app = new Hono();
// Actual (non-preflight) responses need CORS headers too: API Gateway's
// defaultCorsPreflightOptions only answers OPTIONS, so browsers block GET/POST replies
// unless the Lambda sets Access-Control-Allow-Origin itself.
app.use('*', cors({ origin: '*', allowHeaders: ['content-type', 'authorization', 'x-organization-id', 'x-correlation-id'], allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
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
// T3 — per-tenant membership & roles on Auth0 Organizations, org-scoped.
// T4 — the whole surface (list + mutations) is owner-only: managing members is a tenant-owner capability.
const invitationBody = z.object({ name: z.string().min(1), email: z.string().min(1), role: z.string() });
app.get('/organizations/:orgId/members', owner, async (c) => c.json(await listMembers(requireDirectory())(c.req.param('orgId'))));
app.get('/organizations/:orgId/invitations', owner, async (c) => c.json(await listInvitations(requireDirectory())(c.req.param('orgId'))));
app.post('/organizations/:orgId/invitations', owner, async (c) => {
  const b = invitationBody.parse(await c.req.json());
  const inv = await invite(requireDirectory())({ organizationId: c.req.param('orgId'), ...b });
  return c.json(inv, 201);
});
app.delete('/organizations/:orgId/invitations/:id', owner, async (c) => {
  await revokeInvitation(requireDirectory())(c.req.param('orgId'), c.req.param('id'));
  return c.body(null, 204);
});
app.put('/organizations/:orgId/members/:id/role', owner, async (c) => {
  const { role } = z.object({ role: z.string() }).parse(await c.req.json());
  return c.json(await changeMemberRole(requireDirectory())({ organizationId: c.req.param('orgId'), memberId: c.req.param('id'), role }));
});
app.delete('/organizations/:orgId/members/:id', owner, async (c) => {
  await removeMember(requireDirectory())({ organizationId: c.req.param('orgId'), memberId: c.req.param('id') });
  return c.body(null, 204);
});

app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any); });

export { app };
const inner = handle(app);
export const handler = (event: any, ctx: any) => {
  // API Gateway mounts this BC at /o2/{proxy+}; route on the proxied sub-path only.
  if (event?.pathParameters?.proxy != null) event.path = `/${event.pathParameters.proxy}`;
  return withCorrelation(event.headers?.['x-correlation-id'] ?? randomUUID(), () => inner(event, ctx));
};
