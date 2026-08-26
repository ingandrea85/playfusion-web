import type { AnnouncementRepository } from '../src/ports.js';
import type { Announcement } from '../src/domain.js';

export class InMemoryAnnouncementRepository implements AnnouncementRepository {
  readonly items = new Map<string, Announcement>();
  async save(a: Announcement) { this.items.set(a.announcementId, a); }
  async listByEvent(sportEventId: string) { return [...this.items.values()].filter((a) => a.sportEventId === sportEventId); }
  async get(announcementId: string) { return this.items.get(announcementId); }
  async delete(announcementId: string) { this.items.delete(announcementId); }
}
