import { request, type HttpConfig } from './http.js'
import type { ScheduleConfig, ScheduleView, ScheduledMatchView } from './types.js'

export interface O7Api {
  getSchedule(eventId: string): Promise<ScheduleView>
  getMatches(eventId: string): Promise<ScheduledMatchView[]>
  generateSchedule(eventId: string, config: ScheduleConfig): Promise<ScheduleView>
  approveSchedule(eventId: string): Promise<ScheduleView>
  publishSchedule(eventId: string): Promise<ScheduleView>
  rescheduleMatch(eventId: string, matchId: string, patch: { day: string; time: string; field: string }): Promise<ScheduledMatchView>
}
export const o7 = (cfg: HttpConfig): O7Api => ({
  getSchedule: (id) => request(cfg, 'GET', `/o7/events/${encodeURIComponent(id)}/schedule`),
  getMatches: (id) => request(cfg, 'GET', `/o7/events/${encodeURIComponent(id)}/matches`),
  generateSchedule: (id, config) => request(cfg, 'POST', `/o7/events/${encodeURIComponent(id)}/schedule:generate`, config),
  approveSchedule: (id) => request(cfg, 'POST', `/o7/events/${encodeURIComponent(id)}/schedule:approve`),
  publishSchedule: (id) => request(cfg, 'POST', `/o7/events/${encodeURIComponent(id)}/schedule:publish`),
  rescheduleMatch: (id, matchId, patch) => request(cfg, 'PUT', `/o7/events/${encodeURIComponent(id)}/matches/${encodeURIComponent(matchId)}`, patch),
})
