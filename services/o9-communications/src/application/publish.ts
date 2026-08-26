import { checkpoint } from '@playfusion/platform-lib';
import { publishAnnouncement as build } from '../domain.js';
import type { AnnouncementRepository } from '../ports.js';

type Deps = { repo: AnnouncementRepository; now?: () => string };
type Cmd = { announcementId: string; sportEventId: string; organizationId: string; categoryId: string | null; title: string; body: string; pinned: boolean };

export const publish = (d: Deps) => async (cmd: Cmd) => {
  checkpoint('publishAnnouncement', 'START', { sportEventId: cmd.sportEventId, categoryId: cmd.categoryId ?? 'ALL' });
  const createdAt = (d.now ?? (() => new Date().toISOString()))();
  const ann = build({ ...cmd, createdAt });
  await d.repo.save(ann);
  checkpoint('publishAnnouncement', 'STOP', { announcementId: ann.announcementId });
  return ann;
};
