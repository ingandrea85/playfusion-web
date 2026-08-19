import { DomainError, checkpoint } from '@playfusion/platform-lib';
import type { RegistrationRepository } from '../ports/registration-repository.js';

// S14 — remove a PB-2 roster entry. Organizer-only (enforced at the HTTP boundary).
type Deps = { repo: RegistrationRepository };
type Cmd = { registrationId: string };

export const removeTeam = (d: Deps) => async (cmd: Cmd) => {
  checkpoint('removeTeam', 'START', { registrationId: cmd.registrationId });
  const existing = await d.repo.get(cmd.registrationId);
  if (!existing) throw new DomainError('NOT_FOUND', `registration ${cmd.registrationId} not found`, 404);
  await d.repo.deleteById(cmd.registrationId);
  checkpoint('removeTeam', 'STOP', { registrationId: cmd.registrationId });
  return existing;
};
