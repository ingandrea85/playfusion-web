import { request, type HttpConfig } from './http.js'
import type { RegistrationStatus, RegistrationView, ApplyRegistrationInput, RegistrationWindowView } from './types.js'

export interface O5Api {
  listRegistrations(eventId: string, state?: RegistrationStatus): Promise<RegistrationView[]>
  getRegistrationWindow(eventId: string): Promise<RegistrationWindowView>
  applyRegistration(input: ApplyRegistrationInput): Promise<RegistrationView>
  confirmRegistration(id: string): Promise<RegistrationView>
  rejectRegistration(id: string, reason: string): Promise<RegistrationView>
  openRegistrationWindow(eventId: string, capacities?: Record<string, number>): Promise<{ sportEventId: string; state: string; enrollToken?: string }>
  getEnrollToken(eventId: string): Promise<{ enrollToken?: string }>
}
export const o5 = (cfg: HttpConfig): O5Api => ({
  listRegistrations: (eventId, state) =>
    request(cfg, 'GET', `/o5/events/${encodeURIComponent(eventId)}/registrations${state ? `?state=${encodeURIComponent(state)}` : ''}`),
  getRegistrationWindow: (eventId) =>
    request(cfg, 'GET', `/o5/events/${encodeURIComponent(eventId)}/registration-window`),
  applyRegistration: (input) => request(cfg, 'POST', '/o5/registrations', input),
  confirmRegistration: (id) => request(cfg, 'POST', `/o5/registrations/${encodeURIComponent(id)}/confirm`),
  rejectRegistration: (id, reason) => request(cfg, 'POST', `/o5/registrations/${encodeURIComponent(id)}/reject`, { reason }),
  openRegistrationWindow: (eventId, capacities) =>
    request(cfg, 'POST', `/o5/events/${encodeURIComponent(eventId)}/registration-window:open`, capacities ? { capacities } : {}),
  getEnrollToken: (eventId) =>
    request(cfg, 'GET', `/o5/events/${encodeURIComponent(eventId)}/enroll-token`),
})
