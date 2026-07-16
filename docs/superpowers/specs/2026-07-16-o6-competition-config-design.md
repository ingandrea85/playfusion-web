# Design — O6 "Configura competizione" (mockup round 2)

- **Data:** 2026-07-16
- **Stato:** approvato in brainstorming, in attesa di review della spec
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-web-mockups]], Blueprint `20-domain/bc/o6-competition-management.md`, spec round 1 `2026-07-16-e1-e3-navigable-mockups-design.md`

## Contesto e obiettivo

Round 2 dei mockup: la schermata **O6 "Configura competizione"**, uno degli step oggi disabilitati nell'hub evento (dopo "quota pagata"). Valida la UX di configurazione della struttura di competizione **per categoria**, col pattern "stessa per tutte / personalizza per categoria". Resta mockup mid-fi (stesso stack e look "Matchday", nessun backend).

## Scope

**Incluso:** una schermata E1 `competition.html` che, per ogni categoria dell'evento, configura la struttura di competizione (formato, andata/ritorno, gironi, finali), con toggle "stessa configurazione per tutte le categorie".

**Non incluso:** campi/slot/calendario (O7, round successivo); parametri partita (n. tempi, durata, pausa); qualsiasi generazione reale di fixture. La Categoria resta un'etichetta (immutata).

## Allineamento Blueprint

- Rispetta l'aggregato **O6 `Competition`** ("one per categoria of an event"): una Competition per categoria, la config **non** vive sulla Categoria (O3, etichetta).
- Due concetti non ancora nel Blueprint → **decisioni da registrare** in `o6-competition-management.md` dopo l'implementazione:
  - **D-O6-1** `legs` (girone singolo / andata-ritorno).
  - **D-O6-2** `finalsType` tassonomia (PLACEMENT / SINGLE_GROUP_CROSSOVER / SPLIT_GROUP_FINALS).

## Modello (mock store)

Nuovo tipo `Competition`:
```
Competition {
  id: string
  eventId: string
  categoryId: string
  format: 'ROUND_ROBIN' | 'GROUPS_KNOCKOUT'
  legs: 'SINGLE' | 'HOME_AWAY'
  groupsCount: number          // usato solo se GROUPS_KNOCKOUT
  qualifiersPerGroup: number   // usato solo se GROUPS_KNOCKOUT
  finalsType: 'PLACEMENT' | 'SINGLE_GROUP_CROSSOVER' | 'SPLIT_GROUP_FINALS'  // solo se GROUPS_KNOCKOUT
}
```

Funzioni store:
- `getCompetition(categoryId): Competition | undefined`
- `getCompetitions(eventId): Competition[]`
- `upsertCompetition(input): Competition` — crea o aggiorna la Competition di una categoria (chiave: categoryId).
- `applyToAllCategories(eventId, config): void` — scrive la stessa config su tutte le categorie dell'evento.

Seed: una `Competition` per ciascuna delle 3 categorie seed, con default sensati e **uguali** (così il toggle "stessa per tutte" parte ON e la schermata è popolata): `GROUPS_KNOCKOUT`, `legs SINGLE`, `groupsCount 2`, `qualifiersPerGroup 2`, `finalsType PLACEMENT`.

## Schermata & flusso

- Nuovo step nell'hub evento tra "Riscuoti quote" e gli step O7: **"Configura competizione"** (abilitato, link a `competition.html?event=<id>`). "Done" quando ogni categoria ha una Competition.
- `competition.html` (desktop-first, look Matchday): testata firma (eyebrow "Setup · Competizione" + titolo), poi:
  - **Card "Schema comune"** con toggle `Stessa configurazione per tutte le categorie`.
    - ON: un solo form di config; salvando applica a tutte (`applyToAllCategories`). Le categorie sotto mostrano un riepilogo read-only.
    - OFF: una card editabile per categoria (col tag categoria), ciascuna con il proprio form (`upsertCompetition`).
  - Stato iniziale del toggle derivato dai dati: ON se tutte le Competition sono uguali, altrimenti OFF.

### Logica campi condizionali
- `format = ROUND_ROBIN` (girone all'italiana): mostra solo **andata/ritorno**; nasconde gironi/qualificate/finali.
- `format = GROUPS_KNOCKOUT` (gironi + tabellone): mostra **andata/ritorno**, **n. gironi**, **qualificate per girone**, **tipo finali**.

## Criteri di successo

1. Dall'hub evento si raggiunge "Configura competizione"; lo step risulta "done" quando tutte le categorie sono configurate.
2. Toggle ON + salva → tutte le categorie ricevono la stessa config (verificabile passando a OFF).
3. In OFF, modificare una categoria aggiorna solo quella.
4. I campi condizionali compaiono/scompaiono cambiando formato.
5. Lo stato persiste in `localStorage`; "Reset demo" ripristina i default seed.
6. Look coerente col sistema Matchday (token, font, tag categoria).

## Fuori scope / futuro

O7 Scheduling (campi, slot, calendario) come round successivo; parametri partita; generazione fixture reale.
