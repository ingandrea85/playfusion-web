import { test, expect } from 'vitest';
import { scheduleConfigBody } from '../src/handler.js';

// The zod body is the single source of truth for generate defaults (S7.1).
test('test_scheduleConfigBody_appliesDefaults', () => {
  const parsed = scheduleConfigBody.parse({});
  expect(parsed).toMatchObject({ periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', slotsPerDay: 8, groupsCount: 1, legs: 'SINGLE' });
  expect(parsed.fields.length).toBeGreaterThan(0);
});

test('test_scheduleConfigBody_acceptsFullConfig', () => {
  const parsed = scheduleConfigBody.parse({ fields: ['Campo 1'], periods: 3, periodMinutes: 15, breakMinutes: 5, dailyStart: '08:30', slotsPerDay: 12, groupsCount: 2, legs: 'HOME_AWAY' });
  expect(parsed).toMatchObject({ fields: ['Campo 1'], periods: 3, groupsCount: 2, legs: 'HOME_AWAY' });
});

test('test_scheduleConfigBody_rejectsNonPositivePeriods', () => {
  expect(() => scheduleConfigBody.parse({ periods: 0 })).toThrow();
  expect(() => scheduleConfigBody.parse({ legs: 'NONSENSE' })).toThrow();
});
