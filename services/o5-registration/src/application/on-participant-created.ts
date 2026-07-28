import { checkpoint } from '@playfusion/platform-lib';
import type { ParticipantDirectory } from '../ports/participant-directory.js';
export const onParticipantCreated = (d: { participants: ParticipantDirectory }) => async (evt: { participantId: string }) => {
  checkpoint('onParticipantCreated', 'START', { participantId: evt.participantId });
  await d.participants.add(evt.participantId);
  checkpoint('onParticipantCreated', 'STOP', { participantId: evt.participantId });
};
