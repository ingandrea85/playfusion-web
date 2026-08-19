import { request, type HttpConfig } from './http.js'
import type { GroupStanding, ScheduleConfig, ScheduleView, ScheduledMatchView } from './types.js'

export interface O7Api {
  getSchedule(eventId: string): Promise<ScheduleView>
  getMatches(eventId: string): Promise<ScheduledMatchView[]>
  generateSchedule(eventId: string, config: ScheduleConfig): Promise<ScheduleView>
  approveSchedule(eventId: string): Promise<ScheduleView>
  publishSchedule(eventId: string): Promise<ScheduleView>
  rescheduleMatch(eventId: string, matchId: string, patch: { day: string; time: string; field: string; home?: string; away?: string }): Promise<ScheduledMatchView>
  recordResult(eventId: string, matchId: string, result: { homeScore: number; awayScore: number }): Promise<ScheduledMatchView>
  getStandings(eventId: string): Promise<GroupStanding[]>
  // S11: manually resolve a group's residual tie (organizer). `order` is the tied teams' decided order.
  setTieOverride(eventId: string, categoryId: string, groupLabel: string, order: string[]): Promise<{ order: string[]; resolvedBy: string; resolvedAt: string }>
  getDirectorToken(eventId: string, field: string): Promise<{ field: string; token: string }>
  // S26: match lifecycle transitions.
  startMatch(eventId: string, matchId: string): Promise<ScheduledMatchView>
  finishMatch(eventId: string, matchId: string): Promise<ScheduledMatchView>
  cancelMatch(eventId: string, matchId: string): Promise<ScheduledMatchView>
  // Decree which side advances when a knockout (FINAL) match ends level.
  decideWinner(eventId: string, matchId: string, winner: 'HOME' | 'AWAY'): Promise<ScheduledMatchView>
}
export const o7 = (cfg: HttpConfig): O7Api => ({
  getSchedule: (id) => request(cfg, 'GET', `/o7/events/${encodeURIComponent(id)}/schedule`),
  getMatches: (id) => request(cfg, 'GET', `/o7/events/${encodeURIComponent(id)}/matches`),
  generateSchedule: (id, config) => request(cfg, 'POST', `/o7/events/${encodeURIComponent(id)}/schedule:generate`, config),
  approveSchedule: (id) => request(cfg, 'POST', `/o7/events/${encodeURIComponent(id)}/schedule:approve`),
  publishSchedule: (id) => request(cfg, 'POST', `/o7/events/${encodeURIComponent(id)}/schedule:publish`),
  rescheduleMatch: (id, matchId, patch) => request(cfg, 'PUT', `/o7/events/${encodeURIComponent(id)}/matches/${encodeURIComponent(matchId)}`, patch),
  recordResult: (id, matchId, result) => request(cfg, 'POST', `/o7/events/${encodeURIComponent(id)}/matches/${encodeURIComponent(matchId)}/result`, result),
  getStandings: (id) => request(cfg, 'GET', `/o7/events/${encodeURIComponent(id)}/standings`),
  setTieOverride: (id, categoryId, groupLabel, order) => request(cfg, 'PUT', `/o7/events/${encodeURIComponent(id)}/standings/${encodeURIComponent(categoryId)}/${encodeURIComponent(groupLabel)}/override`, { order }),
  getDirectorToken: (id, field) => request(cfg, 'POST', `/o7/events/${encodeURIComponent(id)}/director-token`, { field }),
  startMatch: (id, matchId) => request(cfg, 'POST', `/o7/events/${encodeURIComponent(id)}/matches/${encodeURIComponent(matchId)}/start`),
  finishMatch: (id, matchId) => request(cfg, 'POST', `/o7/events/${encodeURIComponent(id)}/matches/${encodeURIComponent(matchId)}/finish`),
  cancelMatch: (id, matchId) => request(cfg, 'POST', `/o7/events/${encodeURIComponent(id)}/matches/${encodeURIComponent(matchId)}/cancel`),
  decideWinner: (id, matchId, winner) => request(cfg, 'POST', `/o7/events/${encodeURIComponent(id)}/matches/${encodeURIComponent(matchId)}/decide-winner`, { winner }),
})
