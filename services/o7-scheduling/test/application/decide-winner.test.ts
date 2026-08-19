import { beforeEach, test, expect } from 'vitest';
import { ForbiddenError } from '@playfusion/platform-lib';
import { decideWinner } from '../../src/application/decide-winner.js';
import { recordResult } from '../../src/application/record-result.js';
import { CannotDecideWinnerError, MatchNotFoundError } from '../../src/errors.js';
import type { ScheduledMatch } from '../../src/domain.js';
import { InMemoryMatchRepository } from '../fakes.js';

const fin = (over: Partial<ScheduledMatch> = {}): ScheduledMatch =>
  ({ id: 'f1', sportEventId: 'e', categoryId: 'U10', groupLabel: 'Tabellone', day: 'd', time: '10:00', field: 'Campo A', home: '1ª Girone A', away: '2ª Girone A', phase: 'FINAL', slot: 'SF1', status: 'FINISHED', homeScore: 1, awayScore: 1, ...over });

let matches: InMemoryMatchRepository;
beforeEach(() => { matches = new InMemoryMatchRepository(); });

test('test_decideWinner_setsDecidedWinner_onFinishedDrawnFinal', async () => {
  await matches.replace('e', [fin()]);
  const m = await decideWinner(matches)({ sportEventId: 'e', matchId: 'f1', winner: 'AWAY' });
  expect(m.decidedWinner).toBe('AWAY');
});

test('test_decideWinner_rejectsNonFinal', async () => {
  await matches.replace('e', [{ ...fin(), phase: 'GROUP', groupLabel: 'Girone A' }]);
  await expect(decideWinner(matches)({ sportEventId: 'e', matchId: 'f1', winner: 'HOME' })).rejects.toBeInstanceOf(CannotDecideWinnerError);
});

test('test_decideWinner_rejectsNonDrawOrUnfinished', async () => {
  await matches.replace('e', [fin({ homeScore: 2, awayScore: 1 })]); // not a draw
  await expect(decideWinner(matches)({ sportEventId: 'e', matchId: 'f1', winner: 'HOME' })).rejects.toBeInstanceOf(CannotDecideWinnerError);
  await matches.replace('e', [fin({ status: 'LIVE' })]); // not finished
  await expect(decideWinner(matches)({ sportEventId: 'e', matchId: 'f1', winner: 'HOME' })).rejects.toBeInstanceOf(CannotDecideWinnerError);
});

test('test_decideWinner_directorRestrictedToOwnField', async () => {
  await matches.replace('e', [fin({ field: 'Campo B' })]);
  await expect(decideWinner(matches)({ sportEventId: 'e', matchId: 'f1', winner: 'HOME', restrictToField: 'Campo A' })).rejects.toBeInstanceOf(ForbiddenError);
});

test('test_decideWinner_missing404', async () => {
  await matches.replace('e', []);
  await expect(decideWinner(matches)({ sportEventId: 'e', matchId: 'nope', winner: 'HOME' })).rejects.toBeInstanceOf(MatchNotFoundError);
});

test('test_recordResult_clearsDecidedWinner', async () => {
  await matches.replace('e', [fin({ decidedWinner: 'HOME' })]);
  const m = await recordResult(matches)({ sportEventId: 'e', matchId: 'f1', homeScore: 2, awayScore: 0 });
  expect(m.decidedWinner).toBeUndefined();
});
