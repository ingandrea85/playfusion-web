import { test, expect } from 'vitest';
import { setFinalsConfig } from '../../src/application/set-finals-config.js';
import { InMemoryFinalsConfigRepository } from '../fakes.js';

test('test_setFinalsConfig_persistsAndReturnsConfig', async () => {
  const repo = new InMemoryFinalsConfigRepository();
  const out = await setFinalsConfig(repo)({ sportEventId: 'evt-1', finalsType: 'SINGLE_GROUP_CROSSOVER', qualifiersPerGroup: 4 });
  expect(out).toEqual({ finalsType: 'SINGLE_GROUP_CROSSOVER', qualifiersPerGroup: 4 });
  expect(repo.byEvent.get('evt-1')).toEqual({ finalsType: 'SINGLE_GROUP_CROSSOVER', qualifiersPerGroup: 4 });
});

test('test_setFinalsConfig_overwritesPrevious', async () => {
  const repo = new InMemoryFinalsConfigRepository();
  await setFinalsConfig(repo)({ sportEventId: 'evt-1', finalsType: 'PLACEMENT', qualifiersPerGroup: 2 });
  await setFinalsConfig(repo)({ sportEventId: 'evt-1', finalsType: 'SPLIT_GROUP_FINALS', qualifiersPerGroup: 1 });
  expect(repo.byEvent.get('evt-1')).toEqual({ finalsType: 'SPLIT_GROUP_FINALS', qualifiersPerGroup: 1 });
});
