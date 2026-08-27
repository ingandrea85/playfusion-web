import { describe, it, expect } from 'vitest';
import { saveFinalsFormat, getFinalsFormat, listFinalsFormats, deleteFinalsFormat } from '../../src/application/finals-formats.js';
import { InMemoryFinalsFormatRepository } from '../fakes.js';

const rounds = [{ name: 'Finale', matches: [{ slot: 'F', home: { seed: 1 as const }, away: { seed: 2 as const }, placementFrom: 1, placementTo: 2 }] }];

describe('finals-formats application', () => {
  it('saves a valid format, stamping createdAt from the injected clock', async () => {
    const repo = new InMemoryFinalsFormatRepository();
    const f = await saveFinalsFormat({ repo, now: () => 't0' })({ id: 'f1', name: 'Secca', seeds: 2, rounds });
    expect(f).toMatchObject({ id: 'f1', name: 'Secca', seeds: 2, createdAt: 't0' });
    expect((await listFinalsFormats({ repo })()).map((x) => x.id)).toEqual(['f1']);
  });
  it('rejects an invalid format (422)', async () => {
    const repo = new InMemoryFinalsFormatRepository();
    await expect(saveFinalsFormat({ repo })({ id: 'x', name: 'Bad', seeds: 1, rounds })).rejects.toMatchObject({ httpStatus: 422 });
  });
  it('getFinalsFormat throws 404 for an unknown id', async () => {
    await expect(getFinalsFormat({ repo: new InMemoryFinalsFormatRepository() })('nope')).rejects.toMatchObject({ httpStatus: 404 });
  });
  it('deleteFinalsFormat removes it', async () => {
    const repo = new InMemoryFinalsFormatRepository();
    await saveFinalsFormat({ repo })({ id: 'f1', name: 'Secca', seeds: 2, rounds });
    await deleteFinalsFormat({ repo })('f1');
    expect(await listFinalsFormats({ repo })()).toEqual([]);
  });
});
