import { test, expect } from 'vitest';
import { createEventBody } from '../src/handler.js';

// The zod body is the single source of truth for defaults and optionality (S6.1).
test('test_createEventBody_defaultsPlaybookToPB1', () => {
  const parsed = createEventBody.parse({ sport: 'calcio', categorie: ['U15'], dates: { from: '2027-06-01', to: '2027-06-03' } });
  expect(parsed.playbook).toBe('PB-1');
  expect(parsed.name).toBeUndefined();
  expect(parsed.tieBreak).toBeUndefined();
});

test('test_createEventBody_acceptsFullCompetitionConfig', () => {
  const parsed = createEventBody.parse({
    sport: 'Calcio', categorie: ['U15'], dates: { from: '2027-06-01', to: '2027-06-03' },
    name: 'Torneo Estivo', location: 'Centro Sportivo', startTime: '09:00',
    tieBreak: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'], playbook: 'PB-2',
  });
  expect(parsed).toMatchObject({
    name: 'Torneo Estivo', location: 'Centro Sportivo', startTime: '09:00',
    tieBreak: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'], playbook: 'PB-2',
  });
});

test('test_createEventBody_rejectsUnknownTieBreakCriterion', () => {
  expect(() => createEventBody.parse({
    sport: 'calcio', categorie: ['U15'], dates: { from: 'a', to: 'b' }, tieBreak: ['NONSENSE'],
  })).toThrow();
});
