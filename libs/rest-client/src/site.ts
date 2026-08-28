import type { OrgSiteDefaults, EventSite, ResolvedEventSite } from './types.js'

/**
 * Resolve the public event site from the org defaults + the per-event overrides. Shared by the E1
 * editor preview and the E3 public rendering so the two never diverge.
 *
 * Rules:
 * - Scalar/object fields (about, venue, contacts): event value wins when PRESENT (even ''), else the
 *   org default is inherited. The editor unsets a field (undefined) to fall back to the org value.
 * - `tagline` and `program` are event-only (no org default).
 * - Sponsors: org sponsors first (unless inheritOrgSponsors === false), then the event's own.
 * - `enabled` defaults to true; only an explicit `false` hides the rich site.
 */
export function resolveEventSite(orgDefaults: OrgSiteDefaults | null | undefined, eventSite: EventSite | null | undefined): ResolvedEventSite {
  const o = orgDefaults ?? {}
  const e = eventSite ?? {}
  const inheritSponsors = e.inheritOrgSponsors !== false
  return {
    enabled: e.enabled !== false,
    tagline: e.tagline,
    about: e.about ?? o.about,
    program: e.program,
    venue: e.venue ?? o.venue,
    contacts: e.contacts ?? o.contacts,
    sponsors: [...(inheritSponsors ? o.sponsors ?? [] : []), ...(e.sponsors ?? [])],
  }
}

/** Whether the resolved site has any showcase content worth rendering (else E3 shows the basic landing). */
export function hasSiteContent(r: ResolvedEventSite): boolean {
  if (!r.enabled) return false
  const v = r.venue, c = r.contacts
  return !!(r.tagline || r.about || r.program || r.sponsors.length
    || v?.name || v?.address || v?.mapUrl || c?.email || c?.phone || c?.social)
}
