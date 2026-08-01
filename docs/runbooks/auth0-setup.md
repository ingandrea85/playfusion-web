# Runbook — Auth0 setup for organizer login (S2.1)

Playfusion authenticates **organizers** with Auth0 (real login) and **coaches** with an
O2 magic-link (no signup). This runbook covers the Auth0 side, which is a **user
prerequisite** — the backend (S2.2 verifier, S2.4 enforcement) is already in place and
consumes the config below.

Until a tenant exists, `env/{stg,pr}.json` ship `auth0.issuer`/`audience` **empty**, so
the `requireOrganizer` middleware stays on the **magic-link bridge** (an O2
`RegistrationManager` token authorizes organizer mutations). Filling these values and
redeploying flips organizers to the real Auth0 path — the bridge keeps working until you
remove it in a later slice.

## 1. Create the Auth0 tenant

1. Sign up / log in at <https://auth0.com> and create a tenant (region **EU** to match
   `eu-south-1`), e.g. `playfusion-stg`.

## 2. Create the API (audience)

1. **Applications → APIs → Create API.**
2. Name: `Playfusion API`. Identifier (audience): e.g. `https://api.playfusion/`
   (this is the `AUTH0_AUDIENCE` — it need not be a real URL, but must match exactly).
3. Signing algorithm: **RS256**.

## 3. Create the SPA application (E1 organizer)

1. **Applications → Applications → Create Application → Single Page Application.**
2. Note the **Domain** (e.g. `playfusion-stg.eu.auth0.com`) and **Client ID** (the SPA
   uses the Client ID; the backend never does).
3. Configure URLs for the E1 app (arrives in S3):
   - **Allowed Callback URLs / Web Origins / Logout URLs** → the E1 origin
     (e.g. the CloudFront `e1/*` URL, and `http://localhost:5173` for dev).

## 4. Expose roles + org as token claims

The verifier reads roles from a namespaced custom claim and the org from `org_id`.

1. Give organizers a role/permission that surfaces as `organizer` in the token.
2. Add an **Action** (Login flow) that copies roles into the namespaced claim:
   ```js
   exports.onExecutePostLogin = async (event, api) => {
     const ns = 'https://playfusion/roles';
     api.accessToken.setCustomClaim(ns, event.authorization?.roles ?? []);
   };
   ```
   (Matches `AUTH0_ROLES_CLAIM`. If you use Auth0 Organizations, `org_id` is included
   automatically; otherwise set a custom `org_id` claim the same way.)

## 5. Wire the config into the deploy

Fill the (currently empty) block in `infra/cdk/env/stg.json` (and `pr.json`):

```json
"auth0": {
  "issuer": "https://playfusion-stg.eu.auth0.com/",   // trailing slash REQUIRED
  "audience": "https://api.playfusion/",
  "rolesClaim": "https://playfusion/roles",
  "orgClaim": "org_id"
}
```

`jwksUri` defaults to `${issuer}.well-known/jwks.json`; set it only to override.
The CDK `ApiStack` injects these as `AUTH0_*` env vars into every BC Lambda, where
`auth0ConfigFromEnv()` picks them up. Redeploy: `cdk deploy playfusion2-api-stg -c env=stg`.

### Shared magic-link secret (bridge + coach links)

The coach magic-link (and the organizer bridge) is an HMAC signed with `PF_TOKEN_SECRET`.
For the bridge to verify tokens across BCs in a deployed env, all BC Lambdas must share
one secret. Set it at deploy time (never commit it):

```bash
PF_TOKEN_SECRET=$(openssl rand -hex 32) cdk deploy playfusion2-api-stg -c env=stg
```

Absent, every BC falls back to the `dev-secret` default (fine locally, not for prod).

## 6. Verify (S2.1 acceptance)

- Organizer logs in through the E1 SPA (S3) → receives an RS256 JWT for the audience with
  the `organizer` role claim.
- A protected mutation (e.g. `POST /o3/events`) with that JWT succeeds; without it → 401;
  with a valid token lacking the `organizer` role → 403.
- Coach flow is unaffected: `POST /o2/identities/magic-link` mints a link; that token
  authorizes `POST /o5/registrations` and nothing else.

> Live end-to-end login verification is deferred until the tenant exists **and** the E1
> SPA (S3) is built; S2.1 delivers the tenant-agnostic backend config + this runbook.
