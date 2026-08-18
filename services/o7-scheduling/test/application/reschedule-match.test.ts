import { beforeEach, test, expect } from 'vitest';
import { rescheduleMatch } from '../../src/application/reschedule-match.js';
import { slotConflict } from '../../src/domain.js';
import { MatchNotFoundError, SlotConflictError } from '../../src/errors.js';
import type { ScheduledMatch } from '../../src/domain.js';
import { InMemoryMatchRepository } from '../fakes.js';

const mk = (id: string, day: string, time: string, field: string): ScheduledMatch =>
  ({ id, sportEventId: 'evt-1', categoryId: 'U10', groupLabel: 'Girone A', day, time, field, home: 'A', away: 'B' });

let matches: InMemoryMatchRepository;
beforeEach(async () => {
  matches = new InMemoryMatchRepository();
  await matches.replace('evt-1', [
    mk('sm-1', '2026-08-29', '09:00', 'Campo A'),
    mk('sm-2', '2026-08-29', '09:00', 'Campo B'),
  ]);
});

test('test_slotConflict_ignoresTheMatchItself', () => {
  const all = [mk('sm-1', '2026-08-29', '09:00', 'Campo A')];
  expect(slotConflict(all, 'sm-1', { day: '2026-08-29', time: '09:00', field: 'Campo A' })).toBe(false);
});

test('test_reschedule_movesMatchToFreeSlot', async () => {
  const m = await rescheduleMatch(matches)({ sportEventId: 'evt-1', matchId: 'sm-1', patch: { day: '2026-08-30', time: '10:00', field: 'Campo A' } });
  expect(m).toMatchObject({ id: 'sm-1', day: '2026-08-30', time: '10:00', field: 'Campo A' });
  const all = await matches.list('evt-1');
  expect(all.find((x) => x.id === 'sm-1')).toMatchObject({ day: '2026-08-30', time: '10:00' });
  expect(all.find((x) => x.id === 'sm-2')).toMatchObject({ day: '2026-08-29', time: '09:00' }); // untouched
});

test('test_reschedule_rejectsSlotConflict', async () => {
  // sm-1 → sm-2's slot (Campo B, 09:00) → conflict.
  await expect(rescheduleMatch(matches)({ sportEventId: 'evt-1', matchId: 'sm-1', patch: { day: '2026-08-29', time: '09:00', field: 'Campo B' } }))
    .rejects.toBeInstanceOf(SlotConflictError);
  // unchanged
  expect((await matches.list('evt-1')).find((x) => x.id === 'sm-1')).toMatchObject({ field: 'Campo A' });
});

test('test_reschedule_allowsSameSlotNoOpAndFieldOnlyChange', async () => {
  // Moving sm-1 to a different field at the same day/time is fine (no other match there).
  const m = await rescheduleMatch(matches)({ sportEventId: 'evt-1', matchId: 'sm-1', patch: { day: '2026-08-29', time: '09:00', field: 'Campo C' } });
  expect(m.field).toBe('Campo C');
});

test('test_reschedule_missingMatch404', async () => {
  await expect(rescheduleMatch(matches)({ sportEventId: 'evt-1', matchId: 'nope', patch: { day: '2026-08-29', time: '11:00', field: 'Campo A' } }))
    .rejects.toBeInstanceOf(MatchNotFoundError);
});
