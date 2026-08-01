import type { WindowRepository } from '../ports/window-repository.js';
import type { RegistrationRepository } from '../ports/registration-repository.js';
import type { WindowState } from '../domain/registration-window.js';

export type CategoryCapacity = { categoria: string; cap: number; count: number; remaining: number };
export type RegistrationWindowView = { sportEventId: string; state: WindowState; categories: CategoryCapacity[] };

type Deps = { windows: WindowRepository; repo: RegistrationRepository };

/** S1.4 read: the registration-window state plus, per declared category, the cap, the
 *  active-registration count and the remaining capacity. Active = not Rejected; a
 *  Rejected registration frees its slot. `remaining` is clamped at 0. No window row →
 *  Closed with no categories. */
export const getRegistrationWindow = ({ windows, repo }: Deps) => async (sportEventId: string): Promise<RegistrationWindowView> => {
  const window = await windows.get(sportEventId);
  const capacities = window?.capacities ?? {};

  const active = (await repo.findByEvent(sportEventId)).filter(r => r.status !== 'Rejected');
  const counts = new Map<string, number>();
  for (const r of active) counts.set(r.categoria, (counts.get(r.categoria) ?? 0) + 1);

  const categories: CategoryCapacity[] = Object.entries(capacities).map(([categoria, cap]) => {
    const count = counts.get(categoria) ?? 0;
    return { categoria, cap, count, remaining: Math.max(0, cap - count) };
  });

  return { sportEventId, state: window?.state ?? 'Closed', categories };
};
