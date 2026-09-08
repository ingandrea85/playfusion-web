import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// B5 handler-level fixes:
//  - FINDING 2: servedAt must be stamped EVENT-LOCAL (Europe/Rome), not UTC — plan times are naive
//    local HH:MM, so a UTC stamp re-anchors downstream nodes hours off in Italy. A client-supplied
//    `servedAt` (steward's own device clock) must win over the server stamp.
//  - FINDING 5: the DELETE route must NOT decodeURIComponent the `:team` path param a second time
//    (Hono already decodes it once) — double-decoding corrupts/throws on a team name containing '%'.
//
// The checkoff repository is mocked at the adapter-module boundary (module-level singletons in
// handler.ts aren't otherwise injectable) so these are true HTTP-level tests of the real routes.
const putSpy = vi.fn().mockResolvedValue(undefined);
const deleteSpy = vi.fn().mockResolvedValue(undefined);
const listSpy = vi.fn().mockResolvedValue([]);

vi.mock('../src/adapters/dynamodb-checkoff-repository.js', () => ({
  DynamoDbCheckoffRepository: vi.fn().mockImplementation(() => ({ put: putSpy, delete: deleteSpy, list: listSpy })),
}));

const { app } = await import('../src/handler.js');
const { signMagicLink } = await import('@playfusion/platform-lib');
const { STEWARD_ROLE, STEWARD_PURPOSE, stewardSubject } = await import('../src/resource-steward-token.js');

const eventId = 'evt-1';
const stewardToken = () => signMagicLink({ subject: stewardSubject(eventId), roles: [STEWARD_ROLE], purpose: STEWARD_PURPOSE });
const authHeaders = { authorization: `Bearer ${stewardToken()}`, 'content-type': 'application/json' };

beforeEach(() => { putSpy.mockClear(); deleteSpy.mockClear(); });
afterEach(() => { vi.useRealTimers(); });

describe('POST /events/:id/resource-checkoffs — servedAt is event-local (Europe/Rome)', () => {
  it('stamps servedAt in Rome local time when the body omits it (NOT UTC)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T09:15:00Z')); // 09:15 UTC = 11:15 in Rome (CEST, UTC+2)
    const res = await app.request(`/events/${eventId}/resource-checkoffs`, {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ nodeId: 'mensa', day: '2026-09-08', team: 'Leoni' }),
    });
    expect(res.status).toBe(201);
    expect(putSpy).toHaveBeenCalledWith(expect.objectContaining({ servedAt: '11:15' }));
  });

  it('prefers a client-supplied servedAt over the server stamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-08T09:15:00Z')); // server would stamp 11:15 — client wins
    const res = await app.request(`/events/${eventId}/resource-checkoffs`, {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ nodeId: 'mensa', day: '2026-09-08', team: 'Leoni', servedAt: '11:42' }),
    });
    expect(res.status).toBe(201);
    expect(putSpy).toHaveBeenCalledWith(expect.objectContaining({ servedAt: '11:42' }));
  });
});

describe('DELETE /events/:id/resource-checkoffs/:nodeId/:day/:team — no double-decode', () => {
  it('passes a team name containing a literal % through undamaged', async () => {
    const team = 'A%1 Squadra';
    const res = await app.request(`/events/${eventId}/resource-checkoffs/mensa/2026-09-08/${encodeURIComponent(team)}`, {
      method: 'DELETE', headers: authHeaders,
    });
    expect(res.status).toBe(204);
    expect(deleteSpy).toHaveBeenCalledWith(eventId, '2026-09-08', 'mensa', team);
  });
});
