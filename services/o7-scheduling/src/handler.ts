import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from 'hono/aws-lambda';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  withCorrelation, currentCorrelationId, checkpoint, makeDocClient, toHttpError,
  auth0ConfigFromEnv, createAuth0Verifier, requireOrganizer, requireOwner, getIdentity,
  bearerToken, verifyMagicLink, signMagicLink, ForbiddenError, UnauthorizedError,
} from '@playfusion/platform-lib';
import { DIRECTOR_ROLE, DIRECTOR_PURPOSE, directorSubject, parseDirectorScope } from './director-token.js';
import { DynamoDbScheduleRepository } from './adapters/dynamodb-schedule-repository.js';
import { DynamoDbMatchRepository } from './adapters/dynamodb-match-repository.js';
import { DynamoDbTieOverrideRepository } from './adapters/dynamodb-tie-override-repository.js';
import { DynamoDbResourceRepository } from './adapters/dynamodb-resource-repository.js';
import { getResources, saveResources, getResourcePlan } from './application/resources.js';
import { HttpEventSource, HttpTeamSource } from './adapters/http-sources.js';
import { generateSchedule } from './application/generate-schedule.js';
import { approveSchedule, publishSchedule } from './application/change-status.js';
import { rescheduleMatch } from './application/reschedule-match.js';
import { recordResult } from './application/record-result.js';
import { decideWinner } from './application/decide-winner.js';
import { setTieOverride } from './application/resolve-tie.js';
import { startMatch, finishMatch, cancelMatch } from './application/transition-status.js';
import { getScheduleOrDefault, listMatches, listStandings, listFinalStandings } from './application/read.js';
import { DynamoDbFinalsFormatRepository } from './adapters/dynamodb-finals-format-repository.js';
import { listFinalsFormats, getFinalsFormat, saveFinalsFormat, deleteFinalsFormat } from './application/finals-formats.js';

const db = makeDocClient();
const schedules = new DynamoDbScheduleRepository(db);
const matches = new DynamoDbMatchRepository(db);
const overrides = new DynamoDbTieOverrideRepository(db);
const resourceRepo = new DynamoDbResourceRepository(db);
const events = new HttpEventSource();
const teams = new HttpTeamSource();
const finalsFormats = new DynamoDbFinalsFormatRepository(db);

