import { request, type HttpConfig } from './http.js'
import type { EventSummary, EventDetail, CreateEventInput, CreateEventResult, CategoryGironi, GironiMap, Group, FinalsConfigInput } from './types.js'

export interface O3Api {
  listEvents(): Promise<EventSummary[]>
  getEvent(id: string): Promise<EventDetail>
  createEvent(input: CreateEventInput): Promise<CreateEventResult>
  // S8 gironi (O6 composition on the event)
  getGironi(id: string): Promise<GironiMap>
  drawGironi(id: string, categoria: string, groupsCount: number): Promise<CategoryGironi>
  saveGironi(id: string, categoria: string, groups: Group[], locked: boolean): Promise<CategoryGironi>
  // S12: finals config (O6, Competizione editor)
  updateFinalsConfig(id: string, config: FinalsConfigInput): Promise<FinalsConfigInput>
}
export const o3 = (cfg: HttpConfig): O3Api => ({
  listEvents: () => request(cfg, 'GET', '/o3/events'),
  getEvent: (id) => request(cfg, 'GET', `/o3/events/${encodeURIComponent(id)}`),
  createEvent: (input) => request(cfg, 'POST', '/o3/events', input),
  getGironi: (id) => request(cfg, 'GET', `/o3/events/${encodeURIComponent(id)}/gironi`),
  drawGironi: (id, categoria, groupsCount) => request(cfg, 'POST', `/o3/events/${encodeURIComponent(id)}/gironi:draw`, { categoria, groupsCount }),
  saveGironi: (id, categoria, groups, locked) => request(cfg, 'PUT', `/o3/events/${encodeURIComponent(id)}/gironi/${encodeURIComponent(categoria)}`, { groups, locked }),
  updateFinalsConfig: (id, config) => request(cfg, 'PUT', `/o3/events/${encodeURIComponent(id)}/finals-config`, config),
})
