import { test, expect } from 'vitest';
import { listRegistrationsByEvent } from '../../src/application/list-registrations-by-event.js';
import { InMemoryRegistrationRepository } from '../fakes.js';
import type { RegistrationRequest, RegistrationStatus } from '../../src/domain/registration.js';

function repoWith(...regs: RegistrationRequest[]) {
  const repo = new InMemoryRegistrationRepository();
  for (const r of regs) repo.save(r);
  return repo;
}
const reg = (id: string, evt: string, status: RegistrationStatus, cat = 'U15'): RegistrationRequest =>
  ({ registrationId: id, participantRef: 'team-' + id, sportEventId: evt, categoria: cat, status });

test('test_listRegistrationsByEvent_filtersByState', async () => {
  const repo = repoWith(
    reg('r1', 'evt-1', 'Applied'),
    reg('r2', 'evt-1', 'Confirmed'),
    reg('r3', 'evt-1', 'Applied'),
    reg('r4', 'evt-2', 'Applied'),
  );
  const pending = await listRegistrationsByEvent({ repo })({ sportEventId: 'evt-1', state: 'Applied' });
  expect(pending.map(r => r.registrationId).sort()).toEqual(['r1', 'r3']);
  const confirmed = await listRegistrationsByEvent({ repo })({ sportEventId: 'evt-1', state: 'Confirmed' });
  expect(confirmed.map(r => r.registrationId)).toEqual(['r2']);
});

test('test_listRegistrationsByEvent_noStateReturnsAllForEvent', async () => {
  const repo = repoWith(
    reg('r1', 'evt-1', 'Applied'),
    reg('r2', 'evt-1', 'Confirmed'),
    reg('r3', 'evt-2', 'Applied'),
  );
  const all = await listRegistrationsByEvent({ repo })({ sportEventId: 'evt-1' });
  expect(all.map(r => r.registrationId).sort()).toEqual(['r1', 'r2']);
});

test('test_listRegistrationsByEvent_emptyWhenNoneMatch', async () => {
  const repo = repoWith(reg('r1', 'evt-1', 'Applied'));
  expect(await listRegistrationsByEvent({ repo })({ sportEventId: 'evt-1', state: 'Rejected' })).toEqual([]);
  expect(await listRegistrationsByEvent({ repo })({ sportEventId: 'evt-none' })).toEqual([]);
});

test('test_listRegistrationsByEvent_projectsPublicView', async () => {
  const repo = new InMemoryRegistrationRepository();
  // Persisted items also carry internal fields (pe, organizationId); the view must drop them.
  await repo.save({ ...reg('r1', 'evt-1', 'Applied'), pe: 'team-r1#evt-1', organizationId: 'org-1' } as any);
  const [row] = await listRegistrationsByEvent({ repo })({ sportEventId: 'evt-1' });
  expect(Object.keys(row).sort()).toEqual(['categoria', 'participantRef', 'registrationId', 'sportEventId', 'status']);
});
