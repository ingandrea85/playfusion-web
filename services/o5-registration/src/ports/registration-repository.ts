import type { RegistrationRequest } from '../domain/registration.js';
export interface RegistrationRepository {
  save(r: RegistrationRequest): Promise<void>;
  get(id: string): Promise<RegistrationRequest | undefined>;
  findByParticipantAndEvent(participantRef: string, sportEventId: string): Promise<RegistrationRequest | undefined>;
}
