import { request, type HttpConfig } from './http.js'
import type { EventSummary, EventDetail, CreateEventInput, CreateEventResult, CategoryGironi, GironiMap, Group, EventSite } from './types.js'

export interface O3Api {
  listEvents(): Promise<EventSummary[]>
  getEvent(id: string): Promise<EventDetail>
  createEvent(input: CreateEventInput): Promise<CreateEventResult>
  /** Event Site — per-event overrides. Owner-only. */
  setEventSite(id: string, site: EventSite): Promise<EventSite>
  /** S21 admin (platform_admin) — events of any org, cross-tenant. */
  adminOrgEvents(organizationId: string): Promise<EventSummary[]>
  // S8 gironi (O6 composition on the event)
  getGironi(id: string): Promise<GironiMap>
  drawGironi(id: string, categoria: string, groupsCount: number): Promise<CategoryGironi>
  saveGironi(id: string, categoria: string, groups: Group[], locked: boolean): Promise<CategoryGironi>
}
export const o3 = (cfg: HttpConfig): O3Api => ({
  listEvents: () => request(cfg, 'GET', '/o3/events'),
  getEvent: (id) => request(cfg, 'GET', `/o3/events/${encodeURIComponent(id)}`),
  createEvent: (input) => request(cfg, 'POST', '/o3/events', input),
  setEventSite: (id, site) => request(cfg, 'PUT', `/o3/events/${encodeURIComponent(id)}/site`, site),
  adminOrgEvents: (orgId) => request(cfg, 'GET', `/o3/admin/organizations/${encodeURIComponent(orgId)}/events`),
  getGironi: (id) => request(cfg, 'GET', `/o3/events/${encodeURIComponent(id)}/gironi`),
  drawGironi: (id, categoria, groupsCount) => request(cfg, 'POST', `/o3/events/${encodeURIComponent(id)}/gironi:draw`, { categoria, groupsCount }),
  saveGironi: (id, categoria, groups, locked) => request(cfg, 'PUT', `/o3/events/${encodeURIComponent(id)}/gironi/${encodeURIComponent(categoria)}`, { groups, locked }),
})
