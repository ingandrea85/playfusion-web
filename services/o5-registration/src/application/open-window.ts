import { openWindow as openDomain } from '../domain/registration-window.js';
import { checkpoint, type EventPublisher } from '@playfusion/platform-lib';
import type { WindowRepository } from '../ports/window-repository.js';

type Deps = { windows: WindowRepository; publisher: EventPublisher };
export const openWindow = (d: Deps) => async (cmd: { sportEventId: string; organizationId: string; capacities?: Record<string, number> }) => {
  checkpoint('openWindow', 'START', { sportEventId: cmd.sportEventId });
  const existing = (await d.windows.get(cmd.sportEventId)) ?? { sportEventId: cmd.sportEventId, state: 'Closed' as const };
  // Capture the per-category caps (D-O5-1) when supplied; otherwise keep existing.
  const withCaps = cmd.capacities ? { ...existing, capacities: cmd.capacities } : existing;
  const opened = openDomain(withCaps);
  await d.windows.save(opened);
  await d.publisher.publish('RegistrationsOpened', { sportEventId: cmd.sportEventId }, cmd.organizationId);
  checkpoint('openWindow', 'STOP', { sportEventId: cmd.sportEventId });
};
