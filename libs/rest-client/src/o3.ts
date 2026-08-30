import { request, type HttpConfig } from './http.js'
import type { EventSummary, EventDetail, CreateEventInput, CreateEventResult, CategoryGironi, GironiMap, Group, EventSite, SportProfile, SportProfileInput } from './types.js'

export interface O3Api {
  listEvents(): Promise<EventSummary[]>
  getEvent(id: string): Promise<EventDetail>
  createEvent(input: CreateEventInput): Promise<CreateEventResult>
  // Epic #143 — global sport catalog. list/get public; admin CRUD platform_admin.
  listSports(): Promise<SportProfile[]>
  getSport(id: string): Promise<SportProfile>
  adminCreateSport(input: SportProfileInput): Promise<SportProfile>
  adminUpdateSport(id: string, input: SportProfileInput): Promise<SportProfile>
  adminDeleteSport(id: string): Promise<void>
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
  listSports: () => request(cfg, 'GET', '/o3/sports'),
  getSport: (id) => request(cfg, 'GET', `/o3/sports/${encodeURIComponent(id)}`),
  adminCreateSport: (input) => request(cfg, 'POST', '/o3/admin/sports', input),
  adminUpdateSport: (id, input) => request(cfg, 'PUT', `/o3/admin/sports/${encodeURIComponent(id)}`, input),
  adminDeleteSport: (id) => request(cfg, 'DELETE', `/o3/admin/sports/${encodeURIComponent(id)}`),
  getGironi: (id) => request(cfg, 'GET', `/o3/events/${encodeURIComponent(id)}/gironi`),
  drawGironi: (id, categoria, groupsCount) => request(cfg, 'POST', `/o3/events/${encodeURIComponent(id)}/gironi:draw`, { categoria, groupsCount }),
  saveGironi: (id, categoria, groups, locked) => request(cfg, 'PUT', `/o3/events/${encodeURIComponent(id)}/gironi/${encodeURIComponent(categoria)}`, { groups, locked }),
})
