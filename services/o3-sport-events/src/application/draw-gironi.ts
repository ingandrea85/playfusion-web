import { autoDraw, type CategoryGironi } from '../gironi.js';
import type { GironiRepository } from '../ports/gironi-repository.js';
import type { TeamSource } from '../ports/team-source.js';

export interface DrawGironiDeps { gironi: GironiRepository; teams: TeamSource }
export interface DrawGironiInput { sportEventId: string; categoria: string; groupsCount: number }

/** Auto-seed a category's gironi from its confirmed teams (round-robin split), replacing any
 *  existing composition — unless the category is locked, in which case it is a no-op that
 *  returns the current composition (mirrors the mockup's "sorteggia solo se non bloccata"). */
export function drawGironi(deps: DrawGironiDeps) {
  return async (input: DrawGironiInput): Promise<CategoryGironi> => {
    const current = (await deps.gironi.get(input.sportEventId))[input.categoria];
    if (current?.locked) return current;
    const byCat = await deps.teams.confirmedByCategory(input.sportEventId);
    const composition: CategoryGironi = { groups: autoDraw(byCat.get(input.categoria) ?? [], input.groupsCount), locked: false };
    await deps.gironi.putCategory(input.sportEventId, input.categoria, composition);
    return composition;
  };
}
