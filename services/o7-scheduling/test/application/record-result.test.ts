import { beforeEach, test, expect } from 'vitest';
import { recordResult } from '../../src/application/record-result.js';
import { finishMatch } from '../../src/application/transition-status.js';
import { listStandings } from '../../src/application/read.js';
import { MatchNotFoundError } from '../../src/errors.js';
import type { ScheduledMatch } from '../../src/domain.js';
import { InMemoryMatchRepository } from '../fakes.js';

const mk = (id: string, home: string, away: string): ScheduledMatch =>
  ({ id, sportEventId: 'evt-1', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-09-01', time: '09:00', field: 'C', home, away, homeScore: null, awayScore: null });

let matches: InMemoryMatchRepository;
beforeEach(async () => {
  matches = new InMemoryMatchRepository();
  await matches.replace('evt-1', [mk('sm-1', 'A', 'B'), mk('sm-2', 'A', 'C')]);
});

test('test_recordResult_autoAdvancesToLive_notYetCounted', async () => {
  // S26: recording a scheduled match makes it LIVE and stamps the kickoff — but a LIVE score
  // does NOT move the table (only FINISHED counts).
  const m = await recordResult(matches)({ sportEventId: 'evt-1', matchId: 'sm-1', homeScore: 3, awayScore: 1 });
  expect(m).toMatchObject({ status: 'LIVE', homeScore: 3, awayScore: 1 });
  expect(typeof m.startedAt).toBe('string');
  const rows = (await listStandings(matches)('evt-1'))[0]!.rows;
  expect(rows.every((r) => r.played === 0 && r.points === 0)).toBe(true); // live score not counted yet
});

test('test_recordResult_thenFinish_standingsReflect', async () => {
  await recordResult(matches)({ sportEventId: 'evt-1', matchId: 'sm-1', homeScore: 3, awayScore: 1 });
  await finishMatch(matches)({ sportEventId: 'evt-1', matchId: 'sm-1' });
  const rows = (await listStandings(matches)('evt-1'))[0]!.rows;
  expect(rows[0]).toMatchObject({ team: 'A', points: 3, goalsFor: 3, goalsAgainst: 1 });
  expect(rows.find((r) => r.team === 'B')).toMatchObject({ points: 0, lost: 1 });
  expect(rows.find((r) => r.team === 'C')).toMatchObject({ played: 0 }); // sm-2 not played
});

test('test_recordResult_correctionRecomputes', async () => {
  await recordResult(matches)({ sportEventId: 'evt-1', matchId: 'sm-1', homeScore: 3, awayScore: 1 });
  await finishMatch(matches)({ sportEventId: 'evt-1', matchId: 'sm-1' });
  // Organizer corrects a FINISHED match (no field restriction) — stays FINISHED, recomputes.
  const corrected = await recordResult(matches)({ sportEventId: 'evt-1', matchId: 'sm-1', homeScore: 0, awayScore: 2 });
  expect(corrected.status).toBe('FINISHED');
  const rows = (await listStandings(matches)('evt-1'))[0]!.rows;
  expect(rows.find((r) => r.team === 'B')).toMatchObject({ points: 3, won: 1 });
  expect(rows.find((r) => r.team === 'A')).toMatchObject({ points: 0, lost: 1, goalsFor: 0, goalsAgainst: 2 });
});

test('test_recordResult_missingMatch404', async () => {
  await expect(recordResult(matches)({ sportEventId: 'evt-1', matchId: 'nope', homeScore: 1, awayScore: 0 }))
    .rejects.toBeInstanceOf(MatchNotFoundError);
});

import { ForbiddenError } from '@playfusion/platform-lib';
test('test_recordResult_directorScope_allowsOwnCategory_rejectsOther', async () => {
  await matches.replace('evt-1', [{ ...mk('sm-1', 'A', 'B'), categoryId: 'U10' }, { ...mk('sm-2', 'C', 'D'), categoryId: 'U12' }]);
  // director restricted to U10 can report sm-1...
  const m = await recordResult(matches)({ sportEventId: 'evt-1', matchId: 'sm-1', homeScore: 1, awayScore: 0, restrictToCategory: 'U10' });
  expect(m).toMatchObject({ id: 'sm-1', homeScore: 1 });
  // ...but not sm-2 (U12)
  await expect(recordResult(matches)({ sportEventId: 'evt-1', matchId: 'sm-2', homeScore: 1, awayScore: 0, restrictToCategory: 'U10' }))
    .rejects.toBeInstanceOf(ForbiddenError);
});

test('test_recordResult_directorCannotCorrectFinished', async () => {
  await matches.replace('evt-1', [{ ...mk('sm-1', 'A', 'B'), categoryId: 'U10' }]);
  await recordResult(matches)({ sportEventId: 'evt-1', matchId: 'sm-1', homeScore: 2, awayScore: 0, restrictToCategory: 'U10' });
  await finishMatch(matches)({ sportEventId: 'evt-1', matchId: 'sm-1', restrictToCategory: 'U10' });
  // Once finished, a director may not re-open the result — only the organizer corrects.
  await expect(recordResult(matches)({ sportEventId: 'evt-1', matchId: 'sm-1', homeScore: 3, awayScore: 0, restrictToCategory: 'U10' }))
    .rejects.toBeInstanceOf(ForbiddenError);
});
