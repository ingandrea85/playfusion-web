export type WindowState = 'Closed' | 'Open';
/** `capacities` holds the per-category registration cap (D-O5-1), denormalised into
 *  O5 when registrations are opened so capacity reads stay single-BC (S1.1/S1.4). */
export type RegistrationWindow = { sportEventId: string; state: WindowState; capacities?: Record<string, number> };

export function openWindow(w: RegistrationWindow): RegistrationWindow { return { ...w, state: 'Open' }; }
export function closeWindow(w: RegistrationWindow): RegistrationWindow { return { ...w, state: 'Closed' }; }
export function isOpen(w: RegistrationWindow): boolean { return w.state === 'Open'; }
