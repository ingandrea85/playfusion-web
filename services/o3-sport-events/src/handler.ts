import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from 'hono/aws-lambda';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  withCorrelation, makeDocClient, EventBridgeEventPublisher, toHttpError, busName, resourceName,
  auth0ConfigFromEnv, createAuth0Verifier, requireOrganizer, requirePlatformAdmin, getIdentity,
} from '@playfusion/platform-lib';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDbEventStore } from './adapters/dynamodb-event-store.js';
import { DynamoDbGironiRepository } from './adapters/dynamodb-gironi-repository.js';
import { HttpTeamSource } from './adapters/http-team-source.js';
import { drawGironi } from './application/draw-gironi.js';
import { saveGironi, getGironi } from './application/save-gironi.js';
import { listEvents, getEvent } from './read-model.js';
import { makeEventSite, type EventSite } from './domain.js';
import { DynamoDbSportRepository } from './adapters/dynamodb-sport-repository.js';
import { listSports, getSport, saveSport, deleteSport } from './application/sports.js';
import type { SportProfileInput } from './sport.js';

const db = makeDocClient();
const publisher = new EventBridgeEventPublisher(busName());
const store = new DynamoDbEventStore(db);
const gironiRepo = new DynamoDbGironiRepository(db);
const teamSource = new HttpTeamSource();
const sports = new DynamoDbSportRepository(db);
const app = new Hono();
// Actual (non-preflight) responses need CORS headers too: API Gateway's
// defaultCorsPreflightOptions only answers OPTIONS, so browsers block GET/POST replies
// unless the Lambda sets Access-Control-Allow-Origin itself.
app.use('*', cors({ origin: '*', allowHeaders: ['content-type', 'authorization', 'x-organization-id', 'x-correlation-id'], allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
const orgOf = (c: any) => getIdentity(c)?.organizationId ?? c.req.header('x-organization-id') ?? 'org-pilot';
const tieBreakCriterion = z.enum(['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR']);
// S6.1: competition config is added additively — dates stay start/end date, the rest is
// optional (pre-S6 clients keep working) and `playbook` defaults to PB-1.
export const createEventBody = z.object({
  sport: z.string(),
  categorie: z.array(z.string()),
  dates: z.object({ from: z.string(), to: z.string() }),
  name: z.string().optional(),
  location: z.string().optional(),
  startTime: z.string().optional(),
  tieBreak: z.array(tieBreakCriterion).optional(),
  playbook: z.enum(['PB-1', 'PB-2']).default('PB-1'),
});

// S2.4: creating an event is an organizer mutation.
const auth0cfg = auth0ConfigFromEnv();
const verifier = auth0cfg ? createAuth0Verifier(auth0cfg) : undefined;
const organizer = requireOrganizer({ auth0: verifier });
const platformAdmin = requirePlatformAdmin({ auth0: verifier });

app.post('/events', organizer, async (c) => {
  const b = createEventBody.parse(await c.req.json());
  const sportEventId = randomUUID();
  const organizationId = orgOf(c);
  await db.send(new PutCommand({ TableName: resourceName('o3-events'), Item: { sportEventId, organizationId, ...b, status: 'Published' } }));
  await publisher.publish('EventPublished', { sportEventId, sport: b.sport, categorie: b.categorie, dates: b.dates, playbook: b.playbook }, organizationId);
  return c.json({ sportEventId, status: 'Published' }, 201);
});

// S1.2 reads: list per org (E1 dashboard / E3 landing) and event detail + categories.
app.get('/events', async (c) => c.json(await listEvents(store)(orgOf(c))));
// S21 admin: events of any org (cross-tenant monitoring). platform_admin only.
app.get('/admin/organizations/:orgId/events', platformAdmin, async (c) => c.json(await listEvents(store)(c.req.param('orgId'))));
app.get('/events/:id', async (c) => {
  const detail = await getEvent(store)(c.req.param('id'));
  if (!detail) return c.json({ error: 'EventNotFound', sportEventId: c.req.param('id') }, 404);
  return c.json(detail);
});

// S8: gironi (O6 group composition) on the event. Draw + save are organizer mutations; the
// composition read is public (E1 editor + downstream o7/standings).
const drawBody = z.object({ categoria: z.string(), groupsCount: z.number().int().positive().default(2) });
const groupSchema = z.object({ label: z.string(), teams: z.array(z.string()) });
const saveGironiBody = z.object({ groups: z.array(groupSchema), locked: z.boolean().default(false) });

app.post('/events/:id/gironi:draw', organizer, async (c) => {
  const sportEventId = c.req.param('id');
  if (!(await getEvent(store)(sportEventId))) return c.json({ error: 'EventNotFound', sportEventId }, 404);
  const b = drawBody.parse(await c.req.json().catch(() => ({})));
  return c.json(await drawGironi({ gironi: gironiRepo, teams: teamSource })({ sportEventId, categoria: b.categoria, groupsCount: b.groupsCount }));
});

app.put('/events/:id/gironi/:categoria', organizer, async (c) => {
  const sportEventId = c.req.param('id');
  if (!(await getEvent(store)(sportEventId))) return c.json({ error: 'EventNotFound', sportEventId }, 404);
  const b = saveGironiBody.parse(await c.req.json());
  return c.json(await saveGironi(gironiRepo)({ sportEventId, categoria: c.req.param('categoria'), groups: b.groups, locked: b.locked }));
});

app.get('/events/:id/gironi', async (c) => c.json(await getGironi(gironiRepo)(c.req.param('id'))));

// Sport catalog (Epic #143) — GLOBAL. GET is a public read (create-event selector, the engine's
// snapshot source); writes are platform_admin (managed in E4).
const sportBody = z.object({
  name: z.string().min(1),
  participants: z.enum(['team', 'individual', 'both']),
  scoreLabel: z.string().min(1),
  points: z.object({ win: z.number(), draw: z.number().nullable(), loss: z.number() }),
  tieBreak: z.array(z.enum(['HEAD_TO_HEAD', 'SCORE_DIFFERENCE', 'SCORE_FOR', 'WINS'])).default([]),
});
app.get('/sports', async (c) => c.json(await listSports({ repo: sports })()));
app.get('/sports/:id', async (c) => c.json(await getSport({ repo: sports })(c.req.param('id'))));
app.post('/admin/sports', platformAdmin, async (c) => {
  const b = sportBody.parse(await c.req.json()) as SportProfileInput;
  return c.json(await saveSport({ repo: sports })({ id: randomUUID(), ...b }), 201);
});
app.put('/admin/sports/:id', platformAdmin, async (c) => {
  const b = sportBody.parse(await c.req.json()) as SportProfileInput;
  return c.json(await saveSport({ repo: sports })({ id: c.req.param('id'), ...b }));
});
app.delete('/admin/sports/:id', platformAdmin, async (c) => { await deleteSport({ repo: sports })(c.req.param('id')); return c.body(null, 204); });

// Event Site (Pro) — per-event overrides of the public website. Organizer (or owner) editable: whoever
// operates the event curates its site; org-level defaults stay owner-only (o1). Read publicly via
// GET /events/:id (site is stored on the event item and returned by getEvent).
app.put('/events/:id/site', organizer, async (c) => {
  const sportEventId = c.req.param('id');
  if (!(await getEvent(store)(sportEventId))) return c.json({ error: 'EventNotFound', sportEventId }, 404);
  const site = makeEventSite((await c.req.json()) as EventSite);
  await db.send(new UpdateCommand({
    TableName: resourceName('o3-events'), Key: { sportEventId },
    UpdateExpression: 'SET site = :s', ExpressionAttributeValues: { ':s': site },
  }));
  return c.json(site);
});
// Finals format is per-category on the o7 ScheduleConfig (edited in the Calendario tab), not on the
// event — there is no o3 finals-config endpoint.

app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any); });

export { app };
const inner = handle(app);
export const handler = (event: any, ctx: any) => {
  // API Gateway mounts this BC at /o3/{proxy+}; route on the proxied sub-path only.
  if (event?.pathParameters?.proxy != null) event.path = `/${event.pathParameters.proxy}`;
  return withCorrelation(event.headers?.['x-correlation-id'] ?? randomUUID(), () => inner(event, ctx));
};
