import { confirmRegistration as confirmDomain } from '../domain/registration.js';
import { registrationConfirmed } from '../domain/events.js';
import { checkpoint, type EventPublisher } from '@playfusion/platform-lib';
import type { RegistrationRepository } from '../ports/registration-repository.js';

type Deps = { repo: RegistrationRepository; publisher: EventPublisher };
export const onFeePaid = (d: Deps) => async (evt: { registrationId: string; organizationId: string }) => {
  checkpoint('onFeePaid', 'START', { registrationId: evt.registrationId });
  const existing = await d.repo.get(evt.registrationId);
  if (!existing || existing.status !== 'Applied') { checkpoint('onFeePaid', 'STOP', { skipped: true }); return; }
  const confirmed = confirmDomain(existing);
  await d.repo.save(confirmed);
  const ev = registrationConfirmed(confirmed);
  await d.publisher.publish(ev.name, ev.payload, evt.organizationId);
  checkpoint('onFeePaid', 'STOP', { registrationId: evt.registrationId, status: 'Confirmed' });
};
