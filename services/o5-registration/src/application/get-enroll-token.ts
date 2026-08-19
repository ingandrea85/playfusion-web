import type { WindowRepository } from '../ports/window-repository.js';

/** Organizer-only read of the coach enrollment token minted at window open. Returned to the
 *  E1 enroll screen so the organizer can copy the shareable enrollment link. Never exposed by
 *  the public window read. Undefined until the window has been opened at least once. */
export const getEnrollToken = ({ windows }: { windows: WindowRepository }) => async (sportEventId: string): Promise<{ enrollToken?: string }> => {
  const w = await windows.get(sportEventId);
  return { enrollToken: w?.enrollToken };
};
