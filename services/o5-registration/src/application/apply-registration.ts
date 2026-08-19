import { applyRegistration as applyDomain } from '../domain/registration.js';
import { registrationApplied } from '../domain/events.js';
import { isOpen } from '../domain/registration-window.js';
import { WindowClosedError, DoubleApplyError } from '../domain/errors.js';
import { checkpoint, type EventPublisher } from '@playfusion/platform-lib';
import type { RegistrationRepository } from '../ports/registration-repository.js';
import type { WindowRepository } from '../ports/window-repository.js';
import type { ParticipantDirectory } from '../ports/participant-directory.js';

type Deps = { repo: RegistrationRepository; windows: WindowRepository; participants: ParticipantDirectory; publisher: EventPublisher };
type Cmd = { registrationId: string; participantRef: string; sportEventId: string; categoria: string; organizationId: string };

export const applyRegistration = (d: Deps) => async (cmd: Cmd) => {
  checkpoint('applyRegistration', 'START', { registrationId: cmd.registrationId });
  const window = await d.windows.get(cmd.sportEventId);
  if (!window || !isOpen(window)) throw new WindowClosedError(cmd.sportEventId);
  // Coach self-enrollment: a team the organizer never pre-registered is registered on the
  // fly (the participantRef is the team's own label — S7). The enrollment-link token gate +
  // the organizer's confirm/reject remain the guardrails; the double-apply check still bites.
  if (!(await d.participants.exists(cmd.participantRef))) await d.participants.add(cmd.participantRef);
  if (await d.repo.findByParticipantAndEvent(cmd.participantRef, cmd.sportEventId)) throw new DoubleApplyError(cmd.participantRef);
  const reg = applyDomain(cmd);
  await d.repo.save(reg);
  const ev = registrationApplied(reg);
  await d.publisher.publish(ev.name, ev.payload, cmd.organizationId);
  checkpoint('applyRegistration', 'STOP', { registrationId: reg.registrationId, status: reg.status });
  return reg;
};
