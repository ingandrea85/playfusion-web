import { beforeEach, test, expect } from 'vitest';
import { recordResult } from '../../src/application/record-result.js';
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

test('test_recordResult_setsScoresAndStandingsReflectThem', async () => {
  await recordResult(matches)({ sportEventId: 'evt-1', matchId: 'sm-1', homeScore: 3, awayScore: 1 });
  const standings = await listStandings(matches)('evt-1');
  const rows = standings[0]!.rows;
  expect(rows[0]).toMatchObject({ team: 'A', points: 3, goalsFor: 3, goalsAgainst: 1 });
  expect(rows.find((r) => r.team === 'B')).toMatchObject({ points: 0, lost: 1 });
  expect(rows.find((r) => r.team === 'C')).toMatchObject({ played: 0 }); // sm-2 not played
});

test('test_recordResult_correctionRecomputes', async () => {
  await recordResult(matches)({ sportEventId: 'evt-1', matchId: 'sm-1', homeScore: 3, awayScore: 1 });
  await recordResult(matches)({ sportEventId: 'evt-1', matchId: 'sm-1', homeScore: 0, awayScore: 2 }); // correction
  const rows = (await listStandings(matches)('evt-1'))[0]!.rows;
  expect(rows.find((r) => r.team === 'B')).toMatchObject({ points: 3, won: 1 });
  expect(rows.find((r) => r.team === 'A')).toMatchObject({ points: 0, lost: 1, goalsFor: 0, goalsAgainst: 2 });
});

test('test_recordResult_missingMatch404', async () => {
  await expect(recordResult(matches)({ sportEventId: 'evt-1', matchId: 'nope', homeScore: 1, awayScore: 0 }))
    .rejects.toBeInstanceOf(MatchNotFoundError);
});

import { ForbiddenError } from '@playfusion/platform-lib';
test('test_recordResult_directorScope_allowsOwnField_rejectsOther', async () => {
  await matches.replace('evt-1', [{ ...mk('sm-1', 'A', 'B'), field: 'Campo A' }, { ...mk('sm-2', 'C', 'D'), field: 'Campo B' }]);
  // director restricted to Campo A can report sm-1...
  const m = await recordResult(matches)({ sportEventId: 'evt-1', matchId: 'sm-1', homeScore: 1, awayScore: 0, restrictToField: 'Campo A' });
  expect(m).toMatchObject({ id: 'sm-1', homeScore: 1 });
  // ...but not sm-2 (Campo B)
  await expect(recordResult(matches)({ sportEventId: 'evt-1', matchId: 'sm-2', homeScore: 1, awayScore: 0, restrictToField: 'Campo A' }))
    .rejects.toBeInstanceOf(ForbiddenError);
});
