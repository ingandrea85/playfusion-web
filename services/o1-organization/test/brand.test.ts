import { describe, it, expect } from 'vitest';
import { makeBrand } from '../src/domain.js';
import { InMemoryBrandRepository } from './fakes.js';
import { getBrand, setBrand, resetBrand } from '../src/application/brand.js';

const valid = { logoText: '  Acme Cup  ', primaryColor: '#0b5fff', accentColor: '#ff6b00' };

describe('makeBrand (domain)', () => {
  it('test_makeBrand_trimsWordmarkAndKeepsColours', () => {
    expect(makeBrand(valid)).toEqual({ logoText: 'Acme Cup', primaryColor: '#0b5fff', accentColor: '#ff6b00' });
  });
  it('test_makeBrand_rejectsEmptyLogoText', () => {
    expect(() => makeBrand({ ...valid, logoText: '   ' })).toThrowError(/logoText is required/);
  });
  it('test_makeBrand_rejectsNonHexPrimary', () => {
    expect(() => makeBrand({ ...valid, primaryColor: 'red' })).toThrowError(/primaryColor must be a hex/);
  });
  it('test_makeBrand_rejectsNonHexAccent', () => {
    expect(() => makeBrand({ ...valid, accentColor: '#zzzzzz' })).toThrowError(/accentColor must be a hex/);
  });
  it('test_makeBrand_acceptsShortHex', () => {
    expect(makeBrand({ ...valid, primaryColor: '#0bf', accentColor: '#f60' }).primaryColor).toBe('#0bf');
  });
});

describe('o1 application — brand lifecycle', () => {
  it('test_getBrand_nullWhenUnset', async () => {
    const repo = new InMemoryBrandRepository();
    expect(await getBrand({ repo })('org-1')).toBeNull();
  });
  it('test_setBrand_persistsAndReturnsTheBrand', async () => {
    const repo = new InMemoryBrandRepository();
    const saved = await setBrand({ repo })('org-1', valid);
    expect(saved.logoText).toBe('Acme Cup');
    expect(await getBrand({ repo })('org-1')).toEqual(saved);
  });
  it('test_resetBrand_removesTheBrand', async () => {
    const repo = new InMemoryBrandRepository();
    await setBrand({ repo })('org-1', valid);
    await resetBrand({ repo })('org-1');
    expect(await getBrand({ repo })('org-1')).toBeNull();
  });
});
