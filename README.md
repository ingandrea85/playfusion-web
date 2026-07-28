# playfusion-web

PlayFusion 2.0 monorepo (ADR-011). Nx on top of npm package-manager workspaces.

## Layout

| Path         | Purpose                                              | Populated in |
|--------------|------------------------------------------------------|--------------|
| `apps/`      | Experience SPAs (E1 organizer, E3 public, E4 admin…) | S6+          |
| `libs/`      | PS-B design system (tokens, ui — Lit) + `rest-client`| S0.5         |
| `services/`  | Bounded Contexts migrated from the pilot             | S0.2         |
| `infra/`     | AWS CDK (ADR-012)                                     | S0.6+        |
| `mockups/`   | Mid-fidelity mockups — kept as runnable reference    | —            |

Each layer currently holds a single `_placeholder` package so the workspace resolves and
`build`/`test`/`lint` run end-to-end. Placeholders are deleted as real content lands.

## Commands

```bash
npm install         # resolve all workspaces
npm run build       # nx run-many -t build
npm test            # nx run-many -t test
npm run lint        # nx run-many -t lint  (enforces ADR-011 module boundaries)
npm run graph       # nx project graph
npm run mockups     # serve the mockups (front-end reference) on :5173
```

## Development

A devcontainer (`.devcontainer/`, Node 20) and VS Code tasks (`.vscode/tasks.json`,
including **Front-end: serve**) are provided. Open the folder in a container, or run the
commands above on Node 20.

See `docs/superpowers/specs/` for design specs.
