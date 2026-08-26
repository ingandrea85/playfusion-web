import type { Announcement } from './domain.js';

export interface AnnouncementRepository {
  save(a: Announcement): Promise<void>;
  listByEvent(sportEventId: string): Promise<Announcement[]>;
  get(announcementId: string): Promise<Announcement | undefined>;
  delete(announcementId: string): Promise<void>;
}
