import { describe, it, expect } from 'vitest';
import { publishAnnouncement, sortAnnouncements, type Announcement } from '../src/domain.js';

const base = { announcementId: 'a1', sportEventId: 'e1', organizationId: 'org', categoryId: null, pinned: false, createdAt: '2026-01-01T00:00:00.000Z' };

describe('publishAnnouncement (domain)', () => {
  it('test_publish_trimsTextAndMarksSourceOrganizer', () => {
    const a = publishAnnouncement({ ...base, title: '  Cambio campo  ', body: '  Spostati al Campo B  ' });
    expect(a.title).toBe('Cambio campo');
    expect(a.body).toBe('Spostati al Campo B');
    expect(a.source).toBe('ORGANIZER');
  });
  it('test_publish_rejectsEmptyTitle', () => {
    expect(() => publishAnnouncement({ ...base, title: '   ', body: 'x' })).toThrowError(/title is required/);
  });
  it('test_publish_rejectsEmptyBody', () => {
    expect(() => publishAnnouncement({ ...base, title: 'x', body: '   ' })).toThrowError(/body is required/);
  });
});

describe('sortAnnouncements', () => {
  it('test_sort_pinnedFirstThenMostRecent', () => {
    const mk = (id: string, pinned: boolean, createdAt: string): Announcement =>
      ({ ...base, announcementId: id, title: id, body: id, pinned, createdAt, source: 'ORGANIZER' });
    const out = sortAnnouncements([
      mk('old', false, '2026-01-01T00:00:00.000Z'),
      mk('new', false, '2026-01-03T00:00:00.000Z'),
      mk('pinnedOld', true, '2026-01-02T00:00:00.000Z'),
    ]);
    expect(out.map((a) => a.announcementId)).toEqual(['pinnedOld', 'new', 'old']);
  });
});
