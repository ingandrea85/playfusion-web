import { beforeEach, test, expect } from 'vitest';
import { rescheduleMatch } from '../../src/application/reschedule-match.js';
import { slotConflict } from '../../src/domain.js';
import { InvalidTeamError, MatchNotFoundError, SlotConflictError, UnknownTeamError } from '../../src/errors.js';
import type { ScheduledMatch } from '../../src/domain.js';
import { InMemoryMatchRepository, FakeTeamSource } from '../fakes.js';

const mk = (id: string, day: string, time: string, field: string, home = 'A', away = 'B'): ScheduledMatch =>
  ({ id, sportEventId: 'evt-1', categoryId: 'U10', groupLabel: 'Girone A', day, time, field, home, away });

let matches: InMemoryMatchRepository;
let teams: FakeTeamSource;
const deps = () => ({ matches, teams });
beforeEach(async () => {
  matches = new InMemoryMatchRepository();
  teams = new FakeTeamSource({ 'evt-1': { U10: ['A', 'B', 'C', 'X'] } });
  await matches.replace('evt-1', [
    mk('sm-1', '2026-08-29', '09:00', 'Campo A'),
    mk('sm-2', '2026-08-29', '09:00', 'Campo B', 'C', 'X'),
  ]);
});

test('test_slotConflict_ignoresTheMatchItself', () => {
  const all = [mk('sm-1', '2026-08-29', '09:00', 'Campo A')];
  expect(slotConflict(all, 'sm-1', { day: '2026-08-29', time: '09:00', field: 'Campo A' })).toBe(false);
});

test('test_reschedule_movesMatchToFreeSlot', async () => {
  const m = await rescheduleMatch(deps())({ sportEventId: 'evt-1', matchId: 'sm-1', patch: { day: '2026-08-30', time: '10:00', field: 'Campo A' } });
  expect(m).toMatchObject({ id: 'sm-1', day: '2026-08-30', time: '10:00', field: 'Campo A', home: 'A', away: 'B' });
});

test('test_reschedule_rejectsSlotConflict', async () => {
  await expect(rescheduleMatch(deps())({ sportEventId: 'evt-1', matchId: 'sm-1', patch: { day: '2026-08-29', time: '09:00', field: 'Campo B' } }))
    .rejects.toBeInstanceOf(SlotConflictError);
});

test('test_reschedule_missingMatch404', async () => {
  await expect(rescheduleMatch(deps())({ sportEventId: 'evt-1', matchId: 'nope', patch: { day: '2026-08-29', time: '11:00', field: 'Campo A' } }))
    .rejects.toBeInstanceOf(MatchNotFoundError);
});

test('test_editTeams_changesTeamsAndResetsScore', async () => {
  await matches.replace('evt-1', [{ ...mk('sm-1', '2026-08-29', '09:00', 'Campo A'), homeScore: 2, awayScore: 1 }, mk('sm-2', '2026-08-29', '09:00', 'Campo B', 'C', 'X')]);
  const m = await rescheduleMatch(deps())({ sportEventId: 'evt-1', matchId: 'sm-1', patch: { day: '2026-08-29', time: '09:00', field: 'Campo A', home: 'A', away: 'C' } });
  expect(m).toMatchObject({ home: 'A', away: 'C', homeScore: null, awayScore: null }); // teams changed → score reset
});

test('test_editTeams_keepsScoreWhenTeamsUnchanged', async () => {
  await matches.replace('evt-1', [{ ...mk('sm-1', '2026-08-29', '09:00', 'Campo A'), homeScore: 2, awayScore: 1 }]);
  const m = await rescheduleMatch(deps())({ sportEventId: 'evt-1', matchId: 'sm-1', patch: { day: '2026-08-30', time: '09:00', field: 'Campo A', home: 'A', away: 'B' } });
  expect(m).toMatchObject({ home: 'A', away: 'B', homeScore: 2, awayScore: 1 }); // same teams → score kept
});

test('test_editTeams_rejectsSameTeam', async () => {
  await expect(rescheduleMatch(deps())({ sportEventId: 'evt-1', matchId: 'sm-1', patch: { day: '2026-08-29', time: '09:00', field: 'Campo A', home: 'A', away: 'A' } }))
    .rejects.toBeInstanceOf(InvalidTeamError);
});

test('test_editTeams_rejectsUnconfirmedTeam_levelB', async () => {
  await expect(rescheduleMatch(deps())({ sportEventId: 'evt-1', matchId: 'sm-1', patch: { day: '2026-08-29', time: '09:00', field: 'Campo A', home: 'A', away: 'Zzz' } }))
    .rejects.toBeInstanceOf(UnknownTeamError);
});

test('test_editTeams_failOpenWhenNoConfirmedListKnown', async () => {
  teams = new FakeTeamSource({}); // o5 unavailable / no confirmed teams → membership check skipped
  const m = await rescheduleMatch(deps())({ sportEventId: 'evt-1', matchId: 'sm-1', patch: { day: '2026-08-29', time: '09:00', field: 'Campo A', home: 'A', away: 'Zzz' } });
  expect(m).toMatchObject({ home: 'A', away: 'Zzz' });
});
