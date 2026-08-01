export type EventStatus = 'Published';

/** A published sport event. `organizationId` is denormalised onto the item at write
 *  time (S1.1) so list-per-org is a single-BC GSI query. */
export interface SportEvent {
  sportEventId: string;
  organizationId: string;
  sport: string;
  categorie: string[];
  dates: { from: string; to: string };
  status: EventStatus;
}
