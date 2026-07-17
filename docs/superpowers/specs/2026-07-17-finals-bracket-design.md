# Design — Finals brackets with placeholders + global finals date (Slice B) — O6/O7

- **Data:** 2026-07-17
- **Stato:** approvato in brainstorming
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-web-mockups]]; Blueprint `o6-competition-management.md` (tabellone/finalsType), `o7-scheduling.md` (finals date)

## Contesto e obiettivo

Slice B dell'espansione calendari: alla generazione, oltre a fixture + classifiche, si crea il **tabellone finali con segnaposto** per categoria (derivato dal `finalsType` O6), lo si pianifica sulla **data finali globale** (O7), e lo si mostra in E1 e in una pagina pubblica E3. Mockup mid-fi, deterministico, "plausibile" (non un motore di torneo). Fedeltà per-tipo semplificata.

## Scope

**Incluso:** `finalsDate` globale su `ScheduleConfig`; `FinalMatch` con segnaposto; generatore `buildFinals` per-tipo (SPLIT_GROUP_FINALS / SINGLE_GROUP_CROSSOVER / PLACEMENT); pianificazione finali sulla data finali; helper `renderBracket` (lista per round); sezione "Finali" in E1 (per categoria selezionata); pagina pubblica E3 `bracket.html` (gated su pubblicato) + link in landing; config "Data finali" nella card finestra oraria.

**Non incluso:** albero grafico SVG; avanzamento reale dei vincenti (O8); spareggi; ora/campo con prevenzione conflitti.

## Modello (mock store)

```
FinalMatch {
  id: string            // 'fm-1'...
  eventId: string
  categoryId: string
  bracketLabel: string  // 'Tabellone Oro' | 'Tabellone Argento' | 'Tabellone' | 'Piazzamento' ...
  round: string         // 'Finale' | 'Semifinali' | 'Quarti' | 'Finale 1º/2º' | ...
  order: number         // ordine dentro il round
  home: string          // segnaposto: '1ª Girone A' | 'Vincente SF1' ...
  away: string
  day: string           // = finalsDate
  time: string
  field: string
}
```
`ScheduleConfig` guadagna `finalsDate: string` (globale). `State` guadagna `finals: FinalMatch[]`. Seed: `finalsDate` = ultimo giorno evento (`'2026-08-30'`), `finals: []`.

## Generatore (deterministico) — `shared/mock/finals.ts`

`buildFinals(eventId, categoryId, gironi: string[], qualifiersPerGroup: number, finalsType: FinalsType): FinalMatch[]` (senza day/time/field — la pianificazione la fa lo store).

Segnaposto posizione: `slot(pos, girone) = \`${pos}ª ${girone}\``. Helper `singleElim(slots, bracketLabel)` costruisce i round (Finale=2, Semifinali=4, Quarti=8; altrimenti accoppia in ordine) e i "Vincente {round}{n}" per i turni successivi.

- **SINGLE_GROUP_CROSSOVER**: usa `gironi[0]`; se Q≥4 → Semifinali `1ª vs 4ª`, `2ª vs 3ª` → Finale `Vincente SF1 vs Vincente SF2`; se Q==2 → solo Finale `1ª vs 2ª`. `bracketLabel='Tabellone'`.
- **SPLIT_GROUP_FINALS**: per ogni posizione p in 1..Q → `singleElim(["pª " di ogni girone], bracketLabel)` con `bracketLabel` = `p==1?'Tabellone Oro':p==2?'Tabellone Argento':\`Tabellone ${p}\``. Con 2 gironi = Finale diretta.
- **PLACEMENT**: per ogni posizione p in 1..Q → una `Finale ${2p-1}º/${2p}º` tra `pª ${gironi[0]}` e `pª ${gironi[1] ?? gironi[0]}`; `bracketLabel='Piazzamento'`. (Assume 2 gironi; con 1 girone accoppia 1ª vs 2ª ecc. — semplificazione dichiarata.)

Semplificazioni dichiarate: conteggi piccoli; accoppiamento sequenziale se i gironi non sono potenza di 2; nessun terzo posto oltre a quanto sopra.

## Pianificazione (store)

`generateSchedule`, dopo gironi + standings: per ogni categoria calcola `buildFinals(...)` (usando i gironi di `buildGroups`, `qualifiersPerGroup`/`finalsType` dalla `Competition`), assegna `day = config.finalsDate`, e `time/field` in sequenza sui campi della categoria (`CategorySchedule`) da `dailyStart` (`slotMinutes` come i gironi). Rimpiazza `state.finals` per l'evento. Getter `getFinals(eventId): FinalMatch[]`. IDs `fm-${n}`. Bloccato da APPROVED/PUBLISHED (invariato).

## Viste

Helper `renderBracket(finals: FinalMatch[], catName): string` in `chrome.ts` — raggruppa per `bracketLabel` → `round`; ogni match: orario (mono) · campo · `home vs away` (segnaposto). Lista per round (non albero SVG). Stile Matchday.

- **E1 `schedule.html`**: nuova sezione **"Finali"** (contenitore `#finals`) sotto le classifiche; mostra `renderBracket` delle finali della **categoria selezionata** (il tab girone non si applica: finali cross-girone). Vuota se status NONE.
- **E3 `bracket.html`** (nuova, mobile-first, read-only): `renderBracket` delle finali; con i **tab categoria** (come calendario/classifiche); gated su `PUBLISHED`, altrimenti "non ancora pubblicato". Registrata in `vite.config.ts`.
- **Landing E3**: pulsante "Tabellone" (accanto a Calendario/Classifiche) quando pubblicato.

## Config UI

Nella card "Finestra oraria" di `schedule.html`: campo **"Data finali"** (`<input type="date">`), letto in `buildConfig()` come `finalsDate`.

## Revisione Blueprint

- **D-O6-4** (`o6-competition-management.md`): il tabellone finali è generato con **segnaposto** derivati dal `finalsType` (slot = posizione di girone `Nª Girone X` o `Vincente <match>`), risolti in squadre reali con l'avanzamento (O8/`ParticipantAdvanced`).
- Nota in `o7-scheduling.md`: `finalsDate` globale sullo `Schedule` (quando si gioca la fase finale).

## Criteri di successo

1. Generando, ogni categoria ha finali con segnaposto coerenti col suo `finalsType`, pianificate sulla `finalsDate` globale.
2. Cambiando `finalsType`/gironi/qualificate e rigenerando, il tabellone cambia (i tre tipi producono strutture diverse).
3. E1 mostra le finali della categoria selezionata (dai tab); E3 `bracket.html` (pubblicato) idem; landing linka "Tabellone".
4. "Reset demo" svuota le finali; test verdi.
5. Look coerente, tabelle/righe responsive.
6. Blueprint D-O6-4 registrata.

## Fuori scope / futuro

Albero grafico; avanzamento vincenti reale (O8); spareggi/terzo posto configurabile; conflitti di scheduling.
