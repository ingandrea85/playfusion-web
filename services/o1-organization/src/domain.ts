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
