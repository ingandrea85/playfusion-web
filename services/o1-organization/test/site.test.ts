import { describe, it, expect } from 'vitest';
import { makeSiteDefaults } from '../src/domain.js';
import { InMemoryBrandRepository } from './fakes.js';
import { getSite, setSite } from '../src/application/site.js';

describe('makeSiteDefaults (domain)', () => {
  it('trims strings and drops empty fields', () => {
    expect(makeSiteDefaults({ about: '  Chi siamo  ', sponsors: [], contacts: { email: '  ' }, venue: { name: '' } }))
      .toEqual({ about: 'Chi siamo' });
  });
  it('keeps only sponsors with a name and drops blank url/tier', () => {
    const out = makeSiteDefaults({ sponsors: [{ name: '  Rossi ', url: ' https://r ' }, { name: '' } as any, { name: 'Caffè', url: '', tier: 'Partner' }] });
    expect(out.sponsors).toEqual([{ name: 'Rossi', url: 'https://r' }, { name: 'Caffè', tier: 'Partner' }]);
  });
  it('normalises venue + contacts, dropping empty (no undefined keys reach DynamoDB)', () => {
    const out = makeSiteDefaults({ venue: { name: ' Le Betulle ', address: '', mapUrl: 'https://m' }, contacts: { email: 'info@x.it', phone: '' } });
    expect(out.venue).toEqual({ name: 'Le Betulle', mapUrl: 'https://m' });
    // partial objects must NOT carry undefined values (the DocumentClient would reject them)
    expect(Object.keys(out.venue!)).toEqual(['name', 'mapUrl']);
    expect(Object.values(out.venue!).every((v) => v !== undefined)).toBe(true);
    expect(out.contacts).toEqual({ email: 'info@x.it' });
    expect(Object.keys(out.contacts!)).toEqual(['email']);
  });
  it('sanitises rich "about" HTML (keeps formatting, drops scripts)', () => {
    const out = makeSiteDefaults({ about: '<p><strong>Ciao</strong><script>alert(1)</script></p>' });
    expect(out.about).toContain('<strong>Ciao</strong>');
    expect(out.about).not.toContain('script');
  });
  it('keeps an optional sponsor logo URL', () => {
    const out = makeSiteDefaults({ sponsors: [{ name: 'Rossi', logoUrl: ' https://logo.png ' }, { name: 'Senza logo' }] });
    expect(out.sponsors).toEqual([{ name: 'Rossi', logoUrl: 'https://logo.png' }, { name: 'Senza logo' }]);
  });
  it('returns an empty object when nothing meaningful is provided', () => {
    expect(makeSiteDefaults({ about: '   ', sponsors: [{ name: ' ' } as any] })).toEqual({});
  });
});

describe('o1 application — site defaults', () => {
  it('getSite is null when unset; setSite normalises and persists', async () => {
    const repo = new InMemoryBrandRepository();
    expect(await getSite({ repo })('org-1')).toBeNull();
    const saved = await setSite({ repo })('org-1', { about: '  Ciao ', venue: { name: 'Sede' } });
    expect(saved).toEqual({ about: 'Ciao', venue: { name: 'Sede' } });
    expect(await getSite({ repo })('org-1')).toEqual(saved);
  });
  it('site and brand are independent on the same repo', async () => {
    const repo = new InMemoryBrandRepository();
    await repo.save('org-1', { logoText: 'Acme', primaryColor: '#000', accentColor: '#111' });
    await setSite({ repo })('org-1', { about: 'X' });
    expect(await repo.get('org-1')).not.toBeNull();
    expect(await getSite({ repo })('org-1')).toEqual({ about: 'X' });
  });
});
