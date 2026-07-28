import { openWindow as openDomain } from '../domain/registration-window.js';
import { checkpoint, type EventPublisher } from '@playfusion/platform-lib';
import type { WindowRepository } from '../ports/window-repository.js';

type Deps = { windows: WindowRepository; publisher: EventPublisher };
export const openWindow = (d: Deps) => async (cmd: { sportEventId: string; organizationId: string }) => {
  checkpoint('openWindow', 'START', { sportEventId: cmd.sportEventId });
  const existing = (await d.windows.get(cmd.sportEventId)) ?? { sportEventId: cmd.sportEventId, state: 'Closed' as const };
  const opened = openDomain(existing);
  await d.windows.save(opened);
  await d.publisher.publish('RegistrationsOpened', { sportEventId: cmd.sportEventId }, cmd.organizationId);
  checkpoint('openWindow', 'STOP', { sportEventId: cmd.sportEventId });
};
