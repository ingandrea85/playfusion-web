# Design — PB-2 "Iscrizione diretta" + editor Squadre — O5/E1

- **Data:** 2026-07-17
- **Stato:** approvato in brainstorming
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-web-mockups]]. Blueprint O5 (Registration), E1. Alternativa al playbook PB-1 (Bundle Enrollment).

## Contesto e obiettivo

Oggi le squadre entrano solo via **PB-1** (l'organizzatore apre le iscrizioni + link condivisibile → il referente iscrive in E3 → inbox → conferma). Aggiungiamo **PB-2 "Iscrizione diretta"**: nessun invito, è l'**organizzatore** a inserire le squadre in E1, tramite una schermata **Squadre** dedicata (aggiungi / rinomina / modifica contatti / rimuovi). Mockup mid-fi.

## Scope

**Incluso:** campo `event.playbook: 'PB-1' | 'PB-2'`; scelta del playbook in crea-evento; schermata Squadre (`teams.html`); store `addTeam`/`updateTeam`/`removeTeam` (con pulizia `GroupSlot`); gating hub E1 per playbook; pubblico E3 senza form di iscrizione in PB-2; evento demo `evt-direct`; Blueprint D-O5-2.

**Non incluso:** import CSV/bulk; quote/pagamenti in PB-2; conversione di un evento da un playbook all'altro dopo la creazione; modifica del playbook in E3.

## Modello

`TournamentEvent` guadagna `playbook: 'PB-1' | 'PB-2'` (default `'PB-1'`). Le squadre riusano `Registration`. In PB-2 una squadra è **`status: 'CONFIRMED'`** all'inserimento (niente ciclo PENDING→conferma; niente `RegistrationWindow`/link). `paymentStatus` resta `'UNPAID'` (le quote non sono uno step di PB-2). `createdAt` valorizzato dallo store.

## Store

- `addTeam(eventId, categoryId, teamName, contacts?: { contactName?: string; contactPhone?: string; contactEmail?: string }): Registration` — crea una `Registration` `CONFIRMED`/`UNPAID` con id fresco (schema id coerente con `addRegistration`); i contatti mancanti sono stringa vuota.
- `updateTeam(regId, patch: { teamName?: string; categoryId?: string; contactName?: string; contactPhone?: string; contactEmail?: string }): void` — aggiorna i campi forniti.
- `removeTeam(regId): void` — elimina la `Registration` **e** i `GroupSlot` di quella squadra in quell'evento (per team name + eventId), così `resolveGroups`/generazione ripartono da un roster coerente.
- `createEvent` accetta `playbook?: 'PB-1' | 'PB-2'` (default `'PB-1'`).

`addTeam`/`updateTeam`/`removeTeam` sono utilizzabili per entrambi i playbook, ma sono lo strumento primario di PB-2. Non alterano il flusso PB-1 esistente (`addRegistration` PENDING + `confirmTeam` restano).

## Schermata Squadre (`apps/organizer/teams.html` + `teams.ts`)

- Elenco squadre **raggruppate per categoria**; per ogni squadra: nome + contatti, bottoni **Modifica** e **Rimuovi**.
- **Modifica** apre un pannello inline (nome, categoria, referente/telefono/email) che salva via `updateTeam`.
- Form **"Aggiungi squadra"**: select categoria + nome (obbligatorio) + contatti opzionali → `addTeam`.
- **Rimuovi** chiama `removeTeam` (con conferma leggera).
- Coerente con lo stile esistente (card, `pf-*`); interazione mobile-friendly.

## Crea-evento

Il selettore **Template** diventa **Playbook** con due opzioni: `PB-1 · Iscrizione con inviti` (default) e `PB-2 · Inserimento diretto squadre`. Il valore scelto è passato a `createEvent({ …, playbook })`.

## Hub E1 (gating per playbook)

`event-hub.ts` costruisce gli step in base a `event.playbook`:
- **PB-1** (invariato): "Apri iscrizioni" (`registrations.html`), "Conferma squadre" (`inbox.html`), "Riscuoti quote" (`payments.html`).
- **PB-2**: quei tre step sono sostituiti da un unico **"Inserisci squadre"** → `teams.html` (done quando ≥1 squadra confermata). Gli altri step (categorie, competizione, gironi, calendario, approva, pubblica) identici.

## Pubblico E3

In **PB-2** la landing pubblica **non** mostra il form "iscrivi la tua squadra" né alcun link di iscrizione (non esistono inviti); mostra il torneo e le squadre in sola lettura. In PB-1 tutto invariato. La pagina partecipanti resta identica (elenca le squadre confermate) per entrambi.

## Evento demo

`evt-direct` — **Demo · Iscrizione diretta** (playbook `PB-2`): una o due categorie con qualche squadra già **inserita direttamente** (registrazioni `CONFIRMED`), **senza** gironi/calendario generati. Consente di aprire Squadre, modificarne una, aggiungerne/rimuoverne, poi comporre i gironi e generare. Appare come card nella dashboard organizer (che elenca tutti gli eventi).

## Revisione Blueprint

**D-O5-2** (`o5-registration.md`): la registrazione ha **due modalità**, legate al playbook dell'evento. **PB-1 (invito):** `RegistrationWindow` + link condivisibile + ciclo `PENDING → CONFIRMED` (referente iscrive in E3). **PB-2 (roster diretto):** l'organizzatore inserisce i partecipanti in E1; sono `CONFIRMED` all'inserimento, senza finestra/link/conferma né quote. Entrambe producono lo stesso partecipante confermato consumato a valle da O6/O7. Le regole di cap per-categoria (D-O5-1) valgono comunque quando definite.

## Criteri di successo

1. Creando un evento PB-2, l'hub mostra "Inserisci squadre" (non gli step iscrizioni/conferma/quote) e la landing pubblica non ha form d'iscrizione.
2. La schermata Squadre aggiunge / rinomina / cambia categoria / modifica contatti / rimuove una squadra; le squadre aggiunte sono `CONFIRMED`.
3. Rimuovendo una squadra, i suoi `GroupSlot` spariscono; ricomponendo/rigenerando, gironi/classifiche/tabellone riflettono il roster aggiornato.
4. Il flusso PB-1 esistente (inviti/inbox/quote/E3) resta invariato; `evt-1` e i demo restano PB-1. Il demo `evt-direct` mostra il flusso PB-2. Test verdi (addTeam/updateTeam/removeTeam + cleanup GroupSlot + demo PB-2); suite + build + `tsc` puliti.

## Fuori scope / futuro

Import CSV/bulk; quote in PB-2; cambio di playbook post-creazione; validazioni cap in Squadre.
