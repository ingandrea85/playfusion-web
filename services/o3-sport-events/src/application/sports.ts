import { DomainError, checkpoint } from '@playfusion/platform-lib';
import { makeSportProfile, type SportProfile, type SportProfileInput } from '../sport.js';
import type { DynamoDbSportRepository } from '../adapters/dynamodb-sport-repository.js';

type Deps = { repo: DynamoDbSportRepository; now?: () => string };
const clock = (d: Deps) => (d.now ?? (() => new Date().toISOString()))();

export const listSports = (d: Deps) => (): Promise<SportProfile[]> => d.repo.list();

export const getSport = (d: Deps) => async (id: string): Promise<SportProfile> => {
  const s = await d.repo.get(id);
  if (!s) throw new DomainError('SPORT_NOT_FOUND', `sport ${id} does not exist`, 404);
  return s;
};

/** Create/replace a sport profile (platform admin). id from the caller (create) or the path (update). */
export const saveSport = (d: Deps) => async (input: SportProfileInput & { id: string }): Promise<SportProfile> => {
  checkpoint('saveSport', 'START', { sportId: input.id });
  const sport = makeSportProfile({ ...input, createdAt: clock(d) });
  await d.repo.save(sport);
  checkpoint('saveSport', 'STOP', { sportId: sport.id });
  return sport;
};

export const deleteSport = (d: Deps) => (id: string): Promise<void> => d.repo.delete(id);
