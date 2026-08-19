import { defaultConfig, type GroupStanding, type Schedule, type ScheduledMatch } from '../domain.js';
import { computeStandings } from '../standings.js';
import type { MatchRepository, ScheduleRepository } from '../ports.js';

/** Read the schedule for an event. Events that were never scheduled read as a NONE
 *  schedule with the default config, so the organizer screen always has a config to
 *  edit and the public gate ("only when PUBLISHED") is a plain status check. */
export function getScheduleOrDefault(schedules: ScheduleRepository) {
  return async (sportEventId: string, organizationId = ''): Promise<Schedule> =>
    (await schedules.get(sportEventId)) ?? { sportEventId, organizationId, status: 'NONE', config: defaultConfig() };
}

export function listMatches(matches: MatchRepository) {
  return async (sportEventId: string): Promise<ScheduledMatch[]> => matches.list(sportEventId);
}

/** S10: standings computed live from the event's stored match results. */
export function listStandings(matches: MatchRepository) {
  return async (sportEventId: string): Promise<GroupStanding[]> => computeStandings(await matches.list(sportEventId));
}
