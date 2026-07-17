# Design — Calendar editor (reschedule) (B2) — O7

- **Data:** 2026-07-17
- **Stato:** approvato in brainstorming
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-web-mockups]]; Blueprint `o7-scheduling.md`. Segue B1 (gironi editor).

## Contesto e obiettivo

Secondo editor: spostare i match di girone (campo/giorno/ora) direttamente sul calendario E1, con controlli a select (mobile-friendly). I `ScheduledMatch` sono già salvati → si modificano in place. Consentito anche a calendario pubblicato (i rinvii capitano a torneo in corso), distinto dalla rigenerazione. Mockup mid-fi.

## Scope

**Incluso:** `rescheduleMatch` store op; `renderCalendar` in modalità editabile (pulsante "Modifica" per match); pannello di modifica in E1 (`schedule.html`) con campo/giorno/ora.

**Non incluso:** drag&drop; rilevamento conflitti; notifiche; modifica dei match **finali** (FinalMatch — segnaposto); modifica dal pubblico E3 (resta read-only).

## Store

`rescheduleMatch(matchId: string, patch: { day: string; time: string; field: string }): void` — trova il `ScheduledMatch` per id e aggiorna `day`/`time`/`field`. Nessun gate oltre l'esistenza (il match esiste solo dopo la generazione); indipendente da `groupsLocked` e dallo stato APPROVED/PUBLISHED (il reschedule è consentito sempre). `getScheduledMatches` invariato.

## `renderCalendar` — modalità editabile

Firma: `renderCalendar(matches: ScheduledMatch[], catName: (id: string) => string, editable = false): string`. Quando `editable`, ogni `.pf-match` include un pulsante `<button class="pf-btn js-editmatch" data-match="${m.id}">Modifica</button>`. Con `editable = false` (default) l'output è identico a oggi → E3 (`calendar.html`) invariato.

## Schermata E1 `schedule.html`

- Contenitore `#editmatch` (sopra il calendario).
- Il calendario E1 usa `renderCalendar(filtered, catName, true)`.
- Click su "Modifica" di un match → `#editmatch` mostra un pannello (card): titolo `home vs away`, select **campo** (i `fields` della categoria del match, da `schedule().config.byCategory[categoryId].fields`; fallback: campi distinti presenti nel calendario), input **giorno** (`type=date`, precompilato con `m.day`), input **ora** (`type=time`, precompilato con `m.time`); pulsanti **Salva** / **Annulla**.
- **Salva** → `rescheduleMatch(id, { day, time, field })` → chiude il pannello → re-render (`renderViews`). **Annulla** → chiude il pannello.
- Funziona in ogni stato del calendario (anche PUBLISHED). La selezione categoria/girone (tab) resta.

## Revisione Blueprint

**D-O7-3** (`o7-scheduling.md`): reschedule manuale di un singolo match (`MatchRescheduled` — nuovo campo/slot/giorno), consentito anche su calendario pubblicato, distinto dalla rigenerazione in massa (che è bloccata da APPROVED/PUBLISHED).

## Criteri di successo

1. In E1, "Modifica" su un match apre il pannello con valori correnti; salvando campo/giorno/ora, quel match cambia nel calendario E1 e nel calendario pubblico E3; gli altri restano invariati.
2. Funziona dopo la pubblicazione (reschedule live).
3. Il pubblico resta read-only (nessun "Modifica").
4. Un test copre `rescheduleMatch`; suite verde; niente cambi di comportamento su E3.

## Fuori scope / futuro

Drag&drop; conflitti/validazione slot; notifiche di rinvio; reschedule dei match finali.
