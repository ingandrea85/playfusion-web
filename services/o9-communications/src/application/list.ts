import { sortAnnouncements } from '../domain.js';
import type { AnnouncementRepository } from '../ports.js';

type Deps = { repo: AnnouncementRepository };

/** All announcements of an event, pinned-first then most recent. Public read. */
export const list = (d: Deps) => async (sportEventId: string) =>
  sortAnnouncements(await d.repo.listByEvent(sportEventId));
