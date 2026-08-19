import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  withCorrelation, currentCorrelationId, toHttpError, checkpoint,
  makeDocClient, EventBridgeEventPublisher, busName,
  auth0ConfigFromEnv, createAuth0Verifier, requireOrganizer, requireMagicLink, getIdentity,
} from '@playfusion/platform-lib';
import { applyRegistration } from './application/apply-registration.js';
import { listRegistrationsByEvent } from './application/list-registrations-by-event.js';
import { getRegistrationWindow } from './application/get-registration-window.js';
import type { RegistrationStatus } from './domain/registration.js';
import { confirmRegistration } from './application/confirm-registration.js';
import { rejectRegistration } from './application/reject-registration.js';
import { openWindow } from './application/open-window.js';
import { getEnrollToken } from './application/get-enroll-token.js';
import { DynamoDbRegistrationRepository } from './adapters/dynamodb-registration-repository.js';
import { DynamoDbWindowRepository } from './adapters/dynamodb-window-repository.js';
import { DynamoDbParticipantDirectory } from './adapters/dynamodb-participant-directory.js';

const db = makeDocClient();
const publisher = new EventBridgeEventPublisher(busName());
const repo = new DynamoDbRegistrationRepository(db);
const windows = new DynamoDbWindowRepository(db);
const participants = new DynamoDbParticipantDirectory(db);
const orgOf = (c: any) => getIdentity(c)?.organizationId ?? c.req.header('x-organization-id') ?? 'org-pilot';

// S2.4 enforcement: organizer mutations accept an Auth0 JWT (when configured) or the O2
// RegistrationManager bridge token; coach apply needs a valid magic-link.
const auth0cfg = auth0ConfigFromEnv();
const organizer = requireOrganizer({ auth0: auth0cfg ? createAuth0Verifier(auth0cfg) : undefined });
const coach = requireMagicLink();

const app = new Hono();
// Actual (non-preflight) responses need CORS headers too: API Gateway's
// defaultCorsPreflightOptions only answers OPTIONS, so browsers block GET/POST replies
// unless the Lambda sets Access-Control-Allow-Origin itself.
app.use('*', cors({ origin: '*', allowHeaders: ['content-type', 'authorization', 'x-organization-id', 'x-correlation-id'], allowMethods: ['GET', 'POST', 'OPTIONS'] }));

const applyBody = z.object({ participantRef: z.string(), sportEventId: z.string(), categoria: z.string() });
app.post('/registrations', coach, async (c) => {
  const body = applyBody.parse(await c.req.json());
  const reg = await applyRegistration({ repo, windows, participants, publisher })({
    registrationId: randomUUID(), organizationId: orgOf(c), ...body,
  });
  return c.json(reg, 201);
});

app.post('/registrations/:id/confirm', organizer, async (c) => {
  const reg = await confirmRegistration({ repo, publisher })({
    registrationId: c.req.param('id'), organizationId: orgOf(c),
  });
  return c.json(reg);
});

app.post('/registrations/:id/reject', organizer, async (c) => {
  const { reason } = z.object({ reason: z.string() }).parse(await c.req.json());
  const reg = await rejectRegistration({ repo, publisher })({
    registrationId: c.req.param('id'), reason, organizationId: orgOf(c),
  });
  return c.json(reg);
});

// S1.3 read: registrations for an event, optionally filtered by state.
// `?state=Applied` → inbox (pending), `?state=Confirmed` → participants.
app.get('/events/:id/registrations', async (c) => {
  const state = c.req.query('state') as RegistrationStatus | undefined;
  const rows = await listRegistrationsByEvent({ repo })({ sportEventId: c.req.param('id'), state });
  return c.json(rows);
});

app.post('/events/:id/registration-window:open', organizer, async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const capacities = z.record(z.number().int().nonnegative()).optional().parse((raw as any).capacities);
  const w = await openWindow({ windows, publisher })({ sportEventId: c.req.param('id'), organizationId: orgOf(c), capacities });
  // The enrollToken is returned to the organizer here (and via GET enroll-token), never in
  // the public window read.
  return c.json({ sportEventId: w.sportEventId, state: w.state, enrollToken: w.enrollToken });
});

// Organizer-only: the coach enrollment token minted at window open, so E1 can render the
// shareable enrollment link. Public callers use the token-free registration-window read.
app.get('/events/:id/enroll-token', organizer, async (c) =>
  c.json(await getEnrollToken({ windows })(c.req.param('id'))));

// S1.4 read: window state + per-category remaining capacity (D-O5-1).
app.get('/events/:id/registration-window', async (c) =>
  c.json(await getRegistrationWindow({ windows, repo })(c.req.param('id'))));

app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any); });

export { app };

// Lambda entrypoint: wrap every invocation in a correlation scope.
import { handle } from 'hono/aws-lambda';
const inner = handle(app);
export const handler = async (event: any, ctx: any) => {
  // API Gateway mounts this BC at /o5/{proxy+}; route on the proxied sub-path only.
  if (event?.pathParameters?.proxy != null) event.path = `/${event.pathParameters.proxy}`;
  const correlationId = event.headers?.['x-correlation-id'] ?? randomUUID();
  return withCorrelation(correlationId, async () => {
    checkpoint('o5-handler', 'START', { path: event.rawPath ?? event.path, correlationId: currentCorrelationId() });
    try { return await inner(event, ctx); }
    finally { checkpoint('o5-handler', 'STOP', {}); }
  });
};
