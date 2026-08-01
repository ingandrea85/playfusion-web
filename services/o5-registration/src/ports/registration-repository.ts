import type { RegistrationRequest, RegistrationStatus } from '../domain/registration.js';
export interface RegistrationRepository {
  save(r: RegistrationRequest): Promise<void>;
  get(id: string): Promise<RegistrationRequest | undefined>;
  findByParticipantAndEvent(participantRef: string, sportEventId: string): Promise<RegistrationRequest | undefined>;
  /** All registrations for an event, optionally filtered by state (S1.3/S1.4). */
  findByEvent(sportEventId: string, state?: RegistrationStatus): Promise<RegistrationRequest[]>;
}
