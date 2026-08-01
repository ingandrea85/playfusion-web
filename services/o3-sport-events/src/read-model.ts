import type { EventReadStore } from './ports/event-read-store.js';
import type { SportEvent } from './domain.js';

/** List rows feed the E1 dashboard and E3 landing; the org id is an internal
 *  denormalisation and is not part of the read contract, so it is dropped. */
export type EventSummary = Omit<SportEvent, 'organizationId'>;
export type EventDetail = Omit<SportEvent, 'organizationId'>;

const strip = ({ organizationId, ...rest }: SportEvent): EventDetail => rest;

export const listEvents = (store: EventReadStore) => async (organizationId: string): Promise<EventSummary[]> =>
  (await store.listByOrg(organizationId)).map(strip);

export const getEvent = (store: EventReadStore) => async (sportEventId: string): Promise<EventDetail | undefined> => {
  const event = await store.get(sportEventId);
  return event ? strip(event) : undefined;
};
