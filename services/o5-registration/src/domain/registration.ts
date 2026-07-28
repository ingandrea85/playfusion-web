import { RegistrationAlreadyResolvedError } from './errors.js';

export type RegistrationStatus = 'Applied' | 'Confirmed' | 'Rejected';
export type RegistrationRequest = {
  registrationId: string;
  participantRef: string;
  sportEventId: string;
  categoria: string;
  status: RegistrationStatus;
};
type ApplyInput = Omit<RegistrationRequest, 'status'>;

export function applyRegistration(input: ApplyInput): RegistrationRequest {
  return { ...input, status: 'Applied' };
}
export function confirmRegistration(reg: RegistrationRequest): RegistrationRequest {
  if (reg.status !== 'Applied') throw new RegistrationAlreadyResolvedError(reg.registrationId);
  return { ...reg, status: 'Confirmed' };
}
export function rejectRegistration(reg: RegistrationRequest, _reason: string): RegistrationRequest {
  if (reg.status !== 'Applied') throw new RegistrationAlreadyResolvedError(reg.registrationId);
  return { ...reg, status: 'Rejected' };
}
