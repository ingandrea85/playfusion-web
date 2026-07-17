# Design — E4 Admin: tenant monitoring (A) — O1

- **Data:** 2026-07-17
- **Stato:** approvato in brainstorming
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-web-mockups]]; Blueprint `o1-organization-management.md`. Segue: E4b billing (round successivo).

## Contesto e obiettivo

Prima fetta di **E4 Administration Experience** (P0 Platform Administrator, desktop-only, back-office Playfusion): monitorare i **tenant (Organizations)**. Introduce la multi-tenancy nel mock (finora mono-tenant): entità `Organization`, lista + dettaglio, stato Attiva/Sospesa, attivazione moduli, conteggio eventi. Mockup mid-fi, look Matchday, nessun backend.

## Scope (E4a)

**Incluso:** entità `Organization` + seed; retrofit `TournamentEvent.organizationId`; app `apps/admin/` con lista + dettaglio organizzazioni; azioni sospendi/riattiva + attiva/disattiva moduli; card "E4 Admin" nell'hub.

**Non incluso (→ E4b):** billing/abbonamenti, fattura elettronica IT, tier/prezzi; creazione/eliminazione tenant; login/auth reale.

## Modello (mock store)

```
OrgStatus = 'ACTIVE' | 'SUSPENDED'
Organization { id: string; name: string; status: OrgStatus; modules: string[] }
```
- `State.organizations: Organization[]`.
- `TournamentEvent` guadagna `organizationId: string`. Seed: `evt-1.organizationId = 'org-1'`. `createEvent` assegna `organizationId: 'org-1'` di default (nessun contesto org in E1).
- Moduli (chiavi): `M-Core` (sempre attivo, non disattivabile), `M-Compete`, `M-Broadcast`, `M-Payments`, `M-Billing`. Etichette leggibili in vista.
- Seed organizations (4):
  - `org-1` "ASD Memorial Rivalta" — ACTIVE — `['M-Core','M-Compete','M-Broadcast','M-Payments']`
  - `org-2` "Polisportiva Chierese" — ACTIVE — `['M-Core','M-Compete']`
  - `org-3` "US Basse Valle" — SUSPENDED — `['M-Core','M-Compete','M-Broadcast']`
  - `org-4` "GS Collina Padel" — ACTIVE — `['M-Core','M-Compete','M-Payments','M-Billing']`
- Conteggio eventi per org = `getEvents().filter(e => e.organizationId === orgId).length` (solo `org-1` ha `evt-1`; le altre 0 → **E1 dashboard invariata**).

## Store

- `getOrganizations(): Organization[]`
- `getOrganization(id): Organization | undefined`
- `setOrgStatus(id, status: OrgStatus): void`
- `setOrgModule(id, moduleKey, active): void` — no-op per `M-Core` (sempre attivo); aggiunge/rimuove la chiave da `modules`.
- Reset demo ripristina il seed.

## Schermate (`apps/admin/`)

Barra admin dedicata: `renderAdminTopbar()` in `chrome.ts` → wordmark "play<b>fusion</b> · Admin" + link "Esci demo". Look Matchday, desktop-first.

- `organizations.html` / `.ts` — **lista**: testata "Back-office · Organizzazioni"; per società una card/riga: nome, **badge stato** (Attiva verde / Sospesa rosso), **chip moduli**, "N eventi", link a `organization.html?org=<id>`.
- `organization.html` / `.ts` — **dettaglio**: nome, badge stato, **pulsante Sospendi/Riattiva**, sezione **Moduli** con un toggle per modulo (M-Core disabilitato/checked), "N eventi". Azioni chiamano `setOrgStatus`/`setOrgModule` + re-render.
- Hub `index.html`: nuova card "E4 · Admin" → `apps/admin/organizations.html`.
- Registrare le due pagine come input in `vite.config.ts`.

## Blueprint

Nessuna decisione nuova: E4a **implementa** concetti O1 già nel Blueprint (Organization lifecycle Active/Suspended, `ModuleActivation`, M-Core mandatory — [[playfusion-2-0-product-decisions]]). Se emerge qualcosa di nuovo in fase, si registra; altrimenti nessun edit al Blueprint per questa fetta.

## Criteri di successo

1. Dall'hub → "E4 · Admin" → lista con le 4 società, badge stato, chip moduli, conteggio eventi (org-1 = 1, altre = 0).
2. Dettaglio: Sospendi/Riattiva cambia lo stato (persistito); attiva/disattiva un modulo aggiorna i chip; M-Core non disattivabile.
3. E1/E3 restano invariati (le altre org non hanno eventi reali; dashboard organizer identica). Test store verdi (nuovo test organizations).
4. "Reset demo" ripristina stati/moduli seed. Look coerente Matchday.

## Fuori scope / futuro

E4b (billing/abbonamenti/fattura IT); creazione tenant; monitoring avanzato (usage, metriche); auth P0.
