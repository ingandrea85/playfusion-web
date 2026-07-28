import { test, expect } from 'vitest';
import { withCorrelation, currentCorrelationId } from '../src/correlation.js';

test('test_withCorrelation_propagatesIdIntoAsyncContext', async () => {
  const seen = await withCorrelation('corr-1', async () => currentCorrelationId());
  expect(seen).toBe('corr-1');
});

test('test_currentCorrelationId_outsideContextReturnsPlaceholder', () => {
  expect(currentCorrelationId()).toBe('no-correlation');
});
