import { beforeEach, test, expect } from 'vitest';
import { listStandings } from '../../src/application/read.js';
import type { ScheduledMatch } from '../../src/domain.js';
import { InMemoryMatchRepository, InMemoryTieOverrideRepository, FakeEventSource } from '../fakes.js';

let n = 0;
const grp = (home: string, away: string, hs: number, as: number): ScheduledMatch =>
  ({ id: `sm-${++n}`, sportEventId: 'e', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-09-01', time: '09:00', field: 'C', home, away, homeScore: hs, awayScore: as, status: 'FINISHED', phase: 'GROUP' });

let matches: InMemoryMatchRepository;
const overrides = new InMemoryTieOverrideRepository();
const events = new FakeEventSource({ e: { sportEventId: 'e', dates: { from: '2026-09-01', to: '2026-09-02' }, categorie: ['U10'], sport: 'Calcio' } });

beforeEach(async () => {
  matches = new InMemoryMatchRepository();
  // Group A: A>B>C>D (A 9, B 6, C 3, D 0), all played.
  await matches.replace('e', [
    grp('A', 'B', 3, 0), grp('A', 'C', 3, 0), grp('A', 'D', 3, 0), grp('B', 'C', 3, 0), grp('B', 'D', 3, 0), grp('C', 'D', 3, 0),
    // FINAL_GROUP (SPLIT rest = 3ª/4ª): placeholders resolve to C and D; C beats D.
    { id: 'fg-1', sportEventId: 'e', categoryId: 'U10', groupLabel: 'Girone finale', day: '2026-09-02', time: '10:00', field: 'C', home: '3ª Girone A', away: '4ª Girone A', homeScore: 2, awayScore: 1, status: 'FINISHED', phase: 'FINAL_GROUP', bracketLabel: 'Girone finale', slot: 'FG1' },
  ]);
});

test('test_finalGroup_standingsUseResolvedTeams', async () => {
  const s = await listStandings(matches, { overrides, events })('e');
  const finalGroup = s.find((g) => g.groupLabel === 'Girone finale')!;
  expect(finalGroup).toBeDefined();
  expect(finalGroup.rows.map((r) => r.team)).toEqual(['C', 'D']); // real teams, not placeholders
  expect(finalGroup.rows[0]).toMatchObject({ team: 'C', points: 3, played: 1 });
  expect(finalGroup.rows[1]).toMatchObject({ team: 'D', points: 0 });
  // the group table is still present and unaffected
  const groupA = s.find((g) => g.groupLabel === 'Girone A')!;
  expect(groupA.rows.map((r) => r.team)).toEqual(['A', 'B', 'C', 'D']);
});
