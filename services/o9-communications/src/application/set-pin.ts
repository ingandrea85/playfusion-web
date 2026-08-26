import { checkpoint } from '@playfusion/platform-lib';
import { AnnouncementNotFoundError } from '../errors.js';
import type { AnnouncementRepository } from '../ports.js';

type Deps = { repo: AnnouncementRepository };
type Cmd = { announcementId: string; pinned: boolean };

/** Pin/unpin an existing announcement (404 if missing). */
export const setPin = (d: Deps) => async (cmd: Cmd) => {
  checkpoint('setPin', 'START', { announcementId: cmd.announcementId, pinned: cmd.pinned });
  const existing = await d.repo.get(cmd.announcementId);
  if (!existing) throw new AnnouncementNotFoundError(cmd.announcementId);
  const updated = { ...existing, pinned: cmd.pinned };
  await d.repo.save(updated);
  checkpoint('setPin', 'STOP', { announcementId: cmd.announcementId });
  return updated;
};
