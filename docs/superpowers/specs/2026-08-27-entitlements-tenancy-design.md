# Entitlements-driven tenancy — one org model, plan unlocks the team (DRAFT)

**Date:** 2026-08-27
**Status:** APPROVED (4 open decisions resolved 2026-08-27); ready to decompose into slices
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

Decisions (locked 2026-08-27):
- **Seats = fixed per plan** (Free 1 · Pro 5 · Business 20). Per-seat billing is out of scope (a
  possible future pricing lever, not now).
- **Business differentiator = a real B2B feature** (sub-teams / multi-venue / SSO), not just "more
  seats". Which one is scoped as its own later slice; the entitlements core just carries a flag.
- **Trial → Free** (a new tenant starts in a 14-day PRO trial, S20): at expiry → Free, and any
  members beyond the Free seat cap stay **read-only** (not blocked at login), with an upgrade CTA.

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

**Membership source of truth (decided)**: **Auth0 Organizations** is the single source of truth for
members + roles + invitations. The S19 `o2-members`/`o2-invitations` registry + its endpoints + the
current E1 Membri UI are **retired**: the org console reads/writes members via Auth0 (a thin backend
proxying the Management API for list/invite/role-change/remove, or the FE through a new o2 endpoint).
The last-OWNER invariant and role semantics move onto the Auth0 org membership.

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

## Decisions (all resolved 2026-08-27)
1. Seats: **fixed per plan** (1 / 5 / 20).
2. Business: **a real B2B feature** (sub-teams / multi-venue / SSO — which one scoped later).
3. Trial→Free: extra members **read-only**, not blocked.
4. Membership source of truth: **Auth0 Organizations**; the o2 registry (S19) is retired.
