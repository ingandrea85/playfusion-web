# ov — Event Workspace organizer (ov1 + ov2)

**Data:** 2026-07-20
**Stato:** design approvato, pronto per il piano
**Esperienze toccate:** E1 Organizer (navigazione evento)

## Obiettivo

Trasformare l'event-hub dell'organizer da **checklist di setup** a **workspace
operativo**: una home con hero sticky, navigazione a tab e una *Panoramica* che
cambia con la fase del torneo. Include lo scorporo delle viste operative
(Calendario / Classifiche / Tabellone) oggi accorpate in `schedule.html`.

Deriva da un brainstorming visuale: struttura **workspace a tab**, barra
**gestione + ⚙ Impostazioni**, Panoramica fase-aware con quattro blocchi in
fase "in corso".

## Architettura: shell condiviso

Nuovo helper in `shared/chrome.ts`:

```ts
renderOrganizerWorkspace(event: TournamentEvent, activeKey: string): string
```

Rende due parti:
1. **Hero sticky**: nome evento, **badge fase** (In preparazione / In corso /
   Concluso), meta (`sport · location · date`) e 2-3 statistiche
   (es. squadre confermate; partite giocate / totali).
2. **Barra di tab** (riuso classi `pf-tabs`/`pf-tab`, ognuna un link `<a>`):
   `Panoramica · Iscrizioni · Calendario · Classifiche · Tabellone · Avvisi · ⚙ Impostazioni`.
   La tab con `activeKey` è evidenziata (`aria-current`/`aria-selected`).

Ogni pagina-sezione dell'organizer inietta questo shell e passa la propria
`activeKey`. Sostituisce l'attuale `renderOrganizerTopbar` sulle pagine evento
(la dashboard "Eventi" mantiene la topbar semplice).

Destinazioni delle tab (dipendono dal playbook dove indicato):

| Tab (`activeKey`) | Destinazione |
|---|---|
| `overview` | `event-hub.html` (Panoramica) |
| `enroll` | PB-1 → `registrations.html`; PB-2 → `teams.html` |
| `calendar` | `schedule.html` (sezione Calendario) |
| `standings` | `classifiche.html` (**nuova**) |
| `bracket` | `tabellone.html` (**nuova**) |
| `announcements` | `avvisi.html` |
| `settings` | menu → `competition.html`, `gironi.html`, `categories.html` |

## Modello di fase — `shared/mock/overview.ts` (nuovo, puro e testabile)

```ts
type EventPhase = 'PREP' | 'LIVE' | 'DONE'
function eventPhase(state: State, eventId: string): EventPhase
```

- **PREP**: `schedule.status !== 'PUBLISHED'` (o schedule assente).
- **DONE**: pubblicato **e** ogni `scheduledMatch` dell'evento ha punteggio
  **e** ogni `FinalMatch` dell'evento ha punteggio.
- **LIVE**: pubblicato ma non ancora concluso.

Altre funzioni pure (usate dalla Panoramica, tutte prendono `state`+`eventId`):

- `pendingActions(state, eventId)`: `{ missingResults: number; unresolvedTies: number; unpaid: number; notPublished: boolean }`.
  - `missingResults` = partite di girone senza punteggio (solo se pubblicato).
  - `unresolvedTies` = numero di gruppi con parità irrisolta (via `rankStanding`).
  - `unpaid` = registrazioni `CONFIRMED` con `paymentStatus === 'UNPAID'` (solo PB-1).
  - `notPublished` = `schedule.status !== 'PUBLISHED'`.
- `nextMatches(state, eventId, n)`: primi `n` `scheduledMatch` **senza** punteggio, ordinati per `day` poi `time`.
- `lastResults(state, eventId, n)`: ultimi `n` `scheduledMatch` **con** punteggio, ordinati per `day`/`time` decrescente.
- `groupLeaders(state, eventId)`: per ogni `categoryId`+`groupLabel`, la squadra prima in classifica (via `rankStanding`), con nome categoria e girone.

## Panoramica fase-aware — `event-hub.html` (riscritta)

Rende lo shell (`activeKey: 'overview'`) + un corpo che dipende da `eventPhase`:

