import { DomainError, checkpoint } from '@playfusion/platform-lib';
import { validateFormat, type CustomFinalsFormat } from '../finals-format.js';
import type { FinalsFormatRepository } from '../ports.js';

type Deps = { repo: FinalsFormatRepository; now?: () => string };

export const listFinalsFormats = (d: Deps) => (organizationId: string): Promise<CustomFinalsFormat[]> => d.repo.listByOrg(organizationId);

export const getFinalsFormat = (d: Deps) => async (formatId: string): Promise<CustomFinalsFormat> => {
  const f = await d.repo.get(formatId);
  if (!f) throw new DomainError('FORMAT_NOT_FOUND', `finals format ${formatId} does not exist`, 404);
  return f;
};

/** Create/replace a custom format, owned by an organization. `id` from the caller (create) or path (update). */
export const saveFinalsFormat = (d: Deps) => async (input: { id: string; organizationId: string; name: string; seeds: number; rounds: CustomFinalsFormat['rounds'] }): Promise<CustomFinalsFormat & { organizationId: string }> => {
  checkpoint('saveFinalsFormat', 'START', { formatId: input.id, organizationId: input.organizationId });
  const createdAt = (d.now ?? (() => new Date().toISOString()))();
  const format: CustomFinalsFormat & { organizationId: string } = { id: input.id, organizationId: input.organizationId, name: input.name, seeds: input.seeds, rounds: input.rounds, createdAt };
  const errors = validateFormat(format);
  if (errors.length) throw new DomainError('INVALID_FORMAT', errors.join(' '), 422);
  await d.repo.save(format);
  checkpoint('saveFinalsFormat', 'STOP', { formatId: format.id });
  return format;
};

export const deleteFinalsFormat = (d: Deps) => (formatId: string): Promise<void> => d.repo.delete(formatId);
