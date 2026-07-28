import { rejectRegistration as rejectDomain } from '../domain/registration.js';
import { registrationRejected } from '../domain/events.js';
import { NotAuthorizedError } from '../domain/errors.js';
import { DomainError, checkpoint, type EventPublisher } from '@playfusion/platform-lib';
import type { RegistrationRepository } from '../ports/registration-repository.js';
import type { Authorizer } from '../ports/authorizer.js';

type Deps = { repo: RegistrationRepository; publisher: EventPublisher; authorizer: Authorizer };
type Cmd = { registrationId: string; reason: string; approverToken: string; organizationId: string };

export const rejectRegistration = (d: Deps) => async (cmd: Cmd) => {
  checkpoint('rejectRegistration', 'START', { registrationId: cmd.registrationId });
  if (!(await d.authorizer.hasRegistrationManagerRole(cmd.approverToken))) throw new NotAuthorizedError();
  const existing = await d.repo.get(cmd.registrationId);
  if (!existing) throw new DomainError('NOT_FOUND', `registration ${cmd.registrationId} not found`, 404);
  const rejected = rejectDomain(existing, cmd.reason);
  await d.repo.save(rejected);
  const ev = registrationRejected(rejected, cmd.reason);
  await d.publisher.publish(ev.name, ev.payload, cmd.organizationId);
  checkpoint('rejectRegistration', 'STOP', { registrationId: rejected.registrationId });
  return rejected;
};
