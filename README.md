# playfusion-web

PlayFusion 2.0 monorepo (ADR-011). Nx on top of npm package-manager workspaces.

## Layout

| Path         | Purpose                                                   | Populated in |
|--------------|-----------------------------------------------------------|--------------|
| `apps/`      | Experience SPAs (E1 organizer, E3 public, E4 admin…)      | S6+ (`sample-web` since S0.5) |
| `libs/`      | `platform-lib` kernel + PS-B design system (`tokens`, `ui`) | S0.2 / S0.5  |
| `services/`  | Bounded Contexts migrated from the pilot                  | S0.2         |
| `infra/`     | AWS CDK (ADR-012)                                          | S0.6+        |
| `mockups/`   | Mid-fidelity mockups — kept as runnable reference         | —            |

`infra/` still holds a single `_placeholder` package so the workspace resolves and
`build`/`test`/`lint` run end-to-end; placeholders are deleted as real content lands.

## Commands

```bash
npm install            # resolve all workspaces
npm run build          # nx run-many -t build
npm test               # backend unit tests (vitest)
npm run lint           # nx run-many -t lint  (enforces ADR-011 module boundaries)
npm run graph          # nx project graph
npm run mockups        # serve the mockups (front-end reference) on :5173
npm run tokens:build   # regenerate PS-B design tokens (Style-Dictionary)
npm run storybook      # serve the PS-B component gallery on :6006
npm run build-storybook  # build the static Storybook
```

### Frontends (S3)

- E1 (organizer): `cp apps/e1-web/.env.example apps/e1-web/.env.local` then
  `npm run serve -w @playfusion/e1-web` (Auth0 login gate; add localhost to the tenant's
  allowed URLs — see [docs/runbooks/auth0-spa-e1.md](docs/runbooks/auth0-spa-e1.md)).
- E3 (public): `npm run serve -w @playfusion/e3-web` — open `#/events/<id>`; coaches
  arrive via `?token=<magic-link>`.
- Both need a backend: set `VITE_API_BASE_URL` to the deployed API or a local stack.
- S4 (E1 Bundle Enrollment): the full organizer flow — dashboard → create event → open a
  registration window with a per-category cap → copy the shareable link → confirm/reject
  from the Iscrizioni inbox → Partecipanti tab with fee status → mark a fee paid — is now
  in `apps/e1-web` (view-controller screens over `libs/rest-client`'s `o5`/`o12` methods).

## Development

A devcontainer (`.devcontainer/`, Node 20) and VS Code tasks (`.vscode/tasks.json`,
including **Front-end: serve**) are provided. Open the folder in a container, or run the
commands above on Node 20.

## Documentation

This README is the entry point. Start at the **[documentation hub](docs/README.md)**,
which links everything together:

- **[docs/README.md](docs/README.md)** — documentation index / map.
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the system is built and why
  (monorepo, bounded contexts, event flow, shared kernel, local infra, testing).
- **[docs/superpowers/specs/](docs/superpowers/specs/)** — per-slice design specs.
- **[docs/superpowers/plans/](docs/superpowers/plans/)** — per-slice implementation plans.