- **PREP** — card **"Prossimi passi"**: l'attuale steplist (da `event-hub.ts`)
  con barra di avanzamento (n. step completati / totali); + mini-stat
  (iscrizioni totali / da confermare, n. categorie). I link puntano alle pagine
  di setup (categorie, iscrizioni, competizione, gironi, calendario).
- **LIVE** — quattro blocchi:
  1. **"Da fare ora"**: righe da `pendingActions` (solo quelle > 0 / vere), ognuna linkata alla sezione giusta (risultati→Calendario, parità→Classifiche, quote→Iscrizioni/payments, pubblica→Calendario).
  2. **Prossime partite**: `nextMatches(…, 5)` con orario/campo/categoria.
  3. **Ultimi risultati**: `lastResults(…, 5)` con punteggio.
  4. **Classifiche in breve**: `groupLeaders` — capoclassifica per girone.
- **DONE** — **Campioni** per categoria (dai `FinalMatch` con `round === 'Finale'` decisi, via `decideMatch`) + riepilogo (partite giocate, squadre).

## Scorporo di `schedule.html` (ov2)

`schedule.html`/`.ts` oggi accorpa: config finestra/gioco, azioni
genera/approva/pubblica, calendario editabile, classifiche + risoluzione
parità, tabellone + risultati finali.

- **Calendario** (`schedule.html`, `activeKey: 'calendar'`): resta config +
  genera/approva/pubblica + **calendario editabile** (sposta match, risultato) +
  tab categoria/girone. Rimuove le sezioni classifiche e tabellone.
- **Classifiche** (`classifiche.html`/`.ts`, **nuova**, `activeKey: 'standings'`):
  tab categoria/girone + `renderStandings` + **risolvi parità** (riuso del
  pannello `openTiePanel` e di `setTieOverride`).
- **Tabellone** (`tabellone.html`/`.ts`, **nuova**, `activeKey: 'bracket'`):
  tab categoria + `renderBracket(…, true)` + **risultato finale** (riuso del
  pannello `openFinalResultPanel` e di `recordFinalResult`).

Le logiche dei pannelli (edit match, risultato, risultato finale, risolvi
parità) che oggi vivono in `schedule.ts` vengono estratte in un modulo
condiviso `apps/organizer/panels.ts` così Calendario/Classifiche/Tabellone le
riusano senza duplicare. (Miglioramento in-scope: `schedule.ts` è cresciuto
troppo e va alleggerito con l'estrazione.)

## Adozione dello shell sulle altre pagine

`categories`, `registrations`, `inbox`, `payments`, `teams`, `competition`,
`gironi`, `avvisi` sostituiscono `renderOrganizerTopbar(...)` con
`renderOrganizerWorkspace(event, <activeKey>)` così la navigazione a tab è
sempre presente e coerente. Le pagine di dettaglio non mappate a una tab
(`inbox`, `payments`, `categories`) usano `activeKey: 'enroll'` o `'settings'`
secondo l'appartenenza.

## Vite

Registrare i nuovi entry `classifiche` e `tabellone` in `vite.config.ts`.

## Test

`shared/mock/overview.test.ts` (scenario-driven, reset seed):
- `eventPhase`: `evt-1` (schedule NONE) → PREP; un demo pubblicato con tutte le
  gare giocate → DONE; un pubblicato con gare mancanti → LIVE.
- `pendingActions`: conta risultati mancanti, parità (usare `evt-tie-open`),
  quote non pagate (PB-1), `notPublished`.
- `nextMatches`/`lastResults`: ordinamento corretto e partizione per punteggio.
- `groupLeaders`: primo per girone.
- Le suite esistenti (99 test) restano verdi.

Le pagine (shell, Panoramica, Classifiche, Tabellone) si verificano con
`npm run build` + `tsc --noEmit` + verifica manuale (nessun unit test di pagina,
come nel resto del repo).

## Fuori scope (YAGNI)

Redesign del public (E3) o admin (E4); nuove capacità di torneo; nozione di
"orario corrente" reale (le "prossime partite" sono le non giocate in ordine di
calendario, non rispetto all'ora di sistema); notifiche real-time.

## Naming

Tag di fetta **`ov`**.
