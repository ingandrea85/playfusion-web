import type { RegistrationWindow } from '../domain/registration-window.js';
export interface WindowRepository {
  get(sportEventId: string): Promise<RegistrationWindow | undefined>;
  save(w: RegistrationWindow): Promise<void>;
}
