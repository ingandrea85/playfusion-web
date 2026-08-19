import { addTeam as addTeamDomain } from '../domain/registration.js';
import { registrationConfirmed } from '../domain/events.js';
import { DomainError, checkpoint, type EventPublisher } from '@playfusion/platform-lib';
import type { RegistrationRepository } from '../ports/registration-repository.js';

// S14 — PB-2 direct roster. The organizer adds a team by name, no invite flow: it is persisted
// Confirmed straight away. Authorization is enforced at the HTTP boundary (requireOrganizer).
// Publishes RegistrationConfirmed so downstream stays consistent with the PB-1 confirm path.
type Deps = { repo: RegistrationRepository; publisher: EventPublisher };
type Cmd = { registrationId: string; participantRef: string; sportEventId: string; categoria: string; teamName: string; organizationId: string };

export const addTeam = (d: Deps) => async (cmd: Cmd) => {
  checkpoint('addTeam', 'START', { registrationId: cmd.registrationId });
  const name = cmd.teamName.trim();
  if (!name) throw new DomainError('INVALID_TEAM', 'teamName is required', 422);
  // A roster name is unique within an event's category (case-insensitive).
  const dup = (await d.repo.findByEvent(cmd.sportEventId)).some(
    (r) => r.categoria === cmd.categoria && r.teamName?.trim().toLowerCase() === name.toLowerCase());
  if (dup) throw new DomainError('DUPLICATE_TEAM', `team "${name}" already in ${cmd.categoria}`, 409);
  const reg = addTeamDomain({ ...cmd, teamName: name });
  await d.repo.save(reg);
  const ev = registrationConfirmed(reg);
  await d.publisher.publish(ev.name, ev.payload, cmd.organizationId);
  checkpoint('addTeam', 'STOP', { registrationId: reg.registrationId, status: reg.status });
  return reg;
};
