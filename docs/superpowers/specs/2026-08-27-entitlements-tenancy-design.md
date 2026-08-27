# Entitlements-driven tenancy — one org model, plan unlocks the team (DRAFT)

**Date:** 2026-08-27
**Status:** DRAFT for review (strategic design; no code yet)
**Scope:** reshapes tenancy across O2 (membership/identity), O11 (subscription), O1 (brand) and E1
**Supersedes/aligns:** the "personal org per user" Auth0 onboarding; Blueprint D-O2-1 (membership),
D-O11-2 (trial-first)

## Problem

The current build serves a single **organizer console** with **1 user = 1 personal organization**
(self-service, isolated). That fits a small/solo organizer, but not "a company that runs many events
with several organizers". Worse, it contradicts itself: S19 modelled a **multi-member org with
roles** (Owner/Organizer/Director), yet the Auth0 onboarding creates a personal org per user and the
S19 registry is not wired to real Auth0 roles.

Decision taken with the product owner: **support BOTH the solo and the company model, gated by the
subscription plan.** This is not two systems — it is **one org-centric model where the plan unlocks
team capabilities** (members, roles, more events, brand, modules).

## Core principle: entitlements

Every account already IS an organization (Auth0 Organizations). We add a single **plan → entitlements**
map, read by the FE (show/lock features) and enforced by the backend (e.g. can only invite when the
plan allows).

Proposed default matrix (⚠️ numbers to confirm):

| Capability            | Free            | Pro             | Business        |
|-----------------------|-----------------|-----------------|-----------------|
| Seats (members)       | 1 (owner only)  | 5               | 20              |
| Invite members + roles| ❌              | ✅              | ✅              |
| Active events         | 1               | ∞               | ∞               |
| Brand (S18)           | 🔒              | ✅              | ✅              |
| Announcements (S15)   | 🔒              | ✅              | ✅              |
| Fees / payments (S20) | 🔒              | ✅              | ✅              |
| Custom finals formats | (platform_admin, orthogonal to plan)              |
| Killer B2B feature    | —               | —               | sub-teams / multi-venue (TBD) |

Open decisions:
- **Seats**: fixed per plan (above) vs **per-seat billing** (pay per member). Default here = fixed;
  per-seat is a later pricing lever.
- **Business** differentiator: a real feature (sub-teams / multi-venue / SSO) vs just "more seats".
- **Trial**: a new tenant is born in a **14-day PRO trial** (S20 already) → they get full team
  features during the trial; at expiry → **Free**, team features **lock** (existing members kept but
  read-only; no new invites) with an upgrade CTA. (Confirm the "keep members read-only" behaviour.)

Implementation shape: a pure `entitlements(plan): Entitlements` in a **shared lib**
(`@playfusion/entitlements`), consumed by o11/o2 (backend enforcement) and E1 (UI gating) — same
pattern as the finals-format shared lib. `Entitlements = { maxSeats, canInviteMembers, maxActiveEvents,
hasBrand, hasAnnouncements, hasPayments }`.

## Onboarding — two paths (the delicate part)

Today the post-login Action creates a **personal org** for any user without one. We keep that for
**sign-up**, and add an **invite** path:

1. **Sign-up** (`screen_hint=signup`) → Action creates the user's own org, user = **OWNER**,
   subscription = PRO trial. They can invite during the trial.
2. **Accept invitation** (Pro+) → the OWNER invites via an **Auth0 Organization invitation**; the
   invitee accepts, becomes a **member of that org** (org-scoped login), and the Action **skips org
   creation** because the token already carries the inviter's `org_id`. Role comes from the org
   membership (organizer/director).

So the Action becomes: *if the login is org-scoped (member) → use that org; else if the user has no
org → create a personal one (owner)*. Roles always read from the real Auth0 assignments (already fixed).

**Membership source of truth**: move to **Auth0 Organizations** (members + roles + invitations). The
S19 `o2-members`/`o2-invitations` registry becomes either a thin read-model synced from Auth0, or is
retired in favour of reading Auth0 org members directly. (Decision to confirm — leaning: Auth0 as SoT,
drop the standalone registry.)

## Organization console (above events)

Brand, Members and Subscription are **org-level**, but today they are buried inside an event
workspace. Introduce an **organization console**:

- Routes: `#/org` (overview: all events + quick stats), `#/org/members`, `#/org/brand`,
  `#/org/subscription`. Move those three out of the per-event workspace.
- The **event workspace** keeps only event-scoped tabs (Panoramica, Gironi, Calendario, Classifiche,
  Finali, Risorse, Avvisi, Iscrizioni, Partecipanti).
- Nav is **role-gated**: OWNER sees members/brand/subscription; ORGANIZER sees events; DIRECTOR gets a
  restricted surface (results only, per S19).

## RBAC (roles × entitlements)

- **OWNER**: billing, brand, members, all events.
- **ORGANIZER**: operate events; no billing/brand/members.
- **DIRECTOR**: record/correct results only; read-only calendar/standings; no setup.
Enforced in the UI (nav + guards) and at the backend boundary (the endpoints already use
`requireOrganizer`; add role checks where owner-only). A feature is available only when BOTH the plan
entitles it AND the role permits it.

## Impact on what exists

- **S20 subscription**: becomes the entitlements source; the event cap already prototypes this.
- **S19 membership**: re-oriented to Auth0 org invitations + plan gate (the registry likely retired).
- **S18 brand / S15 announcements / o12 fees**: gated by `hasBrand`/`hasAnnouncements`/`hasPayments`.
- **Auth0 Action**: extended to the two-path onboarding; roles already read from real assignments.
- **platform_admin**: orthogonal (global platform ops, E4) — unaffected by plan.

## Proposed decomposition (slices, in order)

1. **Entitlements core** — `@playfusion/entitlements` lib + o11 exposes plan; FE gates brand /
   announcements / payments / members with a "Richiede Pro" lock on Free. (Low risk, immediate value.)
2. **Organization console** — new `#/org/*` surface; move brand/members/subscription there + events
   overview; role-gated nav. (Mostly FE re-org.)
3. **Real member invites** — Auth0 Organization invitations (invite → join org), gated Pro+; wire
   roles to claims; retire/sync the o2 registry.
4. **RBAC enforcement** — role-restricted surfaces (director results-only) in UI + backend.
5. **Onboarding reconciliation** — the two-path Action (sign-up vs invite).

Each slice ships independently; 1–2 give visible value fast without touching Auth0 onboarding.

## Out of scope (for now)

Per-seat billing, SSO/enterprise connections, sub-teams/multi-venue, usage analytics, and the
platform-admin E4 monitoring surface (S21) — all later.

## Open decisions to confirm
1. Seats: fixed-per-plan (proposed) vs per-seat billing.
2. Business plan differentiator (feature vs more seats).
3. Trial→Free downgrade: keep existing members read-only vs block login for extra members.
4. Membership source of truth: Auth0 Organizations (proposed) vs keep the o2 registry.
