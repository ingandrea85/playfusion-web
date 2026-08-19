import { test, expect } from 'vitest';
import { directorSubject, parseDirectorScope } from '../src/director-token.js';

test('test_directorSubject_roundTrips_eventAndField', () => {
  const s = directorSubject('9a104a6f-uuid', 'Campo A10');
  expect(parseDirectorScope(s)).toEqual({ eventId: '9a104a6f-uuid', field: 'Campo A10' });
});

test('test_directorSubject_handlesFieldsWithSpecialChars', () => {
  const s = directorSubject('evt-1', 'Campo A12: Nord');
  expect(parseDirectorScope(s)).toEqual({ eventId: 'evt-1', field: 'Campo A12: Nord' });
});

test('test_parseDirectorScope_rejectsNonDirectorSubjects', () => {
  expect(parseDirectorScope('enroll:evt-1')).toBeNull();
  expect(parseDirectorScope('random')).toBeNull();
});
