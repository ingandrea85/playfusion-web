import { checkpoint } from '@playfusion/platform-lib';
import type { WindowRepository } from '../ports/window-repository.js';
export const onEventPublished = (d: { windows: WindowRepository }) => async (evt: { sportEventId: string }) => {
  checkpoint('onEventPublished', 'START', { sportEventId: evt.sportEventId });
  const existing = await d.windows.get(evt.sportEventId);
  if (!existing) await d.windows.save({ sportEventId: evt.sportEventId, state: 'Closed' });
  checkpoint('onEventPublished', 'STOP', { sportEventId: evt.sportEventId });
};
