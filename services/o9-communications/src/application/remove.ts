import { checkpoint } from '@playfusion/platform-lib';
import type { AnnouncementRepository } from '../ports.js';

type Deps = { repo: AnnouncementRepository };

/** Delete an announcement. Idempotent — no error if it does not exist. */
export const remove = (d: Deps) => async (announcementId: string) => {
  checkpoint('removeAnnouncement', 'START', { announcementId });
  await d.repo.delete(announcementId);
  checkpoint('removeAnnouncement', 'STOP', { announcementId });
};
