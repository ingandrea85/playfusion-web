import { DomainError } from '@playfusion/platform-lib';

// S15 (O9 communications) — organizer-authored announcements. `categoryId` null = the whole
// event; a category name otherwise (categories are names in this platform, like o7). SYSTEM/auto
// announcements (schedule-published, reschedule, champion…) are a deferred follow-up: they need
// cross-BC EventBridge wiring, so for now every announcement is source ORGANIZER.
export type AnnouncementSource = 'ORGANIZER';

export interface Announcement {
  announcementId: string;
  sportEventId: string;
  organizationId: string;
  categoryId: string | null;
  title: string;
  body: string;
  pinned: boolean;
  source: AnnouncementSource;
  createdAt: string; // ISO instant, injected by the application (clock)
}

export interface PublishInput {
  announcementId: string;
  sportEventId: string;
  organizationId: string;
  categoryId: string | null;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
}

/** Build a valid ORGANIZER announcement; trims text and rejects empty title/body. */
export function publishAnnouncement(input: PublishInput): Announcement {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new DomainError('INVALID_ANNOUNCEMENT', 'title is required', 422);
  if (!body) throw new DomainError('INVALID_ANNOUNCEMENT', 'body is required', 422);
  return {
    announcementId: input.announcementId,
    sportEventId: input.sportEventId,
    organizationId: input.organizationId,
    categoryId: input.categoryId,
    title,
    body,
    pinned: input.pinned,
    source: 'ORGANIZER',
    createdAt: input.createdAt,
  };
}

/** Reading order: pinned first, then most recent. */
export function sortAnnouncements(list: Announcement[]): Announcement[] {
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
}
