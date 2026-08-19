import { openWindow as openDomain, type RegistrationWindow } from '../domain/registration-window.js';
import { checkpoint, signMagicLink, type EventPublisher } from '@playfusion/platform-lib';
import type { WindowRepository } from '../ports/window-repository.js';

// The shared coach enrollment link should outlast a typical enrollment period.
const ENROLL_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

type Deps = { windows: WindowRepository; publisher: EventPublisher };
export const openWindow = (d: Deps) => async (cmd: { sportEventId: string; organizationId: string; capacities?: Record<string, number> }): Promise<RegistrationWindow> => {
  checkpoint('openWindow', 'START', { sportEventId: cmd.sportEventId });
  const existing = (await d.windows.get(cmd.sportEventId)) ?? { sportEventId: cmd.sportEventId, state: 'Closed' as const };
  // Capture the per-category caps (D-O5-1) when supplied; otherwise keep existing.
  const withCaps = cmd.capacities ? { ...existing, capacities: cmd.capacities } : existing;
  // Mint the coach enrollment token once (keep it stable across re-opens). The organizer
  // distributes the resulting link; requireMagicLink verifies it on apply (ADR-002 shared kernel).
  const withToken: RegistrationWindow = withCaps.enrollToken
    ? withCaps
    : { ...withCaps, enrollToken: signMagicLink({ subject: `enroll:${cmd.sportEventId}`, roles: ['coach'], purpose: 'coach-enrollment', ttlSeconds: ENROLL_TTL_SECONDS }) };
  const opened = openDomain(withToken);
  await d.windows.save(opened);
  await d.publisher.publish('RegistrationsOpened', { sportEventId: cmd.sportEventId }, cmd.organizationId);
  checkpoint('openWindow', 'STOP', { sportEventId: cmd.sportEventId });
  return opened;
};
