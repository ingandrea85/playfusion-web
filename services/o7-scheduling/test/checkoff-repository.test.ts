import { test, expect } from 'vitest';
import { checkoffSk } from '../src/resources.js';

test('test_checkoffSk_encodesTeamAndJoins', () => {
  expect(checkoffSk('2026-09-10', 'docce', 'Leoni Monselice')).toBe('2026-09-10#docce#Leoni%20Monselice');
});
