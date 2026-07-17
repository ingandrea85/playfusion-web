# Design — Category/girone tabs for calendar & standings (UI only)

- **Data:** 2026-07-17
- **Stato:** approvato in brainstorming ("approvo applica")
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-web-mockups]], round O7 + standings

## Contesto e obiettivo

Calendario e classifiche oggi impilano tutte le categorie/gironi → viste lunghe, specie su mobile (E3). Aggiungere **tab Categoria + tab Girone** per filtrare. È un cambiamento **solo UI**: nessun cambio di modello, store, dominio o Blueprint.

## Scope

**Incluso:** un componente tab riusabile; stato di selezione (categoria + girone) e filtro dei dati passati a `renderCalendar`/`renderStandings` (le due funzioni restano invariate); applicato a 4 superfici — E1 `schedule.html` (una barra condivisa per calendario+classifiche), E3 `calendar.html`, E3 `standings.html`.

**Non incluso:** persistenza selezione tra reload/pagine, deep-link URL, modifiche a store/tipi/dominio, finali (Fetta B).

## Componente (chrome.ts)

`renderTabs(items: Array<{ key: string; label: string }>, activeKey: string): string` → una barra `.pf-tabs` di `<button class="pf-tab" data-key="..." aria-selected="true|false">label</button>`. Nessuna logica di stato dentro il componente: le schermate leggono `data-key` sui click e ri-renderizzano. Stile Matchday, scrollabile orizzontalmente su mobile (nessun overflow di pagina).

## Stato di selezione + filtro (per schermata, vanilla)

- `selCat: string` — default: id della **prima categoria** presente nei dati generati.
- `selGir: string` — default `'ALL'` (tutti i gironi).
- Categorie disponibili = quelle dell'evento (`getCategories`) che compaiono nei dati generati. Gironi disponibili = `groupLabel` distinti della categoria selezionata (derivati dai match/standings — coerenti via `buildGroups`).
- Cambio categoria → `selGir = 'ALL'`, rigenera la barra gironi.
- Filtro applicato PRIMA di render: match/righe con `categoryId === selCat` e, se `selGir !== 'ALL'`, `groupLabel === selGir`.
- `renderCalendar(filteredMatches, catName)` e `renderStandings(filteredRows, catName)` invariati.

## Applicazione

- **E1 `schedule.html`**: dopo la generazione (status ≠ NONE), una barra categorie + una barra gironi in cima all'area viste; controllano **insieme** il calendario e le classifiche (selezione condivisa). Prima della generazione: nessun tab.
- **E3 `calendar.html`**: barre proprie sopra il calendario; filtrano il calendario (solo se pubblicato).
- **E3 `standings.html`**: barre proprie sopra le classifiche; filtrano le classifiche (solo se pubblicato).

## Casi limite

- Nessun dato (NONE / non pubblicato) → nessun tab, messaggi attuali invariati.
- Categoria con un solo girone → barra gironi = `Tutti | Girone A`.
- `selGir = 'ALL'` → calendario per giornata di tutta la categoria; classifiche = tutte le tabelle-girone della categoria.

## Criteri di successo

1. E1 (post-generazione): i tab categoria/girone filtrano contemporaneamente calendario e classifiche; default = prima categoria, tutti i gironi.
2. E3 calendario e classifiche (pubblicato): tab propri filtrano la rispettiva vista.
3. Cambiare categoria resetta il girone a "Tutti" e aggiorna la barra gironi.
4. Barre scrollabili su mobile; nessuno scroll orizzontale di pagina; look coerente.
5. Test esistenti restano verdi (nessun cambio di logica/store).

## Fuori scope / futuro

Deep-link `?cat=&gir=`, persistenza selezione, finali (Fetta B).
