# Slice `mb` — Organization membership & roles (O2)

**Date:** 2026-07-27
**Experience:** E1 Organizer (+ role-based restricted surface)
**Playbook/BC:** O2 (Organization / membership management)
**Status:** design approved, ready for plan

## Problem

After sign-up an operator becomes a `User` bound 1:1 to a new `Organization` with
`role: 'ADMIN'`. There is no way to add other people to an existing organization, no
role differentiation, and the `'ADMIN'` literal collides with the platform-ADMIN concept
of the E4 admin app. Question that surfaced it: *"come vengono creati gli organizzatori?"*

This slice introduces multi-member organizations with per-tenant roles and an invite flow,
plus a role-based restricted experience so the DIRECTOR role has a real (web) surface.

## Decisions (locked during brainstorming)

- **Multi-member org, but 1 user = 1 org.** No `Membership` join entity, no org-switcher.
  Members of an org = users whose `organizationId` matches.
- **Three per-tenant roles:** `OWNER` (creator: billing, brand, members), `ORGANIZER`
  (operates events, no billing/brand/members), `DIRECTOR` (record/correct match results
  only — scores + shootout; read-only calendar/standings; **web surface, not mobile-only**).
- **Invite = link + "Simula accettazione" demo lever** (reuses the E3 enroll-link pattern
  and the existing "Simula scadenza" lever). No real email, no public accept page.
- **Sign-up creator is `OWNER`** (was `'ADMIN'`).
- **Invariant:** an org always has **≥1 OWNER** (guarded on role change + removal).
- **Member management is NOT plan-gated** in this slice (any plan can invite; no seat cap).

## Data model (`shared/mock/types.ts`)

```ts
export type OrgRole = 'OWNER' | 'ORGANIZER' | 'DIRECTOR'

export interface User {
  id: string
  name: string
  email: string
  organizationId: string
  role: OrgRole            // was: 'ADMIN'
}

export interface Invitation {
  id: string
  organizationId: string
  name: string
  email: string
  role: OrgRole
  status: 'PENDING' | 'ACCEPTED'
  createdAt: string
}
```

`State` gains `invitations: Invitation[]`. `Session { userId, organizationId }` unchanged.

## Store API (`shared/mock/store.ts`)

| Function | Behaviour |
|---|---|
| `currentUser(): User \| null` | `users.find(u => u.id === session?.userId) ?? null` |
| `currentRole(): OrgRole` | current user's role, **default `OWNER`** when no session (existing seed demos stay full-permission) |
| `listMembers(orgId)` | users of the org |
| `listInvitations(orgId)` | invitations of the org |
| `inviteMember(orgId, {name,email,role})` | push `Invitation` PENDING (link = its `id`) |
| `acceptInvitation(id)` | create `User` in the org from the invitation + mark `ACCEPTED` |
| `revokeInvitation(id)` | remove the PENDING invitation |
| `changeMemberRole(userId, role)` | guarded: rejects demoting the **last OWNER** |
| `removeMember(userId)` | guarded: rejects removing the **last OWNER** |
| `actAs(userId)` | set `session.userId` (demo lever) |
| `signUp(...)` | creator role becomes `OWNER` (single-line change) |

Guard helper: `isLastOwner(orgId, userId)` used by both `changeMemberRole` and `removeMember`.

### Role gating (pure helper)

A pure `allowedTabs(role): TabKey[]` / `canManageMembers(role)` / `canEditBilling(role)` etc.
in a small module (e.g. `shared/mock/roles.ts`) so it is unit-testable in isolation and
consumed by the shell:

- **OWNER** → all tabs + all settings cards.
- **ORGANIZER** → all event tabs; Impostazioni **without** Abbonamento, Brand, Membri.
- **DIRECTOR** → only Calendario / Classifiche / Tabellone; result-entry actions only;
  no reschedule, no gironi/categorie edit, no iscrizioni/avvisi/impostazioni.

## Seed (`shared/mock/seed.ts`)

