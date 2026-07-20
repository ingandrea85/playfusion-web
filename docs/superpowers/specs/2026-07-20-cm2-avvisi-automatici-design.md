# cm2 — Avvisi automatici (notifiche di sistema)

**Data:** 2026-07-20
**Stato:** design approvato, pronto per il piano
**Dipende da:** cm1 (bacheca avvisi)
**Esperienze toccate:** E1 Organizer, E3 Public (entrambe già esistenti da cm1)

## Obiettivo

Alcuni eventi di dominio devono generare **automaticamente** un avviso nella
stessa bacheca di cm1, distinto visivamente da quelli scritti a mano
dall'organizer. Nessuna nuova superficie: si riusa interamente cm1.

## Modello dati (estensione non-rottura di `Announcement`)

Aggiunte a `Announcement` in `shared/mock/types.ts`:

```ts
  source: 'ORGANIZER' | 'SYSTEM'
  dedupeKey?: string   // solo avvisi di sistema; garantisce unicità/sostituzione
```

- Gli avvisi manuali di cm1 (seed + creati da E1) sono `source: 'ORGANIZER'`.
- Il tag "Automatico" si mostra **solo** quando `source === 'SYSTEM'`: uno stato
  in `localStorage` da cm1 privo del campo viene quindi trattato come manuale
  (nessun crash, nessun tag).
- `dedupeKey` è presente solo sugli avvisi di sistema.

### Helper store (`shared/mock/store.ts`)

Operano su uno `state` già caricato (il caller fa `save`):

```ts
function upsertSystemAnnouncement(state: State, input: { eventId: string; categoryId: string | null; title: string; body: string; dedupeKey: string }): void
function removeSystemAnnouncement(state: State, eventId: string, dedupeKey: string): void
```

- `upsertSystemAnnouncement`: se esiste un avviso con stesso `eventId` +
  `dedupeKey`, ne aggiorna `title`, `body`, `categoryId`, `createdAt`;
  altrimenti crea `{ source: 'SYSTEM', pinned: false, ... }` con un `id`
  `ann-N` (stesso schema max-based di cm1).
- `removeSystemAnnouncement`: rimuove l'avviso con quel `eventId` + `dedupeKey`.

## I quattro trigger

Agganciati **dentro** le mutation store esistenti, subito prima del `save`.

| Evento | Mutation | Scope (`categoryId`) | `dedupeKey` | Testo (title / body) |
|---|---|---|---|---|
| Calendario pubblicato | `publishSchedule` | `null` | `schedule-published` | "Calendario pubblicato" / "Il calendario delle gare è online." |
| Iscrizioni aperte | `setRegistrationsOpen(_, true)` **solo se `playbook !== 'PB-2'`** | `null` | `registrations-open` | "Iscrizioni aperte" / "Le iscrizioni al torneo sono aperte." |
| Match spostato | `rescheduleMatch` | categoria del match | `reschedule:<matchId>` | "Gara riprogrammata" / "`<home>` vs `<away>`: `<day>` `<time>` · `<field>`" |
| Campione | `recordFinalResult` | categoria della finale | `champion:<categoryId>:<bracketLabel>` | "Campione" / "`<team>` ha vinto `<bracketLabel>`." |

Dettagli di comportamento:
- **Calendario pubblicato / Iscrizioni aperte:** il `dedupeKey` fisso garantisce
  "una volta"; se l'organizer lo elimina e l'evento non si ri-innesca, resta
  eliminato (accettabile: `publishSchedule` avviene una sola volta;
  `setRegistrationsOpen(true)` solo alla riapertura).
- **Iscrizioni aperte:** solo su `open === true` e `playbook !== 'PB-2'`; su
  `open === false` non si fa nulla.
- **Match spostato:** `dedupeKey` per-match → ogni match ha **al più un** avviso
  di riprogrammazione; ri-spostarlo aggiorna quello esistente (resta uno solo).
- **Campione:** dopo `resolveFinals`, per ogni finale dell'evento con
  `round === 'Finale'` si calcola `decideMatch(f)`; se c'è un vincitore →
  `upsertSystemAnnouncement`; se è di nuovo indecisa (es. correzione a pareggio
  senza rigori) → `removeSystemAnnouncement`. La "Finale 3º/4º" **non** è
  `round === 'Finale'`, quindi non genera avvisi campione.

## UI

- **E1** (`apps/organizer/avvisi.ts`): un avviso con `source === 'SYSTEM'` mostra
  un tag muted **"Automatico"** accanto al titolo (riuso stile `pf-mono`
  `pf-muted`). Mantiene gli stessi controlli dei manuali: **elimina** e
  **in evidenza** (l'organizer può pinnare o rimuovere un avviso automatico).
- **E3** (`apps/public/avvisi.ts` + featured su landing/calendario): nessun
  cambiamento strutturale; gli avvisi di sistema compaiono come gli altri, con
  il tag "Automatico". Il "match spostato" è category-scoped → rispetta il
  filtro categoria già presente.

Nessun nuovo CSS: si usano classi esistenti (`pf-badge`, `pf-mono`, `pf-muted`).

## Test

Nuovo `shared/mock/announcements-auto.test.ts` (scenario-driven, reset seed per test):

- `publishSchedule` (dopo `generateSchedule` + `approveSchedule` su `evt-1`)
  crea un avviso `source:'SYSTEM'` con `dedupeKey:'schedule-published'`; una
  seconda chiamata non duplica.
- `rescheduleMatch` su un match di `evt-finals` crea 1 avviso di sistema per
  quel match; ri-spostarlo lo **sostituisce** (resta 1, `body` aggiornato);
  spostare un secondo match → 2 avvisi.
- `setRegistrationsOpen('evt-1', true)` (PB-1) crea l'avviso; su `evt-direct`
  (PB-2) **non** lo crea.
- `recordFinalResult` che decide la Finale di `evt-finals` crea l'avviso
  campione; una correzione che rende la finale indecisa lo **rimuove**.
- I test cm1 esistenti (`announcements.test.ts`) restano verdi (source assente
  trattato come manuale; nessun campo obbligatorio nuovo rompe il seed).

## Fuori scope (YAGNI)

Notifiche per-squadra (es. "iscrizione confermata"), email/SMS/push reali,
storico completo degli spostamenti, preferenze/mute per destinatario,
raggruppamento digest.

## Naming

Tag di fetta **`cm2`**.
