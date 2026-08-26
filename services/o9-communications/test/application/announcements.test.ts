import { describe, it, expect } from 'vitest';
import { InMemoryAnnouncementRepository } from '../fakes.js';
import { publish } from '../../src/application/publish.js';
import { list } from '../../src/application/list.js';
import { setPin } from '../../src/application/set-pin.js';
import { remove } from '../../src/application/remove.js';

const cmd = (over: Partial<Parameters<ReturnType<typeof publish>>[0]> = {}) => ({
  announcementId: 'a1', sportEventId: 'e1', organizationId: 'org', categoryId: null as string | null,
  title: 'Titolo', body: 'Testo', pinned: false, ...over,
});

describe('o9 application — publish', () => {
  it('test_publish_persistsWithInjectedClock', async () => {
    const repo = new InMemoryAnnouncementRepository();
    const ann = await publish({ repo, now: () => '2026-05-01T10:00:00.000Z' })(cmd());
    expect(ann.createdAt).toBe('2026-05-01T10:00:00.000Z');
    expect(ann.source).toBe('ORGANIZER');
    expect(repo.items.get('a1')?.title).toBe('Titolo');
  });
});

describe('o9 application — list', () => {
  it('test_list_returnsPinnedFirstThenRecent', async () => {
    const repo = new InMemoryAnnouncementRepository();
    await publish({ repo, now: () => '2026-05-01T00:00:00.000Z' })(cmd({ announcementId: 'a1', title: 'primo' }));
    await publish({ repo, now: () => '2026-05-02T00:00:00.000Z' })(cmd({ announcementId: 'a2', title: 'secondo' }));
    await publish({ repo, now: () => '2026-05-03T00:00:00.000Z' })(cmd({ announcementId: 'a3', title: 'terzo', pinned: true }));
    const out = await list({ repo })('e1');
    expect(out.map((a) => a.announcementId)).toEqual(['a3', 'a2', 'a1']);
  });
  it('test_list_scopesToOneEvent', async () => {
    const repo = new InMemoryAnnouncementRepository();
    await publish({ repo })(cmd({ announcementId: 'a1', sportEventId: 'e1' }));
    await publish({ repo })(cmd({ announcementId: 'a2', sportEventId: 'e2' }));
    expect((await list({ repo })('e1')).map((a) => a.announcementId)).toEqual(['a1']);
  });
});

describe('o9 application — setPin', () => {
  it('test_setPin_togglesPinnedFlag', async () => {
    const repo = new InMemoryAnnouncementRepository();
    await publish({ repo })(cmd({ pinned: false }));
    const pinned = await setPin({ repo })({ announcementId: 'a1', pinned: true });
    expect(pinned.pinned).toBe(true);
    expect(repo.items.get('a1')?.pinned).toBe(true);
  });
  it('test_setPin_throwsWhenMissing', async () => {
    const repo = new InMemoryAnnouncementRepository();
    await expect(setPin({ repo })({ announcementId: 'nope', pinned: true })).rejects.toThrowError(/does not exist/);
  });
});

describe('o9 application — remove', () => {
  it('test_remove_deletesTheAnnouncement', async () => {
    const repo = new InMemoryAnnouncementRepository();
    await publish({ repo })(cmd());
    await remove({ repo })('a1');
    expect(repo.items.has('a1')).toBe(false);
  });
});
