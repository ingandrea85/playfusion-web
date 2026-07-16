# Design — O7 Scheduling: genera → approva → pubblica + calendario pubblico (mockup round 3)

- **Data:** 2026-07-16
- **Stato:** approvato in brainstorming, in attesa di review della spec
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-web-mockups]], Blueprint `20-domain/bc/o7-scheduling.md` (+ o6, o3, o10), spec round 2 `2026-07-16-o6-competition-config-design.md`

## Contesto e obiettivo

Round 3: completa gli step oggi disabilitati nell'hub evento — **Genera calendario → Approva calendario → Pubblica evento** — e aggiunge la **vista calendario pubblica** (E3). Valida la UX di scheduling: configurare campi e parametri partita, generare un calendario plausibile dai dati reali (O6 + iscrizioni confermate), rivederlo, approvarlo, pubblicarlo. Resta mockup mid-fi (stesso stack e look "Matchday", nessun backend).

## Scope

**Incluso:**
- Schermata E1 `schedule.html`: config (campi + parametri partita), "Genera calendario", review del calendario, "Approva", "Pubblica".
- Generazione deterministica del calendario dai dati (fedeltà "plausibile", niente solver di vincoli).
- Schermata pubblica E3 `calendar.html` (read-only), linkata dalla landing quando pubblicato.
- I 3 step hub diventano attivi con done-state guidato dallo stato `Schedule`.

**Non incluso:** scheduler con vincoli/riposi minimi, ottimizzazione, drag&drop per spostare i match (si rigenera), notifiche, export.

## Allineamento Blueprint

- O7 possiede campi/slot/calendario (`Schedule` Generated→Approved→Published, `ScheduledMatch`). Il modello segue questo.
- Consuma la struttura O6 (`Competition` per categoria: `groupsCount`, `legs`) e le iscrizioni confermate (O5).
- Decisioni da registrare in `o7-scheduling.md` dopo l'implementazione:
  - **D-O7-1** — i **campi** (nomi/quantità) sono un set dell'evento gestito da O7.
  - **D-O7-2** — i **parametri partita** (n. tempi, durata tempo, pausa) modellati come input dello `Schedule` in O7 per l'MVP (nota: possibile migrazione a default per-sport nello Sports Catalog).
- "Pubblica evento" mappa su `SchedulePublished` (O7) + attivazione portale pubblico (O10).

## Modello (mock store)

```
ScheduleStatus = 'NONE' | 'GENERATED' | 'APPROVED' | 'PUBLISHED'

ScheduleConfig {
  fields: string[]        // es. ['Campo A', 'Campo B']
  periods: number         // n. tempi
  periodMinutes: number   // durata di un tempo
  breakMinutes: number    // pausa tra partite
  dailyStart: string      // 'HH:MM' inizio giornata
  slotsPerDay: number     // slot per campo per giornata
}

Schedule { eventId: string; status: ScheduleStatus; config: ScheduleConfig }

ScheduledMatch {
  id: string
  eventId: string
  categoryId: string
  groupLabel: string      // es. 'Girone A'
  day: string             // 'YYYY-MM-DD'
  time: string            // 'HH:MM'
  field: string           // nome campo
  home: string            // nome squadra
  away: string
}
```

Funzioni store:
- `getSchedule(eventId): Schedule | undefined`
- `getScheduledMatches(eventId): ScheduledMatch[]`
- `generateSchedule(eventId, config): void` — calcola i match (vedi sotto), salva config, imposta status `GENERATED`. Rigenerabile finché non `APPROVED`.
- `approveSchedule(eventId): void` — status → `APPROVED`.
- `publishSchedule(eventId): void` — status → `PUBLISHED`.

Seed: `Schedule` a `NONE` con una `config` di default (2 campi, 2 tempi × 20', pausa 10', inizio 09:00, 8 slot/giorno) e nessun `ScheduledMatch` → la demo genera dal vivo.

### Generazione (funzione pura `buildFixtures`, deterministica)
1. Per ogni categoria: prendi le squadre **confermate** (registrazioni `status = CONFIRMED`).
2. Distribuiscile nei gironi secondo `Competition.groupsCount` (round-robin: team i → girone `i % groupsCount`). Etichetta girone: 'Girone A/B/…'.
3. Per ogni girone genera il round-robin (tutte le coppie). Se `Competition.legs = HOME_AWAY`, aggiungi i ritorni (casa/ospite invertiti).
4. Piazza i match su campi/slot/giornate: `slotMinutes = periods*periodMinutes + breakMinutes`; giorni da `startDate`→`endDate`; per ogni giorno `slotsPerDay` slot per campo a partire da `dailyStart`. Cursore che ruota **campo → slot → giorno** in sequenza. Nessuna prevenzione conflitti (fedeltà "plausibile").
5. Deterministico: nessun `Math.random`; IDs `sm-${n}`.

## Schermate

### E1 `schedule.html` (desktop-first)
- Testata firma "Setup · Calendario".
- **Card Config**: elenco campi (aggiungi/rimuovi nome), n. tempi, durata tempo, pausa, inizio giornata, slot/giorno; mostra la durata slot calcolata.
- **Bottone "Genera calendario"** → genera e mostra il calendario (rigenerabile se non approvato).
- **Calendario**: raggruppato per **giornata → campo**; ogni match: orario (mono), `Categoria · Girone`, "Casa vs Ospite".
- **Azioni di stato**: "Approva" (abilitato se GENERATED), "Pubblica" (abilitato se APPROVED). Dopo APPROVED la config/genera è bloccata.
- Hub evento: "Genera calendario" done se status ≥ GENERATED; "Approva" done se ≥ APPROVED; "Pubblica evento" done se PUBLISHED. Tutti linkano a `schedule.html`.

### E3 `calendar.html` (mobile-first, read-only, pubblico)
- Visibile/linkata dalla landing **solo se** `Schedule.status = PUBLISHED`.
- Calendario per giornata (match come righe: orario mono, campo, `Categoria · Girone`, Casa vs Ospite). Look Matchday.
- Landing: aggiunge un pulsante "Calendario" quando pubblicato.

## Criteri di successo

1. Dall'hub → "Genera calendario"; configurando campi/parametri e premendo Genera compare un calendario plausibile derivato da squadre confermate + gironi.
2. Il calendario riflette i dati: cambiando `groupsCount`/`legs` in O6 o le squadre confermate, una nuova generazione cambia i match.
3. "Approva" blocca; "Pubblica" attiva la vista pubblica.
4. La landing E3 mostra il link "Calendario" solo dopo la pubblicazione; `calendar.html` mostra gli stessi match, read-only.
5. Gli step hub riflettono lo stato (generato/approvato/pubblicato).
6. Stato persistente in `localStorage`; "Reset demo" riporta `Schedule` a `NONE`.
7. Look coerente col sistema Matchday.

## Fuori scope / futuro

Scheduler con vincoli e riposi; spostamento manuale dei match; notifiche di pubblicazione; export PDF/CSV; fase Operations (risultati live).
