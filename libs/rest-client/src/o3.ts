import { request, type HttpConfig } from './http.js'
import type { EventSummary, EventDetail, CreateEventInput, CreateEventResult } from './types.js'

export interface O3Api {
  listEvents(): Promise<EventSummary[]>
  getEvent(id: string): Promise<EventDetail>
  createEvent(input: CreateEventInput): Promise<CreateEventResult>
}
export const o3 = (cfg: HttpConfig): O3Api => ({
  listEvents: () => request(cfg, 'GET', '/o3/events'),
  getEvent: (id) => request(cfg, 'GET', `/o3/events/${encodeURIComponent(id)}`),
  createEvent: (input) => request(cfg, 'POST', '/o3/events', input),
})
