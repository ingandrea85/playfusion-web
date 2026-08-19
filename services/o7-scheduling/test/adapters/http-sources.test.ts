import { test, expect } from 'vitest';
import { HttpTeamSource } from '../../src/adapters/http-sources.js';

const fakeFetch = (rows: unknown): typeof fetch =>
  (async () => ({ ok: true, json: async () => rows } as Response)) as unknown as typeof fetch;

test('test_confirmedByCategory_prefersTeamName_elseParticipantRef', async () => {
  const src = new HttpTeamSource('http://base', fakeFetch([
    { participantRef: 'uuid-1', categoria: 'U10', status: 'Confirmed', teamName: 'Aquile' }, // PB-2
    { participantRef: 'coach-team-b', categoria: 'U10', status: 'Confirmed' },               // PB-1
    { participantRef: 'uuid-x', categoria: 'U10', status: 'Applied', teamName: 'Scartata' }, // not Confirmed
  ]));
  const byCat = await src.confirmedByCategory('e1');
  expect(byCat.get('U10')).toEqual(['Aquile', 'coach-team-b']); // real name for PB-2, ref for PB-1, Applied skipped
});
