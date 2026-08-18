import { nextOnApprove, nextOnPublish, type Schedule } from '../domain.js';
import { EventNotFoundError } from '../errors.js';
import type { ScheduleRepository } from '../ports.js';

/** Approve advances GENERATED → APPROVED (locking the config); any other state is a
 *  no-op. Throws if no schedule has been generated for the event. */
export function approveSchedule(schedules: ScheduleRepository) {
  return async (sportEventId: string): Promise<Schedule> => {
    const s = await schedules.get(sportEventId);
    if (!s) throw new EventNotFoundError(sportEventId);
    const next: Schedule = { ...s, status: nextOnApprove(s.status) };
    await schedules.save(next);
    return next;
  };
}

/** Publish advances APPROVED → PUBLISHED (opening the public calendar); any other state
 *  is a no-op. Throws if no schedule exists for the event. */
export function publishSchedule(schedules: ScheduleRepository) {
  return async (sportEventId: string): Promise<Schedule> => {
    const s = await schedules.get(sportEventId);
    if (!s) throw new EventNotFoundError(sportEventId);
    const next: Schedule = { ...s, status: nextOnPublish(s.status) };
    await schedules.save(next);
    return next;
  };
}
