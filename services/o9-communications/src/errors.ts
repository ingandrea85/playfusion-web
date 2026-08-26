import { DomainError } from '@playfusion/platform-lib';

export class AnnouncementNotFoundError extends DomainError {
  constructor(announcementId: string) {
    super('ANNOUNCEMENT_NOT_FOUND', `announcement ${announcementId} does not exist`, 404);
  }
}
