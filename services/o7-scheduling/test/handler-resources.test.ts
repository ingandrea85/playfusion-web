import { test, expect } from 'vitest';
import { resourceConfigBody } from '../src/handler.js';

// S17 resource groups/relations (A3): the PUT /events/:id/resources zod body must accept the new
// optional groups/relations fields and the per-resource `mode`, keeping shape parity with the
// domain ResourceConfig extended in resources.ts (A1/A2).
test('test_resourceConfigBody_acceptsGroupsRelationsAndMode', () => {
  const parsed = resourceConfigBody.parse({
    resources: [{ resourceId: 'r1', name: 'Doccia 1', occupancyMinutes: 10, capacityPersons: 14, offsetMinutes: 0, mode: 'free' }],
    groups: [{ groupId: 'g1', name: 'Docce', memberIds: ['r1'], mode: 'scheduled' }],
    relations: [{ from: 'g1', to: 'r1' }],
  });
  expect(parsed.groups?.[0]).toMatchObject({ groupId: 'g1', name: 'Docce', memberIds: ['r1'], mode: 'scheduled' });
  expect(parsed.relations?.[0]).toMatchObject({ from: 'g1', to: 'r1' });
  expect(parsed.resources[0]).toMatchObject({ mode: 'free' });
});

test('test_resourceConfigBody_groupsAndRelationsAreOptional', () => {
  const parsed = resourceConfigBody.parse({ resources: [] });
  expect(parsed.groups).toBeUndefined();
  expect(parsed.relations).toBeUndefined();
});

test('test_resourceConfigBody_rejectsBadModeOrEmptyGroupMember', () => {
  expect(() => resourceConfigBody.parse({ resources: [], groups: [{ groupId: 'g1', name: 'X', memberIds: [''] }] })).toThrow();
  expect(() => resourceConfigBody.parse({ resources: [{ resourceId: 'r1', name: 'X', occupancyMinutes: 10, capacityPersons: 14, offsetMinutes: 0, mode: 'nonsense' }] })).toThrow();
  expect(() => resourceConfigBody.parse({ resources: [], relations: [{ from: 'a' }] })).toThrow();
});
