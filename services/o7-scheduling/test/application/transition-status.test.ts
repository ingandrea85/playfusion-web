import { beforeEach, test, expect } from 'vitest';
import { ForbiddenError } from '@playfusion/platform-lib';
import { startMatch, finishMatch, cancelMatch } from '../../src/application/transition-status.js';
import { listStandings } from '../../src/application/read.js';
import { recordResult } from '../../src/application/record-result.js';
import { InvalidMatchTransitionError, MatchNotFoundError } from '../../src/errors.js';
import type { ScheduledMatch } from '../../src/domain.js';
import { InMemoryMatchRepository } from '../fakes.js';

const mk = (id: string, field = 'Campo A'): ScheduledMatch =>
  ({ id, sportEventId: 'evt-1', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-09-01', time: '09:00', field, home: 'A', away: 'B', homeScore: null, awayScore: null });

const fixedClock = () => '2026-09-01T09:05:00.000Z';
let matches: InMemoryMatchRepository;
beforeEach(async () => {
  matches = new InMemoryMatchRepository();
  await matches.replace('evt-1', [mk('sm-1'), mk('sm-2', 'Campo B')]);
});

test('test_start_setsLiveAndStampsKickoffOnce', async () => {
  const m = await startMatch(matches, fixedClock)({ sportEventId: 'evt-1', matchId: 'sm-1' });
  expect(m).toMatchObject({ status: 'LIVE', startedAt: '2026-09-01T09:05:00.000Z' });
  // idempotent re-start keeps the original kickoff
  const again = await startMatch(matches, () => '2026-09-01T10:00:00.000Z')({ sportEventId: 'evt-1', matchId: 'sm-1' });
  expect(again.startedAt).toBe('2026-09-01T09:05:00.000Z');
});

test('test_finish_countsInStandings_liveDoesNot', async () => {
  await recordResult(matches, fixedClock)({ sportEventId: 'evt-1', matchId: 'sm-1', homeScore: 2, awayScore: 0 }); // LIVE
  expect((await listStandings(matches)('evt-1'))[0]!.rows.every((r) => r.played === 0)).toBe(true);
  await finishMatch(matches)({ sportEventId: 'evt-1', matchId: 'sm-1' });
  expect((await listStandings(matches)('evt-1'))[0]!.rows.find((r) => r.team === 'A')).toMatchObject({ points: 3 });
});

test('test_cancel_excludesFromStandings', async () => {
  await recordResult(matches, fixedClock)({ sportEventId: 'evt-1', matchId: 'sm-1', homeScore: 2, awayScore: 0 });
  await finishMatch(matches)({ sportEventId: 'evt-1', matchId: 'sm-1' });
  await cancelMatch(matches)({ sportEventId: 'evt-1', matchId: 'sm-1' });
  expect((await listStandings(matches)('evt-1'))[0]!.rows.every((r) => r.points === 0)).toBe(true);
});

test('test_cannotStartOrRecord_afterCancel', async () => {
  await cancelMatch(matches)({ sportEventId: 'evt-1', matchId: 'sm-1' });
  await expect(startMatch(matches, fixedClock)({ sportEventId: 'evt-1', matchId: 'sm-1' }))
    .rejects.toBeInstanceOf(InvalidMatchTransitionError);
  await expect(recordResult(matches, fixedClock)({ sportEventId: 'evt-1', matchId: 'sm-1', homeScore: 1, awayScore: 0 }))
    .rejects.toBeInstanceOf(InvalidMatchTransitionError);
});

test('test_directorFieldRestriction_onTransitions', async () => {
  // director on Campo A can start sm-1 but not sm-2 (Campo B)
  await startMatch(matches, fixedClock)({ sportEventId: 'evt-1', matchId: 'sm-1', restrictToField: 'Campo A' });
  await expect(startMatch(matches, fixedClock)({ sportEventId: 'evt-1', matchId: 'sm-2', restrictToField: 'Campo A' }))
    .rejects.toBeInstanceOf(ForbiddenError);
});

test('test_transition_missingMatch404', async () => {
  await expect(finishMatch(matches)({ sportEventId: 'evt-1', matchId: 'nope' }))
    .rejects.toBeInstanceOf(MatchNotFoundError);
});
