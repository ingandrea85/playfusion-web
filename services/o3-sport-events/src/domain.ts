import { richTextOrUndefined } from '@playfusion/platform-lib';

export type EventStatus = 'Published';

/** Playbook / workflow the event follows: PB-1 = enrollment-with-invites, PB-2 = direct roster (S14). */
export type Playbook = 'PB-1' | 'PB-2';

/** Tie-break criteria applied after points (points always rank first). */
export type TieBreakCriterion = 'HEAD_TO_HEAD' | 'GOAL_DIFFERENCE' | 'GOALS_FOR';


/** A published sport event. `organizationId` is denormalised onto the item at write
 *  time (S1.1) so list-per-org is a single-BC GSI query.
 *
 *  S6 adds the competition config additively: `dates.from`/`dates.to` remain start/end
 *  date (6 existing consumers read them), and `name`/`location`/`startTime`/`tieBreak`
 *  are optional so pre-S6 events stay valid. `playbook` is optional on the stored item
 *  (pre-S6 rows lack it) but the read model defaults it to PB-1 so readers always see one. */
export interface SportEvent {
  sportEventId: string;
  organizationId: string;
  sport: string;
  categorie: string[];
  dates: { from: string; to: string };
  status: EventStatus;
  name?: string;
  location?: string;
  startTime?: string;
  tieBreak?: TieBreakCriterion[];
  playbook?: Playbook;
  /** S8: per-category group composition (O6). Optional; absent on pre-S8 events. */
  gironi?: import('./gironi.js').GironiMap;
  // Finals format moved to the o7 ScheduleConfig (per-category, edited in the Calendario tab) — it is
  // no longer part of the event.
  /** Event Site (Pro): per-event overrides of the public website (resolved against org defaults). */
  site?: EventSite;
  /** Epic #143: the sport profile snapshot + participant type + format chosen at creation. */
  sportProfile?: EventSportSnapshot;
  participantType?: 'team' | 'individual';
  format?: 'groups' | 'groups+bracket' | 'bracket';
}

export interface EventSportSnapshot {
  sportId: string; name: string; scoreLabel: string;
  points: { win: number; draw: number | null; loss: number };
  tieBreak: string[];
}

// Event Site — per-event overrides. All fields optional; the editor sends the whole object each save.
export interface EventSite {
  enabled?: boolean;
  tagline?: string;
  about?: string;
  program?: string;
  venue?: { name?: string; address?: string; mapUrl?: string };
  contacts?: { email?: string; phone?: string; social?: string };
  sponsors?: Array<{ name: string; url?: string; tier?: string; logoUrl?: string }>;
  inheritOrgSponsors?: boolean;
}

const trim = (v: unknown): string | undefined => { const t = typeof v === 'string' ? v.trim() : ''; return t || undefined; };
// Keep only defined keys (no `undefined` reaches DynamoDB); undefined when the object is empty.
const compact = <T extends object>(o: T): T | undefined => {
  const e = Object.entries(o).filter(([, v]) => v !== undefined);
  return e.length ? (Object.fromEntries(e) as T) : undefined;
};

/** Normalise a per-event site submission: trim strings, drop blanks/empty sponsors. */
export function makeEventSite(input: EventSite): EventSite {
  const out: EventSite = {};
  if (input.enabled === false) out.enabled = false;
  const tagline = trim(input.tagline); if (tagline) out.tagline = tagline;
  // "Chi siamo" + "Programma" are rich text (WYSIWYG) → sanitise to the allowlist before storing.
  const about = richTextOrUndefined(input.about); if (about) out.about = about;
  const program = richTextOrUndefined(input.program); if (program) out.program = program;
  const venue = input.venue && compact({ name: trim(input.venue.name), address: trim(input.venue.address), mapUrl: trim(input.venue.mapUrl) });
  if (venue) out.venue = venue;
  const contacts = input.contacts && compact({ email: trim(input.contacts.email), phone: trim(input.contacts.phone), social: trim(input.contacts.social) });
  if (contacts) out.contacts = contacts;
  const sponsors = (Array.isArray(input.sponsors) ? input.sponsors : [])
    .map((x) => ({ name: trim(x?.name) ?? '', url: trim(x?.url), tier: trim(x?.tier), logoUrl: trim(x?.logoUrl) }))
    .filter((x) => x.name)
    .map((x) => ({ name: x.name, ...(x.url ? { url: x.url } : {}), ...(x.tier ? { tier: x.tier } : {}), ...(x.logoUrl ? { logoUrl: x.logoUrl } : {}) }));
  if (sponsors.length) out.sponsors = sponsors;
  if (input.inheritOrgSponsors === false) out.inheritOrgSponsors = false;
  return out;
}
