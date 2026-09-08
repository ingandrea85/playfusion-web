import { test, expect } from 'vitest';
import { stewardSubject, parseStewardScope } from '../src/resource-steward-token.js';

test('test_stewardSubject_roundTrips', () => {
  expect(parseStewardScope(stewardSubject('ev-1'))).toEqual({ eventId: 'ev-1' });
  expect(parseStewardScope('director:x:y')).toBeNull();
});
