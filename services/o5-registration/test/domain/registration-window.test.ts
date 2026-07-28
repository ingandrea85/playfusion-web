import { test, expect } from 'vitest';
import { openWindow, closeWindow, isOpen } from '../../src/domain/registration-window.js';

test('test_openWindow_closedBecomesOpen', () => {
  expect(isOpen(openWindow({ sportEventId: 'evt-1', state: 'Closed' }))).toBe(true);
});

test('test_closeWindow_openBecomesClosed', () => {
  expect(isOpen(closeWindow({ sportEventId: 'evt-1', state: 'Open' }))).toBe(false);
});
