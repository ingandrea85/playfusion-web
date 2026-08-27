# Auth0 Organizations — per-tenant isolation (self-service)

**Goal:** every user who signs up gets **their own organization** (isolated data), and is the
**organizer** of it. Today a user without an `org_id` claim falls back to the shared `org-pilot`
org — so a new user sees another organizer's tournaments. This runbook fixes that using the native
**Auth0 Organizations** feature.

> **No app deploy needed.** The code already consumes the token: the backend maps the `org_id`
> claim → `identity.organizationId` (`libs/platform-lib/src/auth0.ts`) and `requireOrganizer`
> checks the `organizer` role in `https://plafusionapi.it/roles`; the SPA reads `org_id` from the
> ID token (`getOrgId`). Once Auth0 puts `org_id` + the role in the tokens, isolation just works.

Tenant: `dev-c6din8ya.eu.auth0.com` · API audience: `https://plafusionapi.it` · roles claim:
`https://plafusionapi.it/roles`.

---

## 1. Enable Organizations
Auth0 Dashboard → **Organizations** → enable. (No need to pre-create orgs — the Action below makes
one per user on first login.)

## 2. Create the `organizer` role (if it doesn't exist)
Dashboard → **User Management → Roles** → create `organizer`. Copy its **Role ID** (`rol_…`) — it
goes into the Action secrets below.

## 3. Machine-to-Machine app for the Management API
The Action needs the Management API to create orgs + assign roles.
- Dashboard → **Applications** → create a **Machine to Machine** app "Actions M2M", authorize it for
  the **Auth0 Management API**.
- Grant scopes: `read:organizations`, `create:organizations`, `read:organization_members`,
  `create:organization_members`, `create:organization_member_roles`, `read:users`, `update:users`.
- Note its **Domain**, **Client ID**, **Client Secret**.

## 4. Post-Login Action
Dashboard → **Actions → Library → Build Custom** → trigger **Login / Post Login**.

**Dependencies:** add `auth0` (latest).
**Secrets:** `DOMAIN`, `CLIENT_ID`, `CLIENT_SECRET` (the M2M app from step 3), `ORGANIZER_ROLE_ID`
(from step 2), `NAMESPACE` = `https://plafusionapi.it`.

```js
const { ManagementClient } = require('auth0');

exports.onExecutePostLogin = async (event, api) => {
  const s = event.secrets;
  const mgmt = new ManagementClient({ domain: s.DOMAIN, clientId: s.CLIENT_ID, clientSecret: s.CLIENT_SECRET });

  // 1. Ensure the user has a personal organization (create it on first login).
  let orgId = event.user.app_metadata && event.user.app_metadata.org_id;
  if (!orgId) {
    const handle = 'u-' + event.user.user_id.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 44);
    const { data: org } = await mgmt.organizations.create({ name: handle, display_name: event.user.name || event.user.email || handle });
    orgId = org.id;
    await mgmt.organizations.addMembers({ id: orgId }, { members: [event.user.user_id] });
    await mgmt.organizations.addMemberRoles({ id: orgId, user_id: event.user.user_id }, { roles: [s.ORGANIZER_ROLE_ID] });
    await mgmt.users.update({ id: event.user.user_id }, { app_metadata: { org_id: orgId } });
  }

  // 2. Put org_id + roles into BOTH tokens:
  //    - access token: the backend reads org_id (isolation) + the organizer role (requireOrganizer);
  //    - id token: the SPA reads org_id + role. IMPORTANT: Auth0 SILENTLY DROPS non-namespaced
  //      custom claims from the ID token, so org_id on the id token MUST be namespaced; the SPA
  //      (getOrgId → orgIdFromClaims) reads `${NAMESPACE}/org_id`.
  api.accessToken.setCustomClaim('org_id', orgId);
  api.idToken.setCustomClaim(`${s.NAMESPACE}/org_id`, orgId);
  api.accessToken.setCustomClaim(`${s.NAMESPACE}/roles`, ['organizer']);
  api.idToken.setCustomClaim(`${s.NAMESPACE}/roles`, ['organizer']);
};
```

**Resolved values for this tenant** (`dev-c6din8ya`): `ORGANIZER_ROLE_ID` = `rol_NTnVlXjIr0R9eC8k`;
use the broad admin M2M already authorized on the Management API as `CLIENT_ID`/`CLIENT_SECRET`
(a least-privilege M2M with only the org/user scopes is preferable long-term).

Then **Deploy** the Action and add it to the **Login** flow (Actions → Flows → Login → drag it in).

## 5. Allowed URLs (both /app and /e1)
In the SPA application settings add, for the CloudFront domain (and later the prod domain):
- **Allowed Callback URLs**: `https://<cf-domain>/app/`, `https://<cf-domain>/e1/`
- **Allowed Logout URLs**: same two
- **Allowed Web Origins**: `https://<cf-domain>`

(Stg CloudFront today: `https://d3hzj24bice4xp.cloudfront.net`.)

## 6. New Universal Login (for `?signup=1`)
Branding → **Universal Login** → set experience to **New** (Classic ignores `screen_hint=signup`),
and ensure **Sign Ups are enabled** on the `Username-Password-Authentication` connection.

---

## Result
- A brand-new user logs in → the Action creates their personal org, assigns `organizer`, and stamps
  `org_id` + role on the tokens.
- Backend: `orgOf` = the token's `org_id` → all reads/writes scoped to that org. `requireOrganizer`
  passes (the user has the `organizer` role in their org).
- SPA: `getOrgId()` returns the real org → no more fallback to `org-pilot`; the user sees only their
  own tournaments; the account badge shows the role.

## Caveat — the demo `org-pilot` data
After this Action, **existing** Auth0 users also get a personal org on next login and will no longer
see the `org-pilot` demo tournaments (those were seeded under `org-pilot` via the bridge token).
Options:
- Keep managing the demo via the seed/bridge path (`x-organization-id: org-pilot`), or
- Pin a specific account to the demo org: in the Action, special-case
  `if (event.user.email === 'you@example.com') orgId = 'org-pilot';` **before** step 2's claims
  (skip creation), or
- Re-seed the demo tournament under your new personal org.
