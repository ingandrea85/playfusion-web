import { beforeEach, test, expect } from 'vitest';
import { setTieOverride } from '../../src/application/resolve-tie.js';
import { listStandings } from '../../src/application/read.js';
import { recordResult } from '../../src/application/record-result.js';
import { finishMatch } from '../../src/application/transition-status.js';
import { InvalidTieOverrideError } from '../../src/errors.js';
import type { ScheduledMatch } from '../../src/domain.js';
import { InMemoryMatchRepository, InMemoryTieOverrideRepository, FakeEventSource } from '../fakes.js';

let m = 0;
const mk = (home: string, away: string, hs: number, as: number): ScheduledMatch =>
  ({ id: `sm-${++m}`, sportEventId: 'evt-1', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-09-01', time: '09:00', field: 'C', home, away, homeScore: hs, awayScore: as, status: 'FINISHED' });

let matches: InMemoryMatchRepository;
let overrides: InMemoryTieOverrideRepository;
// Two teams identical on everything, direct match drawn → a genuine residual tie.
const events = new FakeEventSource({ 'evt-1': { sportEventId: 'evt-1', dates: { from: '2026-09-01', to: '2026-09-02' }, categorie: ['U10'], sport: 'Calcio' } });

beforeEach(async () => {
  matches = new InMemoryMatchRepository();
  overrides = new InMemoryTieOverrideRepository();
  await matches.replace('evt-1', [mk('Alfa', 'Bravo', 1, 1)]);
});

test('test_tie_isUnresolved_untilOverride', async () => {
  const before = await listStandings(matches, { overrides, events })('evt-1');
  expect(before[0]!.unresolved).toEqual([['Alfa', 'Bravo']]);
  expect(before[0]!.override).toBeUndefined();

  const ov = await setTieOverride(overrides)({ sportEventId: 'evt-1', categoryId: 'U10', groupLabel: 'Girone A', order: ['Bravo', 'Alfa'], resolvedBy: 'auth0|org1' });
  expect(ov).toMatchObject({ order: ['Bravo', 'Alfa'], resolvedBy: 'auth0|org1' });
  expect(typeof ov.resolvedAt).toBe('string');

  const after = await listStandings(matches, { overrides, events })('evt-1');
  expect(after[0]!.rows.map((r) => r.team)).toEqual(['Bravo', 'Alfa']);
  expect(after[0]!.unresolved).toEqual([]);
  expect(after[0]!.override).toMatchObject({ order: ['Bravo', 'Alfa'], resolvedBy: 'auth0|org1' });
});

test('test_override_selfInvalidatesWhenTiedSetChanges', async () => {
  await setTieOverride(overrides)({ sportEventId: 'evt-1', categoryId: 'U10', groupLabel: 'Girone A', order: ['Bravo', 'Alfa'], resolvedBy: 'auth0|org1' });
  // A correction breaks the tie (Alfa now clearly ahead) → the override no longer matches a tied set.
  const first = (await matches.list('evt-1'))[0]!;
  await recordResult(matches)({ sportEventId: 'evt-1', matchId: first.id, homeScore: 5, awayScore: 0 });
  await finishMatch(matches)({ sportEventId: 'evt-1', matchId: first.id });

  const s = await listStandings(matches, { overrides, events })('evt-1');
  expect(s[0]!.rows.map((r) => r.team)).toEqual(['Alfa', 'Bravo']); // sporting order, not the stale override
  expect(s[0]!.unresolved).toEqual([]);
  expect(s[0]!.override).toBeUndefined(); // stale override not surfaced
});

test('test_setTieOverride_rejectsEmptyOrDuplicate', async () => {
  await expect(setTieOverride(overrides)({ sportEventId: 'evt-1', categoryId: 'U10', groupLabel: 'Girone A', order: [], resolvedBy: 'x' }))
    .rejects.toBeInstanceOf(InvalidTieOverrideError);
  await expect(setTieOverride(overrides)({ sportEventId: 'evt-1', categoryId: 'U10', groupLabel: 'Girone A', order: ['Alfa', 'Alfa'], resolvedBy: 'x' }))
    .rejects.toBeInstanceOf(InvalidTieOverrideError);
});

test('test_listStandings_defaultPolicyWhenNoTieBreakConfigured', async () => {
  // No tieBreak on the event, sport Calcio → default [H2H, GD, GF]. A beats B head-to-head.
  await matches.replace('evt-2', [mk2('A', 'B', 2, 1)]);
  const s = await listStandings(matches, { overrides, events: new FakeEventSource({ 'evt-2': { sportEventId: 'evt-2', dates: { from: '2026-09-01', to: '2026-09-02' }, categorie: ['U10'], sport: 'Calcio' } }) })('evt-2');
  expect(s[0]!.rows.map((r) => r.team)).toEqual(['A', 'B']);
  expect(s[0]!.unresolved).toEqual([]);
});

let m2 = 100;
function mk2(home: string, away: string, hs: number, as: number): ScheduledMatch {
  return { id: `x-${++m2}`, sportEventId: 'evt-2', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-09-01', time: '09:00', field: 'C', home, away, homeScore: hs, awayScore: as, status: 'FINISHED' };
}
