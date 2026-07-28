export type WindowState = 'Closed' | 'Open';
export type RegistrationWindow = { sportEventId: string; state: WindowState };

export function openWindow(w: RegistrationWindow): RegistrationWindow { return { ...w, state: 'Open' }; }
export function closeWindow(w: RegistrationWindow): RegistrationWindow { return { ...w, state: 'Closed' }; }
export function isOpen(w: RegistrationWindow): boolean { return w.state === 'Open'; }