const app = new Hono();
// Actual (non-preflight) responses need CORS headers too (see o3/o5 handlers).
app.use('*', cors({ origin: '*', allowHeaders: ['content-type', 'authorization', 'x-organization-id', 'x-correlation-id'], allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'] }));
const orgOf = (c: any) => getIdentity(c)?.organizationId ?? c.req.header('x-organization-id') ?? 'org-pilot';

// S7.1: match-format params + fields + the (uniform, until S8) group structure are the
// generate input. All positive; legs defaults SINGLE, groupsCount defaults 1.
// S13: finals format fields (per-category on byCategory, or top-level default). Optional everywhere.
const finalsType = z.enum(['SINGLE_GROUP_CROSSOVER', 'SPLIT_GROUP_FINALS', 'PLACEMENT', 'GROUP_KNOCKOUT', 'FINAL_ROUND_ROBIN']);
const finalsFields = {
  finalsType: finalsType.optional(),
  finalsEnabled: z.boolean().optional(),
  finalsTeamsToBracket: z.number().int().positive().optional(),
  finalsFormatId: z.string().optional(),
  finalsThirdPlace: z.boolean().optional(),
  finalsQualifiersPerGroup: z.number().int().positive().optional(),
};
const categorySchedule = z.object({
  fields: z.array(z.string()),
  periods: z.number().int().positive(),
  periodMinutes: z.number().int().positive(),
  breakMinutes: z.number().int().nonnegative(),
  legs: z.enum(['SINGLE', 'HOME_AWAY']),
  ...finalsFields,
});
export const scheduleConfigBody = z.object({
  fields: z.array(z.string()).default(['Campo A', 'Campo B']),
  periods: z.number().int().positive().default(2),
  periodMinutes: z.number().int().positive().default(20),
  breakMinutes: z.number().int().nonnegative().default(10),
  dailyStart: z.string().default('09:00'),
  groupsCount: z.number().int().positive().default(1),
  legs: z.enum(['SINGLE', 'HOME_AWAY']).default('SINGLE'),
  // S22: optional per-category override of fields + match params + legs (+ S13 finals format).
  byCategory: z.record(categorySchedule).optional(),
  // S12/S13: finals scheduling day (global) + top-level finals format default.
  finalsDate: z.string().optional(),
  ...finalsFields,
});

// Generate/approve/publish are organizer mutations (S2.4 bridge / Auth0 JWT).
const auth0cfg = auth0ConfigFromEnv();
const auth0verify = auth0cfg ? createAuth0Verifier(auth0cfg) : undefined;
const organizer = requireOrganizer({ auth0: auth0verify });
// Editing finals formats is an owner-only capability (org identity/config).
const owner = requireOwner({ auth0: auth0verify });

/**
 * Backend Pro enforcement: verify the caller's org is on a paid/trial plan (not FREE) before a
 * Pro-only mutation (finals formats, resources). Reads the plan from o11 over HTTP, forwarding the
 * caller's bearer token (o11 GET is organizer/owner-readable). Denies when the plan can't be verified.
 */
async function assertPro(c: any): Promise<void> {
  const orgId = orgOf(c);
  const base = process.env.PF_API_BASE_URL;
  if (!base) throw new ForbiddenError('plan verification unavailable');
  const res = await fetch(`${base}/o11/organizations/${encodeURIComponent(orgId)}/subscription`, {
    headers: { authorization: `Bearer ${bearerToken(c)}` },
  }).catch(() => null);
  const sub = res && res.ok ? ((await res.json()) as { plan?: string }) : null;
  if (!sub) throw new ForbiddenError('could not verify the organization plan');
  if (sub.plan === 'FREE') throw new ForbiddenError('this feature requires a Pro plan');
}

// S25: who may report a result — the organizer (Auth0 / RegistrationManager bridge) OR a field
// director (magic-link, role 'director'). Stashes the reporter's scope: `{ full: true }` for the
// organizer, or `{ field, eventId }` for a director (the handler then restricts to that field).
type ReporterScope = { full: true } | { field: string; eventId: string };
const requireResultReporter = async (c: any, next: () => Promise<unknown>) => {
  const token = bearerToken(c);
  if (!token) throw new UnauthorizedError('missing token');
  const magic = verifyMagicLink(token);
  if (magic) {
    if (magic.roles.includes('RegistrationManager')) { c.set('reporterScope', { full: true } as ReporterScope); return next(); }
    if (magic.roles.includes(DIRECTOR_ROLE)) {
      const scope = parseDirectorScope(magic.subject);
      if (!scope) throw new ForbiddenError('invalid director token');
      c.set('reporterScope', { field: scope.field, eventId: scope.eventId } as ReporterScope);
      return next();
    }
    throw new ForbiddenError('actor cannot report results');
  }
  if (auth0verify) {
    const id = await auth0verify(token);
    if (!id.roles.includes('organizer')) throw new ForbiddenError('actor cannot report results');
    c.set('reporterScope', { full: true } as ReporterScope); return next();
  }
  throw new UnauthorizedError('invalid token');
};

app.post('/events/:id/schedule:generate', organizer, async (c) => {
  const config = scheduleConfigBody.parse(await c.req.json().catch(() => ({})));
  const schedule = await generateSchedule({ schedules, matches, events, teams, formats: finalsFormats })({
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
const rescheduleBody = z.object({ day: z.string(), time: z.string(), field: z.string(), home: z.string().optional(), away: z.string().optional() });
app.put('/events/:id/matches/:matchId', organizer, async (c) => {
  const patch = rescheduleBody.parse(await c.req.json());
  const match = await rescheduleMatch({ matches, teams })({ sportEventId: c.req.param('id'), matchId: c.req.param('matchId'), patch });
  return c.json(match);
});

// A field director's token is bound to one event + field; the organizer is unrestricted.
// Returns the field to restrict writes to (undefined = organizer), after checking the token's
// event matches the path.
const reporterFieldScope = (c: any, eventId: string): string | undefined => {
  const scope = c.get('reporterScope' as never) as ReporterScope;
  if ('field' in scope && scope.eventId !== eventId) throw new ForbiddenError('token is for another event');
  return 'field' in scope ? scope.field : undefined;
};

// S10: record/correct a group match result (organizer or field director). S26: recording
// auto-advances a match to LIVE; a director cannot correct a FINISHED match. Standings derive on read.
const resultBody = z.object({ homeScore: z.number().int().nonnegative(), awayScore: z.number().int().nonnegative() });
app.post('/events/:id/matches/:matchId/result', requireResultReporter, async (c) => {
  const b = resultBody.parse(await c.req.json());
  const restrictToField = reporterFieldScope(c, c.req.param('id'));
  const match = await recordResult(matches)({ sportEventId: c.req.param('id'), matchId: c.req.param('matchId'), homeScore: b.homeScore, awayScore: b.awayScore, restrictToField });
  return c.json(match);
});

// S26: match lifecycle. Start/finish are result-reporter actions (organizer OR the field's
// director); cancel is an organizer-only administrative override.
app.post('/events/:id/matches/:matchId/start', requireResultReporter, async (c) => {
  const restrictToField = reporterFieldScope(c, c.req.param('id'));
  return c.json(await startMatch(matches)({ sportEventId: c.req.param('id'), matchId: c.req.param('matchId'), restrictToField }));
});
app.post('/events/:id/matches/:matchId/finish', requireResultReporter, async (c) => {
  const restrictToField = reporterFieldScope(c, c.req.param('id'));
  return c.json(await finishMatch(matches)({ sportEventId: c.req.param('id'), matchId: c.req.param('matchId'), restrictToField }));
});
app.post('/events/:id/matches/:matchId/cancel', organizer, async (c) =>
  c.json(await cancelMatch(matches)({ sportEventId: c.req.param('id'), matchId: c.req.param('matchId') })));

// Decree which side advances when a knockout (FINAL) match ends level (organizer OR the field's
// director). Rules applied offline (no shootout modelled). Only on a finished, drawn FINAL match.
const decideBody = z.object({ winner: z.enum(['HOME', 'AWAY']) });
app.post('/events/:id/matches/:matchId/decide-winner', requireResultReporter, async (c) => {
  const { winner } = decideBody.parse(await c.req.json());
  const restrictToField = reporterFieldScope(c, c.req.param('id'));
  return c.json(await decideWinner(matches)({ sportEventId: c.req.param('id'), matchId: c.req.param('matchId'), winner, restrictToField }));
});

// S25: mint a per-field director link (organizer). The token lasts the whole tournament — TTL
// runs to the event's end date (+2 days), with a generous fallback. The organizer shares one
// link per field; the director then reports only that field's results.
const directorBody = z.object({ field: z.string().min(1) });
app.post('/events/:id/director-token', organizer, async (c) => {
  const { field } = directorBody.parse(await c.req.json());
  const sportEventId = c.req.param('id');
  const ev = await events.get(sportEventId);
  const now = Math.floor(Date.now() / 1000);
  const endSec = ev ? Math.floor(Date.parse(`${ev.dates.to}T23:59:59Z`) / 1000) : NaN;
  const ttlSeconds = Number.isFinite(endSec) && endSec > now ? (endSec - now) + 2 * 86400 : 180 * 86400;
  const token = signMagicLink({ subject: directorSubject(sportEventId, field), roles: [DIRECTOR_ROLE], purpose: DIRECTOR_PURPOSE, ttlSeconds });
  return c.json({ field, token });
});

// S17: event resources & post-match logistics. GET config / plan are public reads; PUT is organizer.
const resourceItem = z.object({ resourceId: z.string().min(1), name: z.string().min(1), icon: z.string().optional(), occupancyMinutes: z.number().int().positive(), capacityPersons: z.number().int().positive(), offsetMinutes: z.number().int().min(0) });
const assignmentItem = z.object({ resourceId: z.string().min(1), day: z.string().min(1), team: z.string().min(1), slotTime: z.string().min(1) });
const resourceConfigBody = z.object({
  resources: z.array(resourceItem),
  defaultTeamSize: z.number().int().positive().optional(),
  teamSizes: z.record(z.number().int().positive()).optional(),
  assignments: z.array(assignmentItem).optional(),
});
app.get('/events/:id/resources', async (c) => c.json(await getResources(resourceRepo)(c.req.param('id'))));
app.put('/events/:id/resources', organizer, async (c) => {
  await assertPro(c); // S17 resources are a Pro feature
  return c.json(await saveResources(resourceRepo)(c.req.param('id'), resourceConfigBody.parse(await c.req.json())));
});
app.get('/events/:id/resource-plan', async (c) =>
  c.json(await getResourcePlan({ resources: resourceRepo, matches, schedules, teams })(c.req.param('id'))));

// S10/S11: live standings computed from results, ranked by the event's tie-break policy with
// manual overrides applied (public).
app.get('/events/:id/standings', async (c) => c.json(await listStandings(matches, { overrides, events })(c.req.param('id'))));

// S11: manual resolution of a group's residual tie (organizer). The path carries the category and
// group label (URL-encoded — they contain spaces, e.g. "Girone A"); the body is the decided order.
// `resolvedBy` is the organizer's identity, stored for audit (#44).
const tieOverrideBody = z.object({ order: z.array(z.string().min(1)).min(1) });
app.put('/events/:id/standings/:categoryId/:groupLabel/override', organizer, async (c) => {
  const { order } = tieOverrideBody.parse(await c.req.json());
  const resolvedBy = getIdentity(c)?.subject ?? 'organizer';
  const saved = await setTieOverride(overrides)({
    sportEventId: c.req.param('id'),
    categoryId: c.req.param('categoryId'), // Hono URL-decodes path params
    groupLabel: c.req.param('groupLabel'),
    order,
    resolvedBy,
  });
  return c.json(saved);
});

// S13: progressive final ranking per category, computed on read (public).
app.get('/events/:id/final-standings', async (c) => c.json(await listFinalStandings(matches, { overrides, events })(c.req.param('id'))));

// Public reads: schedule status/config + the placed fixtures.
app.get('/events/:id/schedule', async (c) =>
  c.json(await getScheduleOrDefault(schedules)(c.req.param('id'), orgOf(c))));

// S12: matches include finals (phase FINAL); the deps let listMatches resolve `Nª Girone X`
// placeholders to the ranked teams on read (same S11 ranking as the standings).
app.get('/events/:id/matches', async (c) =>
  c.json(await listMatches(matches, { overrides, events })(c.req.param('id'))));

// Custom finals-format catalog, ORG-SCOPED (visible only to the owning org). List/get are
// organizer-readable (populate the schedule-config selector); writes are OWNER-only + Pro-gated.
const seedRefSchema = z.union([z.object({ seed: z.number().int() }), z.object({ winnerOf: z.string() }), z.object({ loserOf: z.string() })]);
const formatBody = z.object({
  name: z.string().min(1),
  seeds: z.number().int(),
  rounds: z.array(z.object({
    name: z.string().min(1),
    matches: z.array(z.object({ slot: z.string().min(1), home: seedRefSchema, away: seedRefSchema, placementFrom: z.number().int().optional(), placementTo: z.number().int().optional() })),
  })),
});
app.get('/finals-formats', organizer, async (c) => c.json(await listFinalsFormats({ repo: finalsFormats })(orgOf(c))));
app.get('/finals-formats/:id', organizer, async (c) => c.json(await getFinalsFormat({ repo: finalsFormats })(c.req.param('id'))));
app.post('/finals-formats', owner, async (c) => {
  await assertPro(c);
  const b = formatBody.parse(await c.req.json());
  return c.json(await saveFinalsFormat({ repo: finalsFormats })({ id: randomUUID(), organizationId: orgOf(c), ...b }), 201);
});
app.put('/finals-formats/:id', owner, async (c) => {
  await assertPro(c);
  const b = formatBody.parse(await c.req.json());
  return c.json(await saveFinalsFormat({ repo: finalsFormats })({ id: c.req.param('id'), organizationId: orgOf(c), ...b }));
});
app.delete('/finals-formats/:id', owner, async (c) => { await assertPro(c); await deleteFinalsFormat({ repo: finalsFormats })(c.req.param('id')); return c.body(null, 204); });

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
