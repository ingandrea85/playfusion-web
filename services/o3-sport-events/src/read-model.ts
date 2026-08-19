import type { EventReadStore } from './ports/event-read-store.js';
import type { SportEvent, Playbook } from './domain.js';

/** List rows feed the E1 dashboard and E3 landing; the org id is an internal
 *  denormalisation and is not part of the read contract, so it is dropped.
 *  `playbook` is always present in the read contract (defaulted for pre-S6 rows). */
export type EventSummary = Omit<SportEvent, 'organizationId' | 'playbook'> & { playbook: Playbook };
export type EventDetail = EventSummary;

const strip = ({ organizationId, playbook, ...rest }: SportEvent): EventDetail =>
  ({ ...rest, playbook: playbook ?? 'PB-1' });

export const listEvents = (store: EventReadStore) => async (organizationId: string): Promise<EventSummary[]> =>
  (await store.listByOrg(organizationId)).map(strip);

export const getEvent = (store: EventReadStore) => async (sportEventId: string): Promise<EventDetail | undefined> => {
  const event = await store.get(sportEventId);
  return event ? strip(event) : undefined;
};
