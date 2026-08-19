import { beforeEach, test, expect } from 'vitest';
import { listFinalStandings } from '../../src/application/read.js';
import type { ScheduledMatch } from '../../src/domain.js';
import { InMemoryMatchRepository, InMemoryTieOverrideRepository, FakeEventSource } from '../fakes.js';

let n = 0;
const grp = (home: string, away: string, hs: number, as: number): ScheduledMatch =>
  ({ id: `sm-${++n}`, sportEventId: 'e', categoryId: 'U10', groupLabel: 'Girone A', day: 'd', time: '09:00', field: 'C', home, away, homeScore: hs, awayScore: as, status: 'FINISHED', phase: 'GROUP' });
const fin = (over: Partial<ScheduledMatch>): ScheduledMatch =>
  ({ id: `fm-${++n}`, sportEventId: 'e', categoryId: 'U10', groupLabel: 'Tabellone', day: 'd', time: '14:00', field: 'C', home: '', away: '', status: 'SCHEDULED', phase: 'FINAL', ...over });

let matches: InMemoryMatchRepository;
const overrides = new InMemoryTieOverrideRepository();
const events = new FakeEventSource({ e: { sportEventId: 'e', dates: { from: 'd', to: 'd' }, categorie: ['U10'], sport: 'Calcio' } });
// Group A → A>B>C>D (smaller ref wins every match).
const groupAllPlayed = (): ScheduledMatch[] => { n = 0; return [grp('A', 'B', 1, 0), grp('A', 'C', 1, 0), grp('A', 'D', 1, 0), grp('B', 'C', 1, 0), grp('B', 'D', 1, 0), grp('C', 'D', 1, 0)]; };

beforeEach(() => { matches = new InMemoryMatchRepository(); });

test('test_finalStandings_split_bracketPlusFinalGroup', async () => {
  await matches.replace('e', [
    ...groupAllPlayed(),
    fin({ home: '1ª Girone A', away: '2ª Girone A', placementFrom: 1, placementTo: 2, homeScore: 2, awayScore: 1, status: 'FINISHED' }),
    fin({ id: 'fg1', groupLabel: 'Girone finale', phase: 'FINAL_GROUP', home: '3ª Girone A', away: '4ª Girone A', homeScore: 1, awayScore: 0, status: 'FINISHED' }),
  ]);
  const [cat] = await listFinalStandings(matches, { overrides, events })('e');
  expect(cat.rows).toEqual([
    { position: 1, team: 'A' }, { position: 2, team: 'B' }, { position: 3, team: 'C' }, { position: 4, team: 'D' },
  ]);
});

test('test_finalStandings_pendingOnUndecidedDrawnFinal', async () => {
  await matches.replace('e', [
    ...groupAllPlayed(),
    fin({ home: '1ª Girone A', away: '2ª Girone A', placementFrom: 1, placementTo: 2, homeScore: 1, awayScore: 1, status: 'FINISHED' }), // drawn, no decree
  ]);
  const [cat] = await listFinalStandings(matches, { overrides, events })('e');
  expect(cat.rows).toEqual([{ position: 1, pending: 'result' }, { position: 2, pending: 'result' }]);
});

test('test_finalStandings_decreedDrawnFinal_resolves', async () => {
  await matches.replace('e', [
    ...groupAllPlayed(),
    fin({ home: '1ª Girone A', away: '2ª Girone A', placementFrom: 1, placementTo: 2, homeScore: 1, awayScore: 1, status: 'FINISHED', decidedWinner: 'AWAY' }),
  ]);
  const [cat] = await listFinalStandings(matches, { overrides, events })('e');
  expect(cat.rows).toEqual([{ position: 1, team: 'B' }, { position: 2, team: 'A' }]); // AWAY (2ª=B) decreed winner → 1st
});
