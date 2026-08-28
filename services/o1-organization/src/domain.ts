import { DomainError } from '@playfusion/platform-lib';

// S18 (O1 organization) — brand identity is presentation metadata owned by the Organization
// (Blueprint D-O1-1): a text wordmark + primary/accent colours, applied to the organizer shell
// and the public portal. No sport-domain field carries brand. The Pro/M-Broadcast gate is
// deferred until billing exists (S20); for now any organizer of the tenant can set it.
export interface Brand {
  logoText: string;
  primaryColor: string;
  accentColor: string;
}

// #rgb or #rrggbb — restrict to hex so a saved colour is always a safe CSS custom-property value.
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Validate + normalise a brand submission (trims the wordmark, checks the two colours). */
export function makeBrand(input: { logoText: string; primaryColor: string; accentColor: string }): Brand {
  const logoText = input.logoText.trim();
  if (!logoText) throw new DomainError('INVALID_BRAND', 'logoText is required', 422);
  if (!HEX.test(input.primaryColor)) throw new DomainError('INVALID_BRAND', 'primaryColor must be a hex colour', 422);
  if (!HEX.test(input.accentColor)) throw new DomainError('INVALID_BRAND', 'accentColor must be a hex colour', 422);
  return { logoText, primaryColor: input.primaryColor, accentColor: input.accentColor };
}

// Event Site (Pro) — org-level defaults inherited by every event. All fields optional; the editor
// sends the whole object each save. We normalise (trim, drop blanks) so the stored/public shape is clean.
export interface Sponsor { name: string; url?: string; tier?: string }
export interface Contacts { email?: string; phone?: string; social?: string }
export interface Venue { name?: string; address?: string; mapUrl?: string }
export interface OrgSiteDefaults { about?: string; sponsors?: Sponsor[]; contacts?: Contacts; venue?: Venue }

const s = (v: unknown): string | undefined => { const t = typeof v === 'string' ? v.trim() : ''; return t || undefined; };
const obj = <T extends object>(o: T): T | undefined => (Object.values(o).some((v) => v !== undefined) ? o : undefined);

export function normalizeSponsors(list: unknown): Sponsor[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((x) => ({ name: s((x as Sponsor)?.name) ?? '', url: s((x as Sponsor)?.url), tier: s((x as Sponsor)?.tier) }))
    .filter((x) => x.name)
    .map((x) => ({ name: x.name, ...(x.url ? { url: x.url } : {}), ...(x.tier ? { tier: x.tier } : {}) }));
}
const normContacts = (c: Contacts | undefined): Contacts | undefined => c && obj({ email: s(c.email), phone: s(c.phone), social: s(c.social) });
const normVenue = (v: Venue | undefined): Venue | undefined => v && obj({ name: s(v.name), address: s(v.address), mapUrl: s(v.mapUrl) });

/** Normalise org site-defaults (trim strings, drop empty). Returns a clean OrgSiteDefaults. */
export function makeSiteDefaults(input: OrgSiteDefaults): OrgSiteDefaults {
  const out: OrgSiteDefaults = {};
  const about = s(input.about); if (about) out.about = about;
  const sponsors = normalizeSponsors(input.sponsors); if (sponsors.length) out.sponsors = sponsors;
  const contacts = normContacts(input.contacts); if (contacts) out.contacts = contacts;
  const venue = normVenue(input.venue); if (venue) out.venue = venue;
  return out;
}