`org-1` gains **3 demo members** so Membri isn't empty and "Agisci come…" has options.
**`session` stays `null`** (preserves the `ac` sign-up flow, which starts logged-out and
defaults to `org-1`); `currentRole()` returns `OWNER` when session is null, so out-of-the-box
the demo has full permissions. The "Agisci come…" lever is what sets `session.userId` to a
seeded member to preview the restricted surfaces.

- `usr-1` Owner (Andrea) — OWNER
- `usr-2` Organizer (Marco) — ORGANIZER
- `usr-3` Director (Luca) — DIRECTOR

Plus one PENDING `Invitation` demo (Giulia, ORGANIZER) so the invites list is non-empty.

"sei tu" marker in Membri: the current user when session is set, else the OWNER (session-null default).

## Screens

### `apps/organizer/membri.html` + `membri.ts` (owner-only)

Under the ⚙ Impostazioni index. `requireRole(['OWNER'])` guard at load → redirect if not owner.

1. **Membri attivi** — per row: avatar/initials, name (+ "sei tu" marker), email, role badge,
   change-role `<select>`, Rimuovi button. Last-OWNER row: select + remove disabled.
2. **Inviti in sospeso** — per row: name/email, copyable link (`…/invito/<id>`), role badge,
   **▶ Simula accettazione** (`acceptInvitation`) + Revoca (`revokeInvitation`).
3. **Invita un membro** — form name + email + role `<select>` → `inviteMember`, `.pf-flash` confirm.

Reuses `.pf-roster*` rows and the `organizzazione.html` / enroll-link visual patterns.
New role badges styled in `ui.css` (owner=blue, organizer=slate, director=orange).

### `apps/organizer/impostazioni.html`

New **"Membri"** card, shown only when `canManageMembers(currentRole())` (hidden for organizer,
consistent with how Brand is 🔒 on Free).

### Shell — `renderOrganizerWorkspace(event, activeKey)`

- Reads `currentRole()`, filters the tab bar via `allowedTabs(role)`.
- Renders a **role chip** in the hero for non-owner (e.g. "🎽 Director · solo risultati").
- Adds the **"🎭 Agisci come…"** demo lever in the top bar: a `<select>` of org members →
  `actAs(userId)` + reload. Clearly a demo affordance (dashed styling, like "Simula scadenza").
- DIRECTOR: setup/edit actions suppressed on Calendario/Classifiche/Tabellone; result-entry
  panels (`recordResult`, `recordFinalResult`, incl. shootout) remain. No reschedule.

### Restricted pages

Pages an ORGANIZER/DIRECTOR must not reach call `requireRole([...])` at load:
`abbonamento.html`, `organizzazione.html`, `membri.html` → OWNER only; setup/registration/
avvisi-compose pages → OWNER+ORGANIZER. Redirect target = the role's home (director → Calendario).

## Testing (TDD, store-level; suite is 120/120 today)

- `signUp` → creator `OWNER`.
- `inviteMember` → PENDING invitation created with correct fields.
- `acceptInvitation` → new `User` in the org with invited name/email/role; invitation `ACCEPTED`.
- `revokeInvitation` → PENDING removed.
- `changeMemberRole` / `removeMember` → **last-OWNER guard** rejects; succeeds otherwise.
- `actAs` sets session; `currentRole()` default `OWNER` when session null.
- `roles.ts` pure helpers: `allowedTabs` / `canManageMembers` / `canEditBilling` per role.

Visual verification of the 3 surfaces (owner full / organizer without billing-brand-members /
director results-only) via `npm run dev`.

## Blueprint candidate (user commits separately)

**D-O2-1** — Organization owns members with per-tenant roles OWNER/ORGANIZER/DIRECTOR;
onboarding = self-service sign-up (→OWNER) + invitation; DIRECTOR is a restricted-permission
experience (results only), multi-surface (web included, not mobile-only).

## Out of scope

- Real auth (Auth0), real email, public "accept invite" page (chose the demo lever instead).
- Multi-org per user / org-switcher (decided: 1 user = 1 org).
- Seat caps or member-management as a Pro-gated feature (not gated here).
- Platform-ADMIN (E4) as a tenant role — stays the separate `apps/admin/` app, no auth in mockup.
- Logo image upload, member email verification, audit log of role changes.
