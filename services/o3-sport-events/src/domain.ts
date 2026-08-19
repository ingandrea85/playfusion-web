export type EventStatus = 'Published';

/** Playbook / workflow the event follows: PB-1 = enrollment-with-invites, PB-2 = direct roster (S14). */
export type Playbook = 'PB-1' | 'PB-2';

/** Tie-break criteria applied after points (points always rank first). */
export type TieBreakCriterion = 'HEAD_TO_HEAD' | 'GOAL_DIFFERENCE' | 'GOALS_FOR';

/** S12: how the finals bracket is drawn from the group qualifiers.
 *  SINGLE_GROUP_CROSSOVER = one group's top-N cross (1-4/2-3); SPLIT_GROUP_FINALS = one bracket per
 *  position across groups (Oro/Argento/…); PLACEMENT = per-position placement finals. */
export type FinalsType = 'SINGLE_GROUP_CROSSOVER' | 'SPLIT_GROUP_FINALS' | 'PLACEMENT';

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
  /** S12: finals config (O6). `finalsType` absent ⇒ no finals bracket generated;
   *  `qualifiersPerGroup` defaults to 2 in the read model. */
  finalsType?: FinalsType;
  qualifiersPerGroup?: number;
}
