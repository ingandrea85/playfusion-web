import type { CategoryGironi, GironiMap } from '../gironi.js';

/** Persistence seam for the gironi composition, which lives on the o3 event item.
 *  `putCategory` is a read-modify-write of the event's `gironi` map for one category. */
export interface GironiRepository {
  get(sportEventId: string): Promise<GironiMap>;
  putCategory(sportEventId: string, categoria: string, gironi: CategoryGironi): Promise<void>;
}
