import type { RegistrationRequest } from './registration.js';

export const registrationApplied = (r: RegistrationRequest) => ({
  name: 'RegistrationApplied' as const,
  payload: { registrationId: r.registrationId, participantRef: r.participantRef, sportEventId: r.sportEventId, categoria: r.categoria },
});
export const registrationConfirmed = (r: RegistrationRequest) => ({
  name: 'RegistrationConfirmed' as const,
  payload: { registrationId: r.registrationId, participantRef: r.participantRef, sportEventId: r.sportEventId, categoria: r.categoria },
});
export const registrationRejected = (r: RegistrationRequest, reason: string) => ({
  name: 'RegistrationRejected' as const,
  payload: { registrationId: r.registrationId, participantRef: r.participantRef, reason },
});
