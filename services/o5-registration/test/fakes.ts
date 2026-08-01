import type { RegistrationRepository } from '../src/ports/registration-repository.js';
import type { WindowRepository } from '../src/ports/window-repository.js';
import type { ParticipantDirectory } from '../src/ports/participant-directory.js';
import type { RegistrationRequest } from '../src/domain/registration.js';
import type { RegistrationWindow } from '../src/domain/registration-window.js';

export class InMemoryRegistrationRepository implements RegistrationRepository {
  private byId = new Map<string, RegistrationRequest>();
  async save(r: RegistrationRequest) { this.byId.set(r.registrationId, r); }
  async get(id: string) { return this.byId.get(id); }
  async findByParticipantAndEvent(p: string, e: string) {
    return [...this.byId.values()].find(r => r.participantRef === p && r.sportEventId === e);
  }
  async findByEvent(e: string, state?: RegistrationRequest['status']) {
    return [...this.byId.values()].filter(r => r.sportEventId === e && (!state || r.status === state));
  }
}
export class InMemoryWindowRepository implements WindowRepository {
  private byEvent = new Map<string, RegistrationWindow>();
  async get(e: string) { return this.byEvent.get(e); }
  async save(w: RegistrationWindow) { this.byEvent.set(w.sportEventId, w); }
}
export class InMemoryParticipantDirectory implements ParticipantDirectory {
  private set = new Set<string>();
  async exists(p: string) { return this.set.has(p); }
  async add(p: string) { this.set.add(p); }
}
