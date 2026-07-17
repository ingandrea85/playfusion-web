# Design — Per-category schedule config (fields + match times) — O7 revision

- **Data:** 2026-07-17
- **Stato:** approvato in brainstorming, in attesa di review della spec
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-web-mockups]], spec O7 `2026-07-16-o7-scheduling-design.md`, Blueprint `20-domain/bc/o7-scheduling.md`

## Contesto e obiettivo

Revisione di O7: nella realtà **ogni categoria ha campi e tempi di gioco diversi** (una U10 gioca su campi ridotti con tempi corti, una U14 su campo intero con tempi lunghi). La config di scheduling, oggi globale per l'evento, diventa **per-categoria** per campi + parametri partita; restano globali solo la finestra oraria dell'impianto (inizio giornata, slot/giorno). Corregge le decisioni Blueprint D-O7-1/D-O7-2 (scritte "per-evento").

## Scope

**Incluso:** modello `ScheduleConfig` per-categoria; `buildFixtures` che piazza ogni categoria sui propri campi con la propria durata slot; schermata E1 `schedule.html` rifatta col pattern "stessa per tutte / per categoria"; revisione Blueprint D-O7-1/D-O7-2.

**Non incluso:** cambi alla vista calendario (E1 review e E3 pubblica restano invariate — raggruppano per giornata); scheduler con vincoli; parametri per-categoria oltre a campi/tempi (inizio giornata e slot/giorno restano globali).

## Modello (mock store)

```
CategorySchedule {
  fields: string[]         // campi usati da QUESTA categoria
  periods: number
  periodMinutes: number
  breakMinutes: number
}

ScheduleConfig {
  dailyStart: string        // GLOBALE — finestra impianto (HH:MM)
  slotsPerDay: number       // GLOBALE
  byCategory: Record<string, CategorySchedule>   // chiave = categoryId
}

Schedule { eventId; status: ScheduleStatus; config: ScheduleConfig }   // status invariato
```

Seed: `byCategory` popolato per cat-1/2/3 con default identici (`fields: ['Campo A','Campo B']`, `periods 2`, `periodMinutes 20`, `breakMinutes 10`), `dailyStart '09:00'`, `slotsPerDay 8`, status `NONE`, nessun `ScheduledMatch`.

Store: `generateSchedule(eventId, config)` invariato nella firma (riceve il nuovo `ScheduleConfig`); assembla per categoria la sua `CategorySchedule` da `config.byCategory[categoryId]` (fallback a un default se assente, es. categoria nuova). `approve`/`publish`/getters invariati.

### `buildFixtures` (rivista, deterministica)
Firma: `buildFixtures(eventId, startDate, endDate, dailyStart, slotsPerDay, cats)` dove ogni `cat` è `FixtureCategory` esteso con `fields`, `periods`, `periodMinutes`, `breakMinutes` (oltre a `format`, `groupsCount`, `legs`, `teams`).
Per **ogni categoria, indipendentemente**:
1. distribuisci le squadre confermate nei gironi (`i % groups`; `ROUND_ROBIN` → 1 girone), genera le coppie round-robin, raddoppia se `HOME_AWAY` (invariato).
2. piazza i match di quella categoria sui **suoi** `fields`, con `slotMinutes = periods*periodMinutes + breakMinutes`, cursore campo→slot→giorno partendo da `dailyStart`, giorni da `startDate`→`endDate` (wrap con `% days.length`). Ogni categoria parte da campo0/slot0/giorno0 (le categorie possono coincidere in orario ma su campi propri).
3. IDs `sm-${n}` sequenziali nell'ordine categorie→gironi→coppie.

## Schermata E1 `schedule.html`

- Testata "Setup · Calendario" (invariata).
- **Card finestra oraria** (globale): inizio giornata + slot/giorno.
- **Toggle "stessa config di gioco per tutte le categorie"** (come O6):
  - ON: un form (campi add/rimuovi + n. tempi + durata + pausa); "Genera" applica quella config a tutte le categorie.
  - OFF: una card per categoria (tag categoria + suoi campi + suoi parametri); "Genera" usa la config di ciascuna.
  - Stato iniziale del toggle derivato dai dati (ON se tutte le `byCategory` sono uguali).
- **Genera calendario** → rivedi (calendario per giornata, invariato) → **Approva** (blocca config) → **Pubblica**.
- Feedback di conferma su Genera/Approva/Pubblica (coerente col fix appena fatto su O6).

## Revisione Blueprint (`o7-scheduling.md`)

Riscrivo:
- **D-O7-1** — i **campi** sono allocati **per categoria** nello `Schedule.config.byCategory[*].fields` (non un unico set per-evento). Correzione esplicita della versione precedente.
- **D-O7-2** — i **parametri partita** (tempi/durata/pausa) sono **per categoria**. Restano globali solo inizio-giornata e slot/giorno (finestra impianto).

## Criteri di successo

1. In OFF, modificando campi/tempi di una sola categoria e rigenerando, cambiano **solo** i match di quella categoria (durata slot/orari e campi coerenti).
2. In ON, "Genera" applica la stessa config a tutte.
3. La finestra oraria (inizio/slot) resta globale.
4. Ogni categoria è piazzata sui propri campi con la propria durata slot.
5. Stato persistente; "Reset demo" ripristina i default seed; test verdi.
6. Blueprint D-O7-1/D-O7-2 aggiornate a "per categoria".

## Fuori scope / futuro

Prevenzione conflitti cross-categoria (stesso campo/slot), inizio-giornata per categoria, riposi minimi.
