# Design — Tie-break policy (Slice 2: risoluzione manuale della parità residua) — O6/O8

- **Data:** 2026-07-17
- **Stato:** approvato in brainstorming
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-web-mockups]]; segue Slice 1 (D-O3-1, D-O6-7). Blueprint O6/O8.

## Contesto e obiettivo

Slice 1 lascia i gruppi perfettamente in parità come `unresolved`: la classifica li segnala ("parità da definire") e la qualificazione al tabellone è sospesa. Slice 2 dà all'organizzatore lo strumento per **ordinare a mano** quel gruppo; l'override sblocca ranking e qualificazione. Mockup mid-fi.

## Scope

**Incluso:** collezione `tieOverrides` (chiave = insieme esatto delle squadre appaiate, autoinvalidante); `rankStanding` accetta gli override e ordina il gruppo secondo l'override anziché segnarlo irrisolto; store API `getTieOverrides`/`setTieOverride` (+ `resolveFinals` dopo il set); pannello E1 "Risolvi parità" (↑/↓, no DnD); il pubblico resta read-only e mostra l'ordine risolto; test.

**Non incluso:** cancellazione esplicita dell'override (l'autoinvalidazione copre il caso); fair-play/sorteggio automatico; terzo posto.

## Modello (store)

Nuova collezione `State.tieOverrides: TieOverride[]` con:
```
export interface TieOverride {
  eventId: string
  categoryId: string
  groupLabel: string
  order: string[]   // squadre del gruppo appaiato, nell'ordine deciso a mano
}
```
Nessun campo nuovo su altre entità. Seed: `tieOverrides: []`.

## Motore (`rankStanding`)

Nuova firma retro-compatibile:
```
rankStanding(rows: StandingRow[], matches: ScheduledMatch[], policy: TieBreakCriterion[], overrides?: string[][]): RankResult
```
- `overrides` è la lista degli ordini manuali applicabili a questo girone (già filtrati dal chiamante per event+cat+group), ciascuno un array ordinato di nomi squadra.
- Quando la ricorsione raggiunge un gruppo ancora appaiato a **criteri esauriti**: se esiste un `override` che copre **esattamente** quelle squadre (stesso insieme, stessa cardinalità) → ordina il gruppo secondo l'override e **non** lo aggiunge a `unresolved`; altrimenti comportamento Slice 1 (ordine per nome + push in `unresolved`).
- Un override che non combacia con nessun gruppo appaiato è semplicemente inutile → ignorato (autoinvalidazione: se la parità cambia composizione, il vecchio override non matcha più).

`RankResult` invariato (`{ rows, unresolved }`); `unresolved` ora contiene solo i gruppi **senza** override valido.

## Consumi

- **`derive.ts` / `resolveSlot`**: passa a `rankStanding` gli override del girone (`state.tieOverrides` filtrati per event+cat+group, mappati a `.order`). Una posizione risolta da override qualifica normalmente.
- **`renderStandings`** (chrome): nuova firma `renderStandings(rows, matches, policy, overrides, catName)`; internamente filtra gli override per girone e li passa a `rankStanding`. Badge/nota mostrati solo per i gruppi ancora in `unresolved`. Aggiornati i due call-site (E1 `schedule.ts`, pubblico `standings.ts`).

## Store API + dominio

- `getTieOverrides(eventId): TieOverride[]`.
- `setTieOverride(eventId, categoryId, groupLabel, order: string[]): void` — upsert per (event, cat, group); poi `resolveFinals(state, eventId)` così il tabellone si aggiorna; poi `save`.
- Evento di dominio (concettuale): `StandingTieResolvedManually`.

## UI — pannello E1 (solo organizzatore)

- In `schedule.ts`, sotto le classifiche: per ogni gruppo `unresolved` della vista selezionata, un bottone **"Risolvi parità"**.
- Il pannello elenca le squadre appaiate con frecce **↑/↓** per ordinarle (mobile-friendly, no drag&drop) e un bottone **Salva** → `setTieOverride(...)` → ri-render (badge via, classifica ordinata, slot tabellone risolti). Riapribile per correggere.
- Il pubblico (`standings.ts`, `bracket.html`) è **read-only**: mostra l'ordine risolto senza badge, nessun controllo.

## Eventi demo

Riuso `evt-tie-open` (parte irrisolto). Nessun override nel seed (resta il caso "da risolvere"). Test:
- dato un `setTieOverride('evt-tie-open', cat, 'Girone A', ['Bravo','Alfa'])`, la classifica ordina Bravo prima di Alfa e `unresolved` è vuoto;
- lo slot del tabellone (`1ª`/`2ª Girone A`) si risolve nelle squadre secondo l'override;
- un override con un insieme di squadre diverso da quello appaiato viene ignorato (`unresolved` resta pieno, slot a segnaposto).

## Revisione Blueprint

Estendere **D-O6-7** (o nuova nota su O8): la parità residua è risolta da un **override manuale dell'organizzatore** (`StandingTieResolvedManually`), keyed sull'insieme esatto delle squadre e **autoinvalidante** quando la composizione della parità cambia; l'override sblocca ranking e qualificazione. Sorteggio automatico e fair-play restano fuori.

## Criteri di successo

1. Un gruppo irrisolto in E1 mostra "Risolvi parità"; il pannello ordina le squadre (↑/↓) e salva.
2. Dopo il salvataggio: badge via, classifica nell'ordine scelto, slot del tabellone risolti secondo l'override (E1 + pubblico coerenti).
3. Un nuovo risultato che cambia le squadre appaiate rende l'override non-combaciante → la parità nuova ricompare da risolvere (autoinvalidazione).
4. Il pubblico resta read-only. Test verdi (override applicato, tabellone risolto, override non-combaciante ignorato); suite + build + `tsc` puliti.

## Fuori scope / futuro

Cancellazione esplicita dell'override; sorteggio automatico; fair-play/disciplinare; terzo posto; ripescaggi. O8b-2 (risultati finali + propagazione `Vincente …`) è il prossimo lavoro dopo Slice 2.
