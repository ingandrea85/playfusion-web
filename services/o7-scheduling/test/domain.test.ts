import { test, expect } from 'vitest';
import { canGenerate, nextOnApprove, nextOnPublish, defaultConfig } from '../src/domain.js';

test('test_canGenerate_allowsWhileNotYetApproved', () => {
  expect(canGenerate('NONE')).toBe(true);
  expect(canGenerate('GENERATED')).toBe(true);
  expect(canGenerate('APPROVED')).toBe(false);
  expect(canGenerate('PUBLISHED')).toBe(false);
});

test('test_nextOnApprove_onlyFromGenerated', () => {
  expect(nextOnApprove('GENERATED')).toBe('APPROVED');
  expect(nextOnApprove('NONE')).toBe('NONE');
  expect(nextOnApprove('APPROVED')).toBe('APPROVED');
  expect(nextOnApprove('PUBLISHED')).toBe('PUBLISHED');
});

test('test_nextOnPublish_onlyFromApproved', () => {
  expect(nextOnPublish('APPROVED')).toBe('PUBLISHED');
  expect(nextOnPublish('GENERATED')).toBe('GENERATED');
  expect(nextOnPublish('NONE')).toBe('NONE');
  expect(nextOnPublish('PUBLISHED')).toBe('PUBLISHED');
});

test('test_defaultConfig_singleGroupSingleLeg', () => {
  const c = defaultConfig();
  expect(c.groupsCount).toBe(1);
  expect(c.legs).toBe('SINGLE');
  expect(c.fields.length).toBeGreaterThan(0);
});
