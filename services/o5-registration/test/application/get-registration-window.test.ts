import { test, expect } from 'vitest';
import { getRegistrationWindow } from '../../src/application/get-registration-window.js';
import { InMemoryWindowRepository, InMemoryRegistrationRepository } from '../fakes.js';
import type { RegistrationRequest, RegistrationStatus } from '../../src/domain/registration.js';

const reg = (id: string, cat: string, status: RegistrationStatus, evt = 'evt-1'): RegistrationRequest =>
  ({ registrationId: id, participantRef: 't-' + id, sportEventId: evt, categoria: cat, status });

function fixture(capacities: Record<string, number>, ...regs: RegistrationRequest[]) {
  const windows = new InMemoryWindowRepository();
  windows.save({ sportEventId: 'evt-1', state: 'Open', capacities });
  const repo = new InMemoryRegistrationRepository();
  for (const r of regs) repo.save(r);
  return { windows, repo };
}

test('test_getRegistrationWindow_reportsStateAndPerCategoryRemaining', async () => {
  const { windows, repo } = fixture({ U10: 8, U12: 8 }, reg('r1', 'U10', 'Applied'), reg('r2', 'U10', 'Confirmed'));
  const res = await getRegistrationWindow({ windows, repo })('evt-1');
  expect(res.state).toBe('Open');
  expect(res.categories).toContainEqual({ categoria: 'U10', cap: 8, count: 2, remaining: 6 });
  expect(res.categories).toContainEqual({ categoria: 'U12', cap: 8, count: 0, remaining: 8 });
});

test('test_getRegistrationWindow_fullCategoryHasZeroRemaining', async () => {
  const { windows, repo } = fixture({ U14: 2 }, reg('r1', 'U14', 'Applied'), reg('r2', 'U14', 'Confirmed'));
  const res = await getRegistrationWindow({ windows, repo })('evt-1');
  expect(res.categories[0]).toMatchObject({ cap: 2, count: 2, remaining: 0 });
});

test('test_getRegistrationWindow_rejectedDoNotConsumeCapacity', async () => {
  const { windows, repo } = fixture({ U14: 2 }, reg('r1', 'U14', 'Rejected'), reg('r2', 'U14', 'Applied'));
  const res = await getRegistrationWindow({ windows, repo })('evt-1');
  expect(res.categories[0]).toMatchObject({ count: 1, remaining: 1 });
});

test('test_getRegistrationWindow_clampsRemainingWhenOverCap', async () => {
  const { windows, repo } = fixture({ U14: 1 }, reg('r1', 'U14', 'Applied'), reg('r2', 'U14', 'Applied'));
  const res = await getRegistrationWindow({ windows, repo })('evt-1');
  expect(res.categories[0]).toMatchObject({ count: 2, remaining: 0 });
});

test('test_getRegistrationWindow_defaultsToClosedWhenNoWindow', async () => {
  const windows = new InMemoryWindowRepository();
  const repo = new InMemoryRegistrationRepository();
  expect(await getRegistrationWindow({ windows, repo })('evt-x')).toEqual({ sportEventId: 'evt-x', state: 'Closed', categories: [] });
});
