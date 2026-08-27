import { DomainError, checkpoint } from '@playfusion/platform-lib';
import { validateFormat, type CustomFinalsFormat } from '../finals-format.js';
import type { FinalsFormatRepository } from '../ports.js';

type Deps = { repo: FinalsFormatRepository; now?: () => string };

export const listFinalsFormats = (d: Deps) => (): Promise<CustomFinalsFormat[]> => d.repo.list();

export const getFinalsFormat = (d: Deps) => async (formatId: string): Promise<CustomFinalsFormat> => {
  const f = await d.repo.get(formatId);
  if (!f) throw new DomainError('FORMAT_NOT_FOUND', `finals format ${formatId} does not exist`, 404);
  return f;
};

/** Create/replace a custom format (platform admin). `id` from the caller (create) or the path (update). */
export const saveFinalsFormat = (d: Deps) => async (input: { id: string; name: string; seeds: number; rounds: CustomFinalsFormat['rounds'] }): Promise<CustomFinalsFormat> => {
  checkpoint('saveFinalsFormat', 'START', { formatId: input.id });
  const createdAt = (d.now ?? (() => new Date().toISOString()))();
  const format: CustomFinalsFormat = { id: input.id, name: input.name, seeds: input.seeds, rounds: input.rounds, createdAt };
  validateFormat(format); // throws INVALID_FORMAT (422) on a bad bracket
  await d.repo.save(format);
  checkpoint('saveFinalsFormat', 'STOP', { formatId: format.id });
  return format;
};

export const deleteFinalsFormat = (d: Deps) => (formatId: string): Promise<void> => d.repo.delete(formatId);
