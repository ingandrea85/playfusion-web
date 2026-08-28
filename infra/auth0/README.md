# Auth0 configuration (tenant `dev-c6din8ya`)

Auth0 is configured **out of band** (Management API / dashboard), not by the CDK pipeline.
This directory keeps version-controlled copies of the tenant artifacts we own so changes are
reviewable and reproducible.

## `pf-provision-org.action.js`

Post-login Action (id `a0687aec-9001-4361-a4af-751acb7657d4`), bound to the `post-login` trigger.
It resolves the caller's organization and injects namespaced `org_id` + `roles` claims. See the
file header for the two-path onboarding logic (T5).

**Deploy** (Management API, M2M app authorized for `update:actions`/`create:actions`):

1. `PATCH /api/v2/actions/actions/{id}` with `{ "code": "<file contents>" }`
2. `POST  /api/v2/actions/actions/{id}/deploy`

**Secrets** (set on the Action, never committed): `DOMAIN`, `CLIENT_ID`, `CLIENT_SECRET`,
`NAMESPACE` (= `https://plafusionapi.it`), `ORGANIZER_ROLE_ID` (legacy).

## Role model (T3/T4)

| Domain role | Auth0 role     | id                     |
|-------------|----------------|------------------------|
| OWNER       | `tenant_admin` | `rol_xdGUCYHML2UISpkB` |
| ORGANIZER   | `organizer`    | `rol_NTnVlXjIr0R9eC8k` |

Directors are not org members — they authenticate via the O2 magic-link flow.
Org DB connection enabled for invitations: `con_LmuclRYAX5VuUMow` (Username-Password-Authentication).
