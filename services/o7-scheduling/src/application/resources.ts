import { computeResourcePlan, type ResourceConfig, type ResourcePlan } from '../resources.js';
import { defaultConfig } from '../domain.js';
import type { CheckoffRepository, MatchRepository, ResourceRepository, ScheduleRepository, TeamSource } from '../ports.js';

const EMPTY: ResourceConfig = { resources: [], teamSizes: {}, assignments: [] };

/** S17 — the event's resource config (default: empty). */
export function getResources(resources: ResourceRepository) {
  return async (sportEventId: string): Promise<ResourceConfig> => (await resources.get(sportEventId)) ?? EMPTY;
}

/** S17 — replace the whole resource config (resources + team sizes + manual assignments). */
export function saveResources(resources: ResourceRepository) {
  return async (sportEventId: string, config: ResourceConfig): Promise<ResourceConfig> => {
    await resources.save(sportEventId, config);
    return config;
  };
}

export interface ResourcePlanDeps {
  resources: ResourceRepository;
  matches: MatchRepository;
  schedules: ScheduleRepository;
  teams: TeamSource;
  checkoffs: CheckoffRepository;
}

/** S17 — the derived logistics plan (days, team sizes, per resource×day slots), computed on read from
 *  the schedule (finish times), the config (slot minutes), the confirmed teams (o5), the resources and
 *  (B5) the recorded check-offs (actual completion overrides / free-node served flags). */
export function getResourcePlan(deps: ResourcePlanDeps) {
  return async (sportEventId: string): Promise<ResourcePlan> => {
    const [rc, matches, schedule, teamsByCat, checkoffs] = await Promise.all([
      getResources(deps.resources)(sportEventId),
      deps.matches.list(sportEventId),
      deps.schedules.get(sportEventId),
      deps.teams.confirmedByCategory(sportEventId),
      deps.checkoffs.list(sportEventId),
    ]);
    return computeResourcePlan(matches, schedule?.config ?? defaultConfig(), rc, teamsByCat, checkoffs);
  };
}
