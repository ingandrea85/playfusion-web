import { test, expect, beforeEach } from 'vitest';
import { getResources, saveResources, getResourcePlan } from '../../src/application/resources.js';
import { InMemoryResourceRepository, InMemoryMatchRepository, InMemoryScheduleRepository, FakeTeamSource } from '../fakes.js';
import type { ScheduleConfig, ScheduledMatch } from '../../src/domain.js';

const config: ScheduleConfig = { fields: ['C'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE' };
const shower = { resourceId: 'r', name: 'Docce', occupancyMinutes: 30, capacityPersons: 16, offsetMinutes: 0 };

let resources: InMemoryResourceRepository;
beforeEach(() => { resources = new InMemoryResourceRepository(); });

test('test_getResources_defaultsEmpty', async () => {
  expect(await getResources(resources)('e')).toEqual({ resources: [], teamSizes: {}, assignments: [] });
});

test('test_saveThenGetResources_roundTrips', async () => {
  const cfg = { resources: [shower], defaultTeamSize: 10, teamSizes: { A: 8 }, assignments: [] };
  await saveResources(resources)('e', cfg);
  expect(await getResources(resources)('e')).toEqual(cfg);
});

test('test_getResourcePlan_integrates_matches_schedule_teams', async () => {
  const matches = new InMemoryMatchRepository();
  const schedules = new InMemoryScheduleRepository();
  const teams = new FakeTeamSource({ e: { U10: ['A', 'B'] } });
  const ms: ScheduledMatch[] = [{ id: '1', sportEventId: 'e', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-09-01', time: '09:00', field: 'C', home: 'A', away: 'B' }];
  await matches.replace('e', ms);
  await schedules.save({ sportEventId: 'e', organizationId: 'o', status: 'GENERATED', config });
  await saveResources(resources)('e', { resources: [shower], teamSizes: { A: 8, B: 8 } });

  const plan = await getResourcePlan({ resources, matches, schedules, teams })('e');
  expect(plan.days).toEqual(['2026-09-01']);
  expect(plan.turns.find((t) => t.resourceId === 'r')!.slots[0]!.persons).toBe(16); // A+B share the shower
});
