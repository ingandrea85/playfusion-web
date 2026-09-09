import { test, expect } from 'vitest';
import { directorSubject, parseDirectorScope } from '../src/director-token.js';

test('test_directorSubject_roundTrips_eventAndCategory', () => {
  const s = directorSubject('9a104a6f-uuid', 'U10');
  expect(parseDirectorScope(s)).toEqual({ eventId: '9a104a6f-uuid', category: 'U10' });
});

test('test_directorSubject_handlesCategoriesWithSpecialChars', () => {
  const s = directorSubject('evt-1', 'U12: Nord');
  expect(parseDirectorScope(s)).toEqual({ eventId: 'evt-1', category: 'U12: Nord' });
});

test('test_parseDirectorScope_rejectsNonDirectorSubjects', () => {
  expect(parseDirectorScope('enroll:evt-1')).toBeNull();
  expect(parseDirectorScope('random')).toBeNull();
});
