import type { RegistrationRepository } from '../ports/registration-repository.js';
import type { RegistrationRequest, RegistrationStatus } from '../domain/registration.js';

/** Public projection of a registration: internal persistence fields (pe, organizationId)
 *  are not part of the read contract. Feeds the E1 inbox (Applied) and participants
 *  (Confirmed) views. */
export type RegistrationView = Pick<RegistrationRequest, 'registrationId' | 'participantRef' | 'sportEventId' | 'categoria' | 'status'>;

const view = (r: RegistrationRequest): RegistrationView => ({
  registrationId: r.registrationId,
  participantRef: r.participantRef,
  sportEventId: r.sportEventId,
  categoria: r.categoria,
  status: r.status,
});

type Deps = { repo: RegistrationRepository };
type Query = { sportEventId: string; state?: RegistrationStatus };

export const listRegistrationsByEvent = ({ repo }: Deps) => async ({ sportEventId, state }: Query): Promise<RegistrationView[]> =>
  (await repo.findByEvent(sportEventId, state)).map(view);
