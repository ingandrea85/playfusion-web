import { test, expect } from 'vitest';
import { setFinalsConfig } from '../../src/application/set-finals-config.js';
import { InMemoryFinalsConfigRepository } from '../fakes.js';

test('test_setFinalsConfig_persistsAndReturnsConfig_defaultsEnabled', async () => {
  const repo = new InMemoryFinalsConfigRepository();
  const out = await setFinalsConfig(repo)({ sportEventId: 'evt-1', finalsType: 'SINGLE_GROUP_CROSSOVER', qualifiersPerGroup: 4 });
  expect(out).toMatchObject({ finalsType: 'SINGLE_GROUP_CROSSOVER', qualifiersPerGroup: 4, finalsEnabled: true });
  expect(repo.byEvent.get('evt-1')).toMatchObject({ finalsType: 'SINGLE_GROUP_CROSSOVER', finalsEnabled: true });
});

test('test_setFinalsConfig_storesFinalsTeamsToBracketAndEnabledFlag', async () => {
  const repo = new InMemoryFinalsConfigRepository();
  const out = await setFinalsConfig(repo)({ sportEventId: 'evt-1', finalsType: 'SPLIT_GROUP_FINALS', qualifiersPerGroup: 2, finalsEnabled: false, finalsTeamsToBracket: 4 });
  expect(out).toMatchObject({ finalsType: 'SPLIT_GROUP_FINALS', finalsEnabled: false, finalsTeamsToBracket: 4 });
});

test('test_setFinalsConfig_overwritesPrevious', async () => {
  const repo = new InMemoryFinalsConfigRepository();
  await setFinalsConfig(repo)({ sportEventId: 'evt-1', finalsType: 'PLACEMENT', qualifiersPerGroup: 2 });
  await setFinalsConfig(repo)({ sportEventId: 'evt-1', finalsType: 'SPLIT_GROUP_FINALS', qualifiersPerGroup: 1, finalsTeamsToBracket: 8 });
  expect(repo.byEvent.get('evt-1')).toMatchObject({ finalsType: 'SPLIT_GROUP_FINALS', finalsTeamsToBracket: 8 });
});
