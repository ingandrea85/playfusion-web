import { describe, it, expect } from 'vitest';
import { makeEventSite } from '../src/domain.js';

describe('makeEventSite (domain)', () => {
  it('trims and drops empty fields; omits enabled unless explicitly false', () => {
    expect(makeEventSite({ tagline: '  Tre giorni  ', about: '', program: '  Ven 15:00 ' }))
      .toEqual({ tagline: 'Tre giorni', program: 'Ven 15:00' });
  });
  it('keeps enabled=false and inheritOrgSponsors=false when set', () => {
    expect(makeEventSite({ enabled: false, inheritOrgSponsors: false, sponsors: [{ name: 'Solo' }] }))
      .toEqual({ enabled: false, inheritOrgSponsors: false, sponsors: [{ name: 'Solo' }] });
  });
  it('normalises venue/contacts/sponsors, dropping blanks', () => {
    const out = makeEventSite({
      venue: { name: ' Campo ', address: '', mapUrl: 'https://m' },
      contacts: { email: '', phone: '333' },
      sponsors: [{ name: ' A ', url: ' https://a ' }, { name: '' } as any],
    });
    expect(out.venue).toEqual({ name: 'Campo', mapUrl: 'https://m' });
    expect(Object.keys(out.venue!)).toEqual(['name', 'mapUrl']); // no undefined 'address' key
    expect(out.contacts).toEqual({ phone: '333' });
    expect(out.sponsors).toEqual([{ name: 'A', url: 'https://a' }]);
  });
  it('sanitises rich about + program HTML', () => {
    const out = makeEventSite({ about: '<h3>Titolo</h3><script>x</script>', program: '<ul><li>uno</li></ul><img src=x>' });
    expect(out.about).toBe('<h3>Titolo</h3>');
    expect(out.program).toBe('<ul><li>uno</li></ul>'); // img dropped
  });
  it('keeps an optional sponsor logo URL', () => {
    expect(makeEventSite({ sponsors: [{ name: 'A', logoUrl: ' https://l.png ' }] }).sponsors)
      .toEqual([{ name: 'A', logoUrl: 'https://l.png' }]);
  });
  it('empty submission normalises to an empty object', () => {
    expect(makeEventSite({ about: '  ', sponsors: [] })).toEqual({});
  });
});
