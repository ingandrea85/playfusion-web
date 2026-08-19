import { RegistrationAlreadyResolvedError } from './errors.js';

export type RegistrationStatus = 'Applied' | 'Confirmed' | 'Rejected';
export type RegistrationRequest = {
  registrationId: string;
  participantRef: string;
  sportEventId: string;
  categoria: string;
  status: RegistrationStatus;
  /** S14 (PB-2 direct roster): the real team name the organizer typed. When set it is the label
   *  used downstream (gironi / calendar / standings / finals); absent ⇒ PB-1 (participantRef). */
  teamName?: string;
};
type ApplyInput = Omit<RegistrationRequest, 'status' | 'teamName'>;

export function applyRegistration(input: ApplyInput): RegistrationRequest {
  return { ...input, status: 'Applied' };
}

/** S14: a PB-2 team added directly by the organizer — no invite flow, born Confirmed with a name. */
type AddTeamInput = Omit<RegistrationRequest, 'status'> & { teamName: string };
export function addTeam(input: AddTeamInput): RegistrationRequest {
  return { ...input, status: 'Confirmed' };
}
export function confirmRegistration(reg: RegistrationRequest): RegistrationRequest {
  if (reg.status !== 'Applied') throw new RegistrationAlreadyResolvedError(reg.registrationId);
  return { ...reg, status: 'Confirmed' };
}
export function rejectRegistration(reg: RegistrationRequest, _reason: string): RegistrationRequest {
  if (reg.status !== 'Applied') throw new RegistrationAlreadyResolvedError(reg.registrationId);
  return { ...reg, status: 'Rejected' };
}
