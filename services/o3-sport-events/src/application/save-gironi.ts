import type { CategoryGironi, GironiMap, Group } from '../gironi.js';
import type { GironiRepository } from '../ports/gironi-repository.js';

export interface SaveGironiInput { sportEventId: string; categoria: string; groups: Group[]; locked: boolean }

/** Persist a category's composition — the write behind both "move team" and "lock". The editor
 *  disables moves while locked and sends the full arrangement, so this is a plain overwrite. */
export function saveGironi(gironi: GironiRepository) {
  return async (input: SaveGironiInput): Promise<CategoryGironi> => {
    const composition: CategoryGironi = { groups: input.groups, locked: input.locked };
    await gironi.putCategory(input.sportEventId, input.categoria, composition);
    return composition;
  };
}

export function getGironi(gironi: GironiRepository) {
  return async (sportEventId: string): Promise<GironiMap> => gironi.get(sportEventId);
}
