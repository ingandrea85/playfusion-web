# Event Site — design

**Date:** 2026-08-28
**Status:** approved (design), pending implementation plan
**Scope:** turns the E3 public page into a public **event website** ("vetrina + risultati"), authored
by the organizer, gated **Pro**. Touches O1 (organization site defaults), O3 (per-event site),
E1 (editors) and E3 (public rendering), plus `@playfusion/entitlements`.
**Mockup:** approved via Artifact (event home + org→event inheritance + E1 editor sketch).

## Goal

Today E3 is a functional results portal (landing with category chips + buttons to Calendario /
Classifiche / Tabellone / Avvisi / Squadre). We enrich it into a **showcase site for the event**:
an editorial home that tells the event's story (intro, program, venue, sponsors) on top of the
existing results views. Primary audience: spectators / families. Content is **author-provided**
(no image uploads in v1 — text + links only; hero uses the tenant brand colour).

## Non-goals (v1)

- **No image hosting / uploads** (no S3): no hero photo, no gallery, sponsor logos via external URL only.
- No per-event custom domain / friendly URLs (stays under the shared CloudFront hash routes).
- No CMS-grade rich text — short plain-text / lightly-structured fields.

## Content model — two levels with per-field inheritance

Organization defines defaults **once**; every event inherits them and may override per field.
**Effective value shown to the public = event override ?? organization default** (per field).

### Organization site defaults (O1, alongside brand)

```
OrgSiteDefaults {
  about?:    string                                   // "Chi siamo"
  sponsors?: Array<{ name: string; url?: string; tier?: string }>
  contacts?: { email?: string; phone?: string; social?: string }
  venue?:    { name?: string; address?: string; mapUrl?: string }   // sede abituale
}
```

### Per-event site (O3, optional `site` on the event)

```
EventSite {
  enabled?:   boolean          // master switch; default true when any field is populated
  tagline?:   string           // event-specific subtitle under the title
  about?:     string           // override org about
  program?:   string           // event-specific (no org default)
  venue?:     { name?; address?; mapUrl? }            // override org venue
  contacts?:  { email?; phone?; social? }             // override org contacts
  sponsors?:  Array<{ name; url?; tier? }>            // event-specific additions
  inheritOrgSponsors?: boolean // default true → effective = org.sponsors + event.sponsors
}
```

**Resolution rules** (a shared pure helper `resolveEventSite(orgDefaults, eventSite)` used by BOTH
E1 and E3 so behaviour never diverges):

- Scalar / object fields (`about`, `venue`, `contacts`, `tagline`): `event.site.X ?? orgDefaults.X`.
  A field ABSENT on the event → inherited. A field PRESENT (even empty string) → override.
- `program`: event-only (no org default).
- `sponsors`: `effective = (inheritOrgSponsors !== false ? orgDefaults.sponsors : []) .concat(event.sponsors ?? [])`.
- The rich site renders when `enabled !== false` AND at least one meaningful field resolves; otherwise
  E3 shows **today's basic landing** (no regression, no public gating).

## Storage & API

- **O1** (`o1-organization`, already owns brand): store `siteDefaults` next to brand in the org record.
  - `GET  /organizations/:orgId/site` — **public** (E3 reads it; mirrors public `GET …/brand`).
  - `PUT  /organizations/:orgId/site` — **owner-only** (`requireOwner`, like brand: org identity).
- **O3** (`o3-sport-events`): add optional `site` to the event.
  - The existing `GET /events/:id` returns `site` (public read already used by E3).
  - `PUT  /events/:id/site` — **organizer** (`requireOrganizer`; per-event content is operational,
    like Avvisi). Owners pass too (owner ⊇ organizer).
- No new BC, no new table (extends existing o1 org record and o3 event item).

## Entitlement (Pro gate)

Add `hasEventSite: boolean` to `@playfusion/entitlements` — `FREE: false`, `PRO: true`,
`BUSINESS: true`. A feature is available only when the plan entitles it AND the role permits it:

- **Editing** (both editors) is gated: Free orgs see `lockCard('Sito evento — richiede Pro')`,
  exactly like Brand / Avvisi.
- **Public site**: no E3-side gating. If a Free org never authored content (or downgraded), the
  effective site is empty → E3 shows the basic landing. Content authored while Pro persists and stays
  publicly visible after a downgrade (read-only), consistent with the tenancy decisions.

## E1 editors

- **Org "Sito" tab** in the **organization console** (next to Brand), **owner-only + Pro-gated**:
  edits `OrgSiteDefaults` (Chi siamo, sponsor ricorrenti, contatti, sede abituale).
- **Event "Sito" tab** in the **event workspace**, **organizer + Pro-gated**: edits `EventSite`.
  Each inheritable field shows an **Eredita dall'org / Personalizza** switch:
  - *Eredita* → the field is unset on the event (shows the org value greyed as placeholder).
  - *Personalizza* → the field is written on the event (overrides).
  - Sponsors: an "Eredita org + aggiungi" list (org sponsors shown read-only, event can append;
    a toggle drops inheritance to replace entirely).
  - A live preview mirrors the E3 home using `resolveEventSite`.

## E3 public rendering (the landing becomes the event home)

`renderLanding` is extended to resolve the effective site (fetch event + org site-defaults, merge via
`resolveEventSite`) and render, in order:

1. **Hero** — brand colour + event name + `tagline` + meta (dates, venue name, teams count) + CTA to results.
2. **Chi siamo** (`about`) — when present.
3. **Programma** (`program`) — when present.
4. **Dove si gioca** (`venue`) — address + "Apri in Maps" (`mapUrl`).
5. **Squadre / Categorie** — existing chips (link to per-category calendar when published).
6. **Risultati** — existing Calendario / Classifiche / Tabellone entry points (as cards).
7. **Sponsor** (effective sponsors) — name + external link.
8. **Avvisi** — existing announcements teaser.

When no site content resolves → the current basic landing is rendered unchanged.

## Shared code

- `@playfusion/rest-client` types: `OrgSiteDefaults`, `EventSite`, `Sponsor`, `Contacts`, `Venue`;
  `o1.getSite/setSite`, `o3.setEventSite`; `site` added to `EventDetail`.
- `resolveEventSite(orgDefaults, eventSite)` — the single resolution helper (rest-client or a small
  shared module) consumed by E1 preview/editor and E3 rendering.

## Testing

- Domain/helper: `resolveEventSite` inheritance rules (override, inherit, sponsors append/replace,
  empty → basic landing) — pure unit tests.
- Backend: o1 site GET public / PUT owner-only (403 for organizer); o3 `site` PUT organizer.
- E1: editors render inherit/override state; Pro lock for Free; save calls the right endpoint.
- E3: rich sections render from effective content; basic landing when empty.
- Entitlements: `hasEventSite` per plan.

## Implementation slices (plan to be detailed via writing-plans)

1. **Foundation** — entitlements `hasEventSite`, rest-client types + `resolveEventSite` + unit tests.
2. **Backend** — o1 siteDefaults (public GET / owner PUT), o3 event `site` (organizer PUT); tests.
3. **E1 org editor** — org-console "Sito" tab (owner, Pro-gated).
4. **E1 event editor** — workspace "Sito" tab (organizer, Pro-gated) with inherit/override + preview.
5. **E3 public home** — enriched landing via `resolveEventSite`, with basic-landing fallback.

Each slice ships independently behind the Pro gate; 1–2 add no visible change until an editor exists.
