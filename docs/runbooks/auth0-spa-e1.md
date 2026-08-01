# Runbook — Auth0 SPA config for E1 (organizer login) — S3.4

This runbook picks up where [`auth0-setup.md`](./auth0-setup.md) (S2.1) left off. That
runbook created a tenant from scratch; this one documents the **recycled** tenant that
S3 actually wires in, plus the two operator actions still needed before a live login can
complete: adding E1's origins to the tenant, and assigning the `organizer` role to a test
user.

## 1. The recycled tenant (already filled into config)

Tenant, API and roles-claim namespace are **reused** rather than created fresh. These are
non-secret SPA/public identifiers — safe to read in this doc and to bake into `.env`
files and the CDK env config:

| Value | |
|---|---|
| Auth0 domain / issuer | `https://dev-c6din8ya.eu.auth0.com/` |
| API audience | `https://plafusionapi.it` |
| SPA Client ID (E1) | `65atFepkIh2jiMeaDqZlqgD63ccd2Gw1` |
| Roles claim | `https://plafusionapi.it/roles` (values are **lowercase**, e.g. `organizer`) |
| Org claim | `org_id` |

These are already filled in two places:

- **Backend**: `infra/cdk/env/stg.json` → `auth0.issuer` / `auth0.audience` /
  `auth0.rolesClaim` / `auth0.orgClaim`. This is what turns on real Auth0 JWT
  verification for `requireOrganizer` on collaudo (previously empty, so the middleware
  fell back to the O2 magic-link bridge — see `auth0-setup.md` §"Until a tenant
  exists…"). `rolesClaim` matches this tenant's namespace, and `requireOrganizer`'s
  default `organizerRole: 'organizer'` already matches the tenant's lowercase role
  value, so no code change is needed on that side.
- **Frontend**: `apps/e1-web/.env.example` → `VITE_AUTH0_DOMAIN` / `VITE_AUTH0_CLIENT_ID`
  / `VITE_AUTH0_AUDIENCE`. Copy it to `.env.local` to pick these up
  (`cp apps/e1-web/.env.example apps/e1-web/.env.local`); the org claim (`org_id`) is
  hard-coded as `ORG_CLAIM` in `apps/e1-web/src/auth/auth0.ts` since it isn't
  env-configurable today.

## 2. MANUAL step — add E1's origins to the tenant (dashboard)

**This step cannot be scripted from this repo — it requires operator access to the
Auth0 dashboard for the `dev-c6din8ya` tenant.** Until it's done, the Auth0 redirect
will fail (`Callback URL mismatch`) for both local dev and the deployed CloudFront site.

1. Log in to the Auth0 dashboard for the `dev-c6din8ya` tenant.
2. **Applications → Applications →** the SPA application with Client ID
   `65atFepkIh2jiMeaDqZlqgD63ccd2Gw1`.
3. E1 (`apps/e1-web`) is served under the `/e1/` base path both locally (Vite `base:
   '/e1/'`, see `apps/e1-web/vite.config.ts`) and behind CloudFront
   (`apps/e1-web/src/auth/auth0.ts` builds `redirect_uri` as
   `${window.location.origin}/e1/`). Add, for **each** environment you need (at minimum
   local dev; add the deployed CloudFront domain once it's known):

   | Setting | Value |
   |---|---|
   | Allowed Callback URLs | `http://localhost:5173/e1/`, `https://<cloudfront-domain>/e1/` |
   | Allowed Logout URLs | `http://localhost:5173/e1/`, `https://<cloudfront-domain>/e1/` |
   | Allowed Web Origins | `http://localhost:5173`, `https://<cloudfront-domain>` |

   (`<cloudfront-domain>` is the distribution created by Task 10 / the Hosting stack —
   look it up via `cdk deploy` output or the CloudFront console for the `stg` env once
   deployed.)
4. Save changes.

Without this step, `loginWithRedirect()` (in `ensureAuthenticated`, called from
`apps/e1-web/src/main.ts`) will redirect to Auth0 but the subsequent redirect back to the
app will be rejected by Auth0 with a callback-URL mismatch — the SPA never receives its
`code`/`state` params, so `handleRedirectCallback()` never runs.

## 3. Assign the `organizer` role to a test user

The rest-client/backend enforce `requireOrganizer` against the `https://plafusionapi.it/roles`
claim (see `infra/cdk/lib/api-stack.ts` → `AUTH0_ROLES_CLAIM`), expecting the lowercase
value `organizer` in the array.

1. **Auth0 dashboard → User Management → Users** → pick (or create) a test user.
2. Assign a role/permission that this tenant's login Action copies into the namespaced
   claim as `organizer` (lowercase) — follow the same Action pattern as
   `auth0-setup.md` §4, but with this tenant's namespace:

   ```js
   exports.onExecutePostLogin = async (event, api) => {
     const ns = 'https://plafusionapi.it/roles'
     api.accessToken.setCustomClaim(ns, event.authorization?.roles ?? [])
   }
   ```

3. Verify the user's role list resolves to (contains) the string `organizer` — case
   matters, the backend does not case-fold.
4. If you use Auth0 Organizations, `org_id` is included automatically; otherwise mirror
   it in the same Action as a custom claim.

## 4. Pointing E1 at a backend

E1 always needs a backend — Auth0 only gates the login, it doesn't serve data.

- `apps/e1-web/.env.example` → copy to `.env.local`
  (`cp apps/e1-web/.env.example apps/e1-web/.env.local`).
- Set `VITE_API_BASE_URL` to either:
  - a locally running stack (`npm run stack:up` + service handlers) — typically
    `http://localhost:3000`, the `.env.example` default; or
  - a deployed API Gateway URL for `stg` (from the `ApiStack` CDK output) — the org used
    is `VITE_DEFAULT_ORG_ID` (defaults to `org-pilot` in `.env.example`; change it to
    match a real seeded org when pointing at a deployed backend).
- `npm run serve -w @playfusion/e1-web` picks up `.env.local` via Vite's standard env
  loading.

## 5. What "done" looks like (deferred verification)

Once §2 and §3 are complete and a backend is reachable:

1. `npm run serve -w @playfusion/e1-web`, open `http://localhost:5173/e1/`.
2. `ensureAuthenticated` finds no session → `loginWithRedirect()` fires → Auth0 login
   page loads (no callback-mismatch error).
3. Log in as the test user from §3 → redirected back to `/e1/` → `handleRedirectCallback()`
   consumes `code`/`state` → dashboard renders.
4. A call through `authProviderFrom` (Bearer token from `getTokenSilently()`) against an
   organizer-only endpoint (e.g. `POST /o3/events`) succeeds; the same call without a
   token returns 401; with a token lacking the `organizer` role, 403.

This full login flow is **not yet executed** as of S3 — it depends on §2 (operator adding
`http://localhost:5173/e1/` to the tenant) and a running/reachable backend, neither of
which is available in this pass. Track it as a checklist item for the next session that
has dashboard access and a live backend.
