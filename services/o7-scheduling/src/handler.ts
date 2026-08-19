import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from 'hono/aws-lambda';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  withCorrelation, currentCorrelationId, checkpoint, makeDocClient, toHttpError,
  auth0ConfigFromEnv, createAuth0Verifier, requireOrganizer, getIdentity,
} from '@playfusion/platform-lib';
import { DynamoDbScheduleRepository } from './adapters/dynamodb-schedule-repository.js';
import { DynamoDbMatchRepository } from './adapters/dynamodb-match-repository.js';
import { HttpEventSource, HttpTeamSource } from './adapters/http-sources.js';
import { generateSchedule } from './application/generate-schedule.js';
import { approveSchedule, publishSchedule } from './application/change-status.js';
import { rescheduleMatch } from './application/reschedule-match.js';
import { recordResult } from './application/record-result.js';
import { getScheduleOrDefault, listMatches, listStandings } from './application/read.js';

const db = makeDocClient();
const schedules = new DynamoDbScheduleRepository(db);
const matches = new DynamoDbMatchRepository(db);
const events = new HttpEventSource();
const teams = new HttpTeamSource();

const app = new Hono();
// Actual (non-preflight) responses need CORS headers too (see o3/o5 handlers).
app.use('*', cors({ origin: '*', allowHeaders: ['content-type', 'authorization', 'x-organization-id', 'x-correlation-id'], allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'] }));
const orgOf = (c: any) => getIdentity(c)?.organizationId ?? c.req.header('x-organization-id') ?? 'org-pilot';

// S7.1: match-format params + fields + the (uniform, until S8) group structure are the
// generate input. All positive; legs defaults SINGLE, groupsCount defaults 1.
const categorySchedule = z.object({
  fields: z.array(z.string()),
  periods: z.number().int().positive(),
  periodMinutes: z.number().int().positive(),
  breakMinutes: z.number().int().nonnegative(),
  legs: z.enum(['SINGLE', 'HOME_AWAY']),
});
export const scheduleConfigBody = z.object({
  fields: z.array(z.string()).default(['Campo A', 'Campo B']),
  periods: z.number().int().positive().default(2),
  periodMinutes: z.number().int().positive().default(20),
  breakMinutes: z.number().int().nonnegative().default(10),
  dailyStart: z.string().default('09:00'),
  slotsPerDay: z.number().int().positive().default(8),
  groupsCount: z.number().int().positive().default(1),
  legs: z.enum(['SINGLE', 'HOME_AWAY']).default('SINGLE'),
  // S22: optional per-category override of fields + match params + legs.
  byCategory: z.record(categorySchedule).optional(),
});

// Generate/approve/publish are organizer mutations (S2.4 bridge / Auth0 JWT).
const auth0cfg = auth0ConfigFromEnv();
const organizer = requireOrganizer({ auth0: auth0cfg ? createAuth0Verifier(auth0cfg) : undefined });

app.post('/events/:id/schedule:generate', organizer, async (c) => {
  const config = scheduleConfigBody.parse(await c.req.json().catch(() => ({})));
  const schedule = await generateSchedule({ schedules, matches, events, teams })({
    sportEventId: c.req.param('id'), organizationId: orgOf(c), config,
  });
  return c.json(schedule);
});

app.post('/events/:id/schedule:approve', organizer, async (c) =>
  c.json(await approveSchedule(schedules)(c.req.param('id'))));

app.post('/events/:id/schedule:publish', organizer, async (c) =>
  c.json(await publishSchedule(schedules)(c.req.param('id'))));

// S9: reschedule a single match (day/time/field). Organizer mutation, allowed in any status
// (reschedules happen mid-tournament); rejects a clash with another match's slot (409).
const rescheduleBody = z.object({ day: z.string(), time: z.string(), field: z.string() });
app.put('/events/:id/matches/:matchId', organizer, async (c) => {
  const patch = rescheduleBody.parse(await c.req.json());
  const match = await rescheduleMatch(matches)({ sportEventId: c.req.param('id'), matchId: c.req.param('matchId'), patch });
  return c.json(match);
});

// S10: record/correct a group match result (organizer). Standings derive from it on read.
const resultBody = z.object({ homeScore: z.number().int().nonnegative(), awayScore: z.number().int().nonnegative() });
app.post('/events/:id/matches/:matchId/result', organizer, async (c) => {
  const b = resultBody.parse(await c.req.json());
  const match = await recordResult(matches)({ sportEventId: c.req.param('id'), matchId: c.req.param('matchId'), homeScore: b.homeScore, awayScore: b.awayScore });
  return c.json(match);
});

// S10: live standings computed from results (public).
app.get('/events/:id/standings', async (c) => c.json(await listStandings(matches)(c.req.param('id'))));

// Public reads: schedule status/config + the placed fixtures.
app.get('/events/:id/schedule', async (c) =>
  c.json(await getScheduleOrDefault(schedules)(c.req.param('id'), orgOf(c))));

app.get('/events/:id/matches', async (c) =>
  c.json(await listMatches(matches)(c.req.param('id'))));

app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any); });

export { app };
const inner = handle(app);
export const handler = async (event: any, ctx: any) => {
  // API Gateway mounts this BC at /o7/{proxy+}; route on the proxied sub-path only.
  if (event?.pathParameters?.proxy != null) event.path = `/${event.pathParameters.proxy}`;
  const correlationId = event.headers?.['x-correlation-id'] ?? randomUUID();
  return withCorrelation(correlationId, async () => {
    checkpoint('o7-handler', 'START', { path: event.rawPath ?? event.path, correlationId: currentCorrelationId() });
    try { return await inner(event, ctx); }
    finally { checkpoint('o7-handler', 'STOP', {}); }
  });
};
