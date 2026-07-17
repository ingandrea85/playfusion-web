# Design — Standings (classifiche) initialized on generation — O6

- **Data:** 2026-07-17
- **Stato:** approvato in brainstorming, in attesa di review della spec
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-web-mockups]], Blueprint `20-domain/bc/o6-competition-management.md`, O7 scheduling specs/plans

## Contesto e obiettivo

Fetta A dell'espansione "calendari": quando si genera il calendario, si crea anche la **classifica** (`Standing`, O6) di ogni girone in stato *Initialized* — tutte le squadre a zero punti — e la si mostra in E1 (sotto il calendario) e nel pubblico E3. È il primo passo prima delle finali (Fetta B). Mockup mid-fi, stesso stack e look Matchday.

## Scope

**Incluso:** modello `StandingRow`; creazione/salvataggio delle classifiche a zero alla generazione (riusando la logica di raggruppamento dei fixture); helper `renderStandings`; vista in E1 (`schedule.html`, sotto il calendario) e pagina pubblica E3 `standings.html` (gated su PUBLISHED, linkata dalla landing).

**Non incluso:** punti/risultati reali (O8), criteri di ordinamento/spareggio, classifiche avulse, finali (Fetta B).

## Modello (mock store)

```
StandingRow {
  eventId: string
  categoryId: string
  groupLabel: string      // 'Girone A' ...
  team: string
  played: number          // 0 all'init
  won: number             // 0
  drawn: number           // 0
  lost: number            // 0
  goalsFor: number        // 0
  goalsAgainst: number    // 0
  points: number          // 0
}
```
`State` guadagna `standings: StandingRow[]`. Seed: `standings: []`. La differenza reti (DR = `goalsFor - goalsAgainst`) è derivata in vista, non memorizzata.

## Generazione (DRY con i fixture)

- Estrarre in `shared/mock/fixtures.ts` un helper esportato **`buildGroups(cats: FixtureCategory[]): Array<{ categoryId: string; groupLabel: string; teams: string[] }>`** — la logica oggi inline in `buildFixtures` (split `i % groups`, `ROUND_ROBIN` → 1 girone, label `Girone A/B/...`). `buildFixtures` viene rifattorizzato per usarlo (nessun cambio di comportamento; i test fixtures restano verdi).
- In `store.ts`, `generateSchedule` (dopo aver costruito i match) chiama `buildGroups(cats)` e **rimpiazza** `state.standings` per l'evento con una `StandingRow` a zero per ogni squadra di ogni girone (ordine = ordine nel girone). Nuovo getter `getStandings(eventId): StandingRow[]`.
- Rigenerare ricrea le classifiche (replace per evento). Lo stato APPROVED/PUBLISHED blocca la rigenerazione (invariato).

## Viste

Helper condiviso in `shared/chrome.ts`: **`renderStandings(rows: StandingRow[], catName: (id: string) => string): string`** — raggruppa per categoria → girone; per ogni girone una tabella `Pos · Squadra · G · V · N · P · GF · GS · DR · Pt` (tutte 0), con nota "Classifica iniziale · nessuna partita giocata". Pos = indice+1. Stile Matchday (numeri in mono, tabella `.pf-table` o dedicata responsive).

- **E1 `schedule.html`**: dopo la generazione, sotto il calendario, un blocco "Classifiche" con `renderStandings`. Vuoto se `status === 'NONE'`.
- **E3 `standings.html`** (nuova, mobile-first, read-only): mostra `renderStandings` se `Schedule.status === 'PUBLISHED'`, altrimenti "non ancora pubblicato". Landing E3: pulsante "Classifiche" accanto a "Calendario" quando pubblicato.
- Registrare `standings.html` come input in `vite.config.ts`.

## Revisione Blueprint (`o6-competition-management.md`)

Nota **D-O6-3**: la `Standing` è **inizializzata a zero per girone alla generazione del calendario/struttura** (stato *Initialized*), pronta a *Recomputed* quando arriveranno i risultati (O8). Ownership O6; nel mockup il trigger è l'azione "Genera" (che nel dominio corrisponde a `CompetitionStructureDesigned`).

## Criteri di successo

1. Dopo "Genera calendario", esiste una `StandingRow` a zero per ogni squadra di ogni girone, coerente coi gironi dei fixture (incluse squadre senza partite).
2. E1 mostra le classifiche sotto il calendario; E3 `standings.html` le mostra solo se pubblicato; la landing linka "Classifiche" solo se pubblicato.
3. Rigenerare aggiorna le classifiche; "Reset demo" le svuota.
4. Le tabelle sono responsive/coerenti col look Matchday; DR calcolata in vista.
5. `buildGroups` è la sola fonte del raggruppamento (fixture + classifiche coerenti); test verdi.
6. Blueprint D-O6-3 registrata.

## Fuori scope / futuro

Risultati e punti (O8 → Standing Recomputed), ordinamento per punti/spareggi, classifiche avulse; finali con placeholder + data finali (Fetta B).
