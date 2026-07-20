# ac — Account & Subscription onboarding

**Data:** 2026-07-21
**Stato:** design approvato, pronto per il piano
**Esperienze toccate:** nuovo ingresso pubblico (sign-up) + E1 Organizer (banner + abbonamento + gating)

## Obiettivo

Dare a Playfusion un percorso commerciale **self-serve trial-first ibrido**: un
utente si registra senza carta, ottiene subito un'organizzazione in **prova Pro**
(14 giorni), usa il sistema, e alla scadenza **degrada a Free limitato** (mai
lock) con leve chiare verso l'acquisto di Pro. Scopo: portare dentro l'utente,
poi convertirlo a pagamento.

Deriva da un brainstorming (con companion visuale): flusso a 5 passaggi
validato — landing → sign-up minimo → workspace in prova → scadenza → Free
limitato → schermo piani/acquisto.

## Modello dati (`shared/mock/types.ts`, `store.ts`, `seed.ts`)

- **`User`**: `{ id: string; name: string; email: string; organizationId: string; role: 'ADMIN' }` — l'account creato al sign-up (primo admin del tenant).
- **`Session`**: `{ userId: string; organizationId: string }` — l'utente/organizzazione attivi. Concetto nuovo (oggi assente). `State.session: Session | null`.
  - Default: se `session === null`, l'org attiva è `org-1` (seed esistente) → i demo attuali restano invariati.
  - Il sign-up crea una nuova org e imposta la sessione su di essa.
- **`Subscription`** (già esistente `{ organizationId, plan, status, renewsOn }`), usata per il ciclo:
  - sign-up → `{ plan: 'PRO', status: 'TRIAL', renewsOn: <oggi + 14gg> }`
  - scadenza → `{ plan: 'FREE', status: 'ACTIVE' }`
  - upgrade → `{ plan: 'PRO', status: 'ACTIVE' }`

### Funzioni store
- `signUp(input: { name: string; email: string; orgName: string }): { user: User; organization: Organization }` — crea `User` + `Organization` (status ACTIVE, `modules: ['M-Core','M-Compete','M-Broadcast','M-Payments']` perché in prova Pro) + `Subscription` trial (renewsOn = oggi+14gg) + imposta `Session`. Id max-based.
- `getSession(): Session | null`, `getCurrentOrgId(): string` (session?.organizationId ?? 'org-1'), `logout(): void`.
- `activatePro(orgId: string): void` — `plan: 'PRO', status: 'ACTIVE'`; assicura moduli Pro (aggiunge M-Broadcast, M-Payments).
- `expireTrial(orgId: string): void` — `plan: 'FREE', status: 'ACTIVE'`; riduce i moduli a `['M-Core','M-Compete']` (demo/scadenza).
- `trialDaysLeft(orgId: string): number` — giorni interi tra oggi e `renewsOn` (0 se passato); solo significativo se status TRIAL.
- `planOf(orgId: string): PlanKey` helper.

## Schermi

### Sign-up — `apps/account/signup.html` + `signup.ts` (nuovo)
- Landing sobria "Prova gratis · nessuna carta richiesta" + form **3 campi** (nome, email, nome organizzazione) → `signUp` → redirect a `dashboard.html` (dashboard org-scoped della nuova org, con empty-state "crea il primo torneo"). Nota: non `event-hub.html`, che senza `?event=` ricadrebbe su `evt-1` mostrando un evento di un'altra org.
- Auth **finta** (niente password, niente Auth0). Validazione minima (campi non vuoti, email con `@`).
- Entry "Prova gratis" aggiunta nell'hub `index.html`.
- Registrata in `vite.config.ts`.

### Abbonamento — `apps/organizer/abbonamento.html` + `abbonamento.ts` (nuovo)
- Vista abbonamento della **org attiva**: piano/stato correnti + confronto **Free / Pro / Business**.
- **Free**: attivo/limiti elencati. **Pro**: bottone **Attiva Pro** → pagamento finto → `activatePro` → torna con stato Active. **Business**: card placeholder "Contattaci" (nessuna logica).
- Raggiungibile dal banner e da ⚙ Impostazioni dello shell.
- Registrata in `vite.config.ts`.

### Banner abbonamento — nello shell `renderOrganizerWorkspace`
Basato sulla `Subscription` di `event.organizationId`:
- `TRIAL` → `✨ Pro in prova · N giorni rimasti — Attiva Pro` + link "Simula scadenza" (demo, chiama `expireTrial`).
- `FREE` → `Sei su Free — Passa a Pro`.
- `PRO`/`ACTIVE` → nessun banner.
Il banner è una striscia sotto l'hero, prima delle tab (o subito dopo), con classi esistenti.

## Gating (placeholder — packaging reale deferito, Product Catalog First)

- **Cap eventi (create-event)**: se `planOf(currentOrg) === 'FREE'` e nell'org esiste già ≥1 evento **attivo** (`eventPhase !== 'DONE'`), bloccare la creazione con messaggio + link ad `abbonamento`. Pro/Business → illimitati. Un evento concluso (DONE) non conta.
- **Moduli**: Free ha `['M-Core','M-Compete']`. Le pagine **payments** (Riscuoti quote) e **avvisi** (M-Broadcast) su un'org senza il modulo mostrano uno stato bloccato (🔒 "Richiede Pro") con link ad `abbonamento`, al posto del contenuto. Pro sblocca entrambe.
  - Helper `hasModule(orgId, key)` in store per il check.

## Dominio (Blueprint — da registrare)

Coerente con il Blueprint esistente:
- O1 `OrganizationCreated` → O11 provisiona la **Subscription in Trial**.
- O11 `SubscriptionActivated` (all'upgrade) → O1 sblocca/gate le capability del tenant.
- O2 possiede `User`/sessione; Auth0 è IdP esterno (qui finto).

Decisione candidata **D-O11-2** — *Trial-first ibrido*: un nuovo tenant nasce in
**Trial di Pro** (14gg), degrada a **Free limitato** alla scadenza (mai lock);
leve di conversione = **cap di 1 evento attivo** + **moduli M-Broadcast/M-Payments**
riservati a Pro. Prezzi e packaging restano deferiti (ADR-007). Origine: mockup
`playfusion-web`. (La scrittura effettiva nel Blueprint è committata dall'utente,
repo separato.)

## Test — `shared/mock/account.test.ts`

Scenario-driven (reset seed):
- `signUp` crea User + Organization + Subscription `{PRO, TRIAL, renewsOn +14}` + Session sulla nuova org; `getCurrentOrgId` la riflette.
- default: senza sessione, `getCurrentOrgId() === 'org-1'`.
- `expireTrial` → `{FREE, ACTIVE}`, moduli ridotti a core+compete.
- `activatePro` → `{PRO, ACTIVE}`, moduli includono M-Broadcast + M-Payments.
- `trialDaysLeft` ~14 dopo il sign-up, 0 dopo scadenza.
- cap eventi Free: `hasModule`/regola cap — con org Free e 1 evento attivo la regola blocca il 2º; un evento DONE non conta (verificato via `eventPhase`).
- Suite esistente resta verde (session default = org-1 non rompe i demo).

## Fuori scope (YAGNI)

Password/Auth0 reali, verifica email, pagamento reale, fattura elettronica IT,
proration, dettaglio piano Business, **inviti multi-utente** per org (fetta O2
separata), i prezzi.

## Naming

Tag di fetta **`ac`**.
