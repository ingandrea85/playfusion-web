export type EventStatus = 'Published';

/** Playbook / workflow the event follows: PB-1 = enrollment-with-invites, PB-2 = direct roster (S14). */
export type Playbook = 'PB-1' | 'PB-2';

/** Tie-break criteria applied after points (points always rank first). */
export type TieBreakCriterion = 'HEAD_TO_HEAD' | 'GOAL_DIFFERENCE' | 'GOALS_FOR';


/** A published sport event. `organizationId` is denormalised onto the item at write
 *  time (S1.1) so list-per-org is a single-BC GSI query.
 *
 *  S6 adds the competition config additively: `dates.from`/`dates.to` remain start/end
 *  date (6 existing consumers read them), and `name`/`location`/`startTime`/`tieBreak`
 *  are optional so pre-S6 events stay valid. `playbook` is optional on the stored item
 *  (pre-S6 rows lack it) but the read model defaults it to PB-1 so readers always see one. */
export interface SportEvent {
  sportEventId: string;
  organizationId: string;
  sport: string;
  categorie: string[];
  dates: { from: string; to: string };
  status: EventStatus;
  name?: string;
  location?: string;
  startTime?: string;
  tieBreak?: TieBreakCriterion[];
  playbook?: Playbook;
  /** S8: per-category group composition (O6). Optional; absent on pre-S8 events. */
  gironi?: import('./gironi.js').GironiMap;
  // Finals format moved to the o7 ScheduleConfig (per-category, edited in the Calendario tab) — it is
  // no longer part of the event.
}
