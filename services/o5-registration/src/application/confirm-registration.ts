import { confirmRegistration as confirmDomain } from '../domain/registration.js';
import { registrationConfirmed } from '../domain/events.js';
import { NotAuthorizedError } from '../domain/errors.js';
import { DomainError, checkpoint, type EventPublisher } from '@playfusion/platform-lib';
import type { RegistrationRepository } from '../ports/registration-repository.js';
import type { Authorizer } from '../ports/authorizer.js';

type Deps = { repo: RegistrationRepository; publisher: EventPublisher; authorizer: Authorizer };
type Cmd = { registrationId: string; approverToken: string; organizationId: string };

export const confirmRegistration = (d: Deps) => async (cmd: Cmd) => {
  checkpoint('confirmRegistration', 'START', { registrationId: cmd.registrationId });
  if (!(await d.authorizer.hasRegistrationManagerRole(cmd.approverToken))) throw new NotAuthorizedError();
  const existing = await d.repo.get(cmd.registrationId);
  if (!existing) throw new DomainError('NOT_FOUND', `registration ${cmd.registrationId} not found`, 404);
  const confirmed = confirmDomain(existing);
  await d.repo.save(confirmed);
  const ev = registrationConfirmed(confirmed);
  await d.publisher.publish(ev.name, ev.payload, cmd.organizationId);
  checkpoint('confirmRegistration', 'STOP', { registrationId: confirmed.registrationId, status: confirmed.status });
  return confirmed;
};
