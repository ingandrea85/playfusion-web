# PlayFusion 2.0 — Documentation

Welcome. This is the documentation hub for `playfusion-web`. It starts at the
project [`README.md`](../README.md) (quick start) and links out to everything
else. Use the map below to navigate.

## Start here

| If you want to… | Read |
|-----------------|------|
| Clone, install, and run the project | [`../README.md`](../README.md) |
| Understand how the system is built and why | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| See the design rationale for a specific feature slice | [`superpowers/specs/`](superpowers/specs/) |
| See the implementation plan for a slice | [`superpowers/plans/`](superpowers/plans/) |

## Architecture — section map

The full reference is [`ARCHITECTURE.md`](ARCHITECTURE.md). Jump straight to a topic:

1. [What this project is](ARCHITECTURE.md#1-what-this-project-is) — vision + governing ADRs (002 / 011 / 012)
2. [Monorepo layout](ARCHITECTURE.md#2-monorepo-layout) — `apps/libs/services/infra` + toolchain
3. [Architectural style](ARCHITECTURE.md#3-architectural-style) — bounded contexts, the two entrypoints, hexagonal reference
4. [The shared kernel — `platform-lib`](ARCHITECTURE.md#4-the-shared-kernel--libsplatform-lib)
5. [Runtime data flow](ARCHITECTURE.md#5-runtime-data-flow) — command → domain event → consumer
6. [Naming & environments](ARCHITECTURE.md#6-naming--environments-adr-012) — `playfusion2-<base>-<env>`
7. [Local development infrastructure](ARCHITECTURE.md#7-local-development-infrastructure) — LocalStack + provisioning
8. [Boundary enforcement](ARCHITECTURE.md#8-boundary-enforcement) — no cross-BC imports
9. [The PB-1 workflow](ARCHITECTURE.md#9-the-pb-1-workflow-bundle-enrollment) — Bundle Enrollment
10. [Testing](ARCHITECTURE.md#10-testing) — unit vs integration
11. [Command reference](ARCHITECTURE.md#11-command-reference)
12. [Current status & roadmap](ARCHITECTURE.md#12-current-status--roadmap)

## Codebase map

Where each concept lives, with links straight into the tree:

| Area | Path | Notes |
|------|------|-------|
| Bounded Contexts (backend) | [`services/`](../services/) | `o2` identity, `o3` sport-events, `o4` participants, `o5` registration (hexagonal reference), `o12` payments |
| Shared runtime kernel | [`libs/platform-lib/`](../libs/platform-lib/) | correlation, events, logging, dynamo, idempotency, naming |
| Design system (PS-B) | [`libs/tokens/`](../libs/tokens/) · [`libs/ui/`](../libs/ui/) | Style-Dictionary tokens + `pf-*` Web Components + Storybook (S0.5) |
| Experience SPAs (S6+) | [`apps/`](../apps/) | `sample-web` PS-B harness today; E1/E3/E4 from S6 |
| AWS CDK (S0.6+) | [`infra/`](../infra/) | placeholder today |
| PB-1 orchestration | [`workflow/`](../workflow/) | Step Functions ASL + local-orchestrator fallback |
| Local provisioning | [`scripts/provision.ts`](../scripts/provision.ts) | tables + event bus on LocalStack |
| Cross-BC / acceptance tests | [`test/`](../test/) | integration + pilot acceptance |
| UI reference | [`mockups/`](../mockups/) | `npm run mockups` → :5173 |

## Design specs & plans

Every feature slice has a design spec (the *why*) and an implementation plan (the
*how*), one per slice, under [`superpowers/`](superpowers/). Browse the folders:

- [`superpowers/specs/`](superpowers/specs/) — design specs
- [`superpowers/plans/`](superpowers/plans/) — implementation plans

Highlights: `s0.1-monorepo-scaffold` (the monorepo foundation), the `o6`/`o7`/`o8`
competition slices (config, scheduling, standings, finals bracket with tie-break /
shootout / third place), `ac` (account & subscription), `br` (organization brand),
`mb` (membership & roles), `db` (event dashboard), `rs` (event resources).

## Governing decisions (ADRs)

The architecture is anchored on Architecture Decision Records. They are summarized
in [`ARCHITECTURE.md` §1](ARCHITECTURE.md#1-what-this-project-is):

- **ADR-002** — REST + one Lambda per Bounded Context + EventBridge + Step Functions; no cross-BC imports.
- **ADR-011** — `playfusion-web` monorepo, Nx over npm workspaces, `apps/libs/services/infra`.
- **ADR-012** — CDK + GitHub Actions deploy; `playfusion2-<base>-<env>` naming; `eu-south-1`.
