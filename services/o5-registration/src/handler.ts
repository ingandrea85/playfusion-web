import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  withCorrelation, currentCorrelationId, toHttpError, checkpoint,
  makeDocClient, EventBridgeEventPublisher, busName,
} from '@playfusion/platform-lib';
import { applyRegistration } from './application/apply-registration.js';
import { listRegistrationsByEvent } from './application/list-registrations-by-event.js';
import { getRegistrationWindow } from './application/get-registration-window.js';
import type { RegistrationStatus } from './domain/registration.js';
import { confirmRegistration } from './application/confirm-registration.js';
import { rejectRegistration } from './application/reject-registration.js';
import { openWindow } from './application/open-window.js';
import { DynamoDbRegistrationRepository } from './adapters/dynamodb-registration-repository.js';
import { DynamoDbWindowRepository } from './adapters/dynamodb-window-repository.js';
import { DynamoDbParticipantDirectory } from './adapters/dynamodb-participant-directory.js';
import { HttpClaimAuthorizer } from './adapters/http-claim-authorizer.js';

const db = makeDocClient();
const publisher = new EventBridgeEventPublisher(busName());
const repo = new DynamoDbRegistrationRepository(db);
const windows = new DynamoDbWindowRepository(db);
const participants = new DynamoDbParticipantDirectory(db);
const authorizer = new HttpClaimAuthorizer();
const orgOf = (c: any) => c.req.header('x-organization-id') ?? 'org-pilot';

const app = new Hono();

const applyBody = z.object({ participantRef: z.string(), sportEventId: z.string(), categoria: z.string() });
app.post('/registrations', async (c) => {
  const body = applyBody.parse(await c.req.json());
  const reg = await applyRegistration({ repo, windows, participants, publisher })({
    registrationId: randomUUID(), organizationId: orgOf(c), ...body,
  });
  return c.json(reg, 201);
});

// The approver token arrives in `authorization` from normal callers; Step Functions'
// apigateway:invoke forbids that reserved header, so also accept `x-approver-token`.
const approverTokenOf = (c: any) => c.req.header('authorization') ?? c.req.header('x-approver-token') ?? '';

app.post('/registrations/:id/confirm', async (c) => {
  const reg = await confirmRegistration({ repo, publisher, authorizer })({
    registrationId: c.req.param('id'), approverToken: approverTokenOf(c), organizationId: orgOf(c),
  });
  return c.json(reg);
});

app.post('/registrations/:id/reject', async (c) => {
  const { reason } = z.object({ reason: z.string() }).parse(await c.req.json());
  const reg = await rejectRegistration({ repo, publisher, authorizer })({
    registrationId: c.req.param('id'), reason, approverToken: approverTokenOf(c), organizationId: orgOf(c),
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

app.post('/events/:id/registration-window:open', async (c) => {
  const raw = await c.req.json().catch(() => ({}));
  const capacities = z.record(z.number().int().nonnegative()).optional().parse((raw as any).capacities);
  await openWindow({ windows, publisher })({ sportEventId: c.req.param('id'), organizationId: orgOf(c), capacities });
  return c.json({ sportEventId: c.req.param('id'), state: 'Open' });
});

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
