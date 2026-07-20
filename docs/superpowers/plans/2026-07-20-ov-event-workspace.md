# ov — Event Workspace organizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare l'event-hub in un workspace a tab con Panoramica fase-aware, e scorporare Calendario/Classifiche/Tabellone da `schedule.html`.

**Architecture:** Un helper `renderOrganizerWorkspace(event, activeKey)` (hero sticky + barra tab) sostituisce `renderOrganizerTopbar` sulle pagine evento; un modulo puro `shared/mock/overview.ts` calcola fase e blocchi della Panoramica; i pannelli editor comuni si estraggono in `apps/organizer/panels.ts` e alimentano Calendario + due pagine nuove (Classifiche, Tabellone).

**Tech Stack:** TypeScript, Vite (MPA), Vitest + jsdom. Nessuna dipendenza nuova.

## Global Constraints

- Stato finto: seed + `localStorage` (`playfusion-mock-v1`). Nessun backend.
- Fasi: **PREP** = `schedule.status !== 'PUBLISHED'`; **DONE** = pubblicato e ogni `scheduledMatch` e ogni `FinalMatch` dell'evento ha punteggio; **LIVE** = pubblicato ma non DONE.
- Tab: `Panoramica · Iscrizioni · Calendario · Classifiche · Tabellone · Avvisi · ⚙ Impostazioni`. activeKey: `overview | enroll | calendar | standings | bracket | announcements | settings`.
- Iscrizioni: PB-1 → `registrations.html`; PB-2 → `teams.html`. ⚙ Impostazioni → `competition.html` / `gironi.html` / `categories.html`.
- "Prossime partite" = partite non giocate in ordine di calendario (nessun orario di sistema reale).
- Solo classi CSS esistenti + eventuale micro-CSS per hero/tab sticky. Testi in italiano. Tag di fetta: `ov`.

---

### Task 1: Modulo `overview.ts` (fase + blocchi Panoramica)

**Files:**
- Create: `shared/mock/overview.ts`
- Modify: `shared/mock/store.ts` (import + 5 wrapper che passano `load()`)
- Test: `shared/mock/overview.test.ts`

**Interfaces:**
- Consumes: `State`, `ScheduledMatch`, `StandingRow`, `FinalMatch` da `./types`; `rankStanding` da `./ranking`; `decideMatch` da `./derive`; getter/mutation store esistenti nei test.
- Produces (usati dalla Panoramica in Task 3, via wrapper store):
  - `type EventPhase = 'PREP' | 'LIVE' | 'DONE'`
  - `getEventPhase(eventId: string): EventPhase`
  - `getPendingActions(eventId: string): { missingResults: number; unresolvedTies: number; unpaid: number; notPublished: boolean }`
  - `getNextMatches(eventId: string, n: number): ScheduledMatch[]`
  - `getLastResults(eventId: string, n: number): ScheduledMatch[]`
  - `getGroupLeaders(eventId: string): Array<{ categoryId: string; groupLabel: string; team: string }>`

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `shared/mock/overview.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  resetDemo, getSchedule, getScheduledMatches, getFinals,
  generateSchedule, approveSchedule, publishSchedule, recordResult, recordFinalResult,
  getEventPhase, getPendingActions, getNextMatches, getLastResults, getGroupLeaders,
} from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

function publishEvt1() {
  generateSchedule('evt-1', getSchedule('evt-1')!.config); approveSchedule('evt-1'); publishSchedule('evt-1')
}

describe('eventPhase', () => {
  it('PREP when schedule not published', () => {
    expect(getEventPhase('evt-1')).toBe('PREP')
  })
  it('LIVE when published with finals unplayed', () => {
    expect(getEventPhase('evt-finals')).toBe('LIVE') // demo: groups played, finals not
  })
  it('DONE once every group and finals match has a score', () => {
    const semis = getFinals('evt-finals').filter(f => f.round === 'Semifinali')
    recordFinalResult(semis[0].id, 2, 0); recordFinalResult(semis[1].id, 1, 0)
    for (const f of getFinals('evt-finals').filter(f => f.homeScore === null)) recordFinalResult(f.id, 1, 0)
    expect(getEventPhase('evt-finals')).toBe('DONE')
  })
})

describe('pendingActions', () => {
  it('flags not-published and missing results after publish', () => {
    expect(getPendingActions('evt-1').notPublished).toBe(true)
    publishEvt1()
    const p = getPendingActions('evt-1')
    expect(p.notPublished).toBe(false)
    expect(p.missingResults).toBeGreaterThan(0) // fresh calendar, nothing played
  })
  it('counts unresolved ties', () => {
    expect(getPendingActions('evt-tie-open').unresolvedTies).toBeGreaterThanOrEqual(1)
  })
  it('counts confirmed-unpaid registrations', () => {
    // evt-1 seed: reg-2 and reg-6 are CONFIRMED + UNPAID
    expect(getPendingActions('evt-1').unpaid).toBe(2)
  })
})

describe('nextMatches / lastResults', () => {
  it('nextMatches returns unplayed sorted by day/time', () => {
    publishEvt1()
    const nm = getNextMatches('evt-1', 3)
    expect(nm.length).toBeGreaterThan(0)
    expect(nm.every(m => m.homeScore === null)).toBe(true)
    for (let i = 1; i < nm.length; i++) expect(`${nm[i - 1].day}${nm[i - 1].time}` <= `${nm[i].day}${nm[i].time}`).toBe(true)
  })
  it('lastResults returns played sorted most-recent first', () => {
    const lr = getLastResults('evt-finals', 3)
    expect(lr.length).toBeGreaterThan(0)
    expect(lr.every(m => m.homeScore !== null)).toBe(true)
  })
})

describe('groupLeaders', () => {
  it('returns one leader per group', () => {
    const leaders = getGroupLeaders('evt-finals')
    expect(leaders.length).toBeGreaterThan(0)
    expect(leaders[0].team.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

Run: `npm test -- overview`
Expected: FAIL (wrapper store non esistono).

- [ ] **Step 3: Crea `shared/mock/overview.ts`**

```ts
import type { State, ScheduledMatch, EventPhase } from './types'
import { rankStanding } from './ranking'

export function eventPhase(state: State, eventId: string): EventPhase {
  const sched = state.schedules.find(s => s.eventId === eventId)
  if (!sched || sched.status !== 'PUBLISHED') return 'PREP'
  const groupDone = state.scheduledMatches.filter(m => m.eventId === eventId).every(m => m.homeScore !== null && m.awayScore !== null)
  const finalsDone = state.finals.filter(f => f.eventId === eventId).every(f => f.homeScore !== null && f.awayScore !== null)
  return groupDone && finalsDone ? 'DONE' : 'LIVE'
}

function distinctGroups(state: State, eventId: string): Array<{ categoryId: string; groupLabel: string }> {
  const out: Array<{ categoryId: string; groupLabel: string }> = []
  for (const s of state.standings) {
    if (s.eventId !== eventId) continue
    if (!out.some(x => x.categoryId === s.categoryId && x.groupLabel === s.groupLabel)) out.push({ categoryId: s.categoryId, groupLabel: s.groupLabel })
  }
  return out
}
function rankGroup(state: State, eventId: string, categoryId: string, groupLabel: string) {
  const rows = state.standings.filter(s => s.eventId === eventId && s.categoryId === categoryId && s.groupLabel === groupLabel)
  const matches = state.scheduledMatches.filter(m => m.eventId === eventId && m.categoryId === categoryId && m.groupLabel === groupLabel)
  const policy = state.events.find(e => e.id === eventId)?.tieBreak ?? []
  const overrides = state.tieOverrides.filter(o => o.eventId === eventId && o.categoryId === categoryId && o.groupLabel === groupLabel).map(o => o.order)
  return rankStanding(rows, matches, policy, overrides)
}

export function pendingActions(state: State, eventId: string) {
  const sched = state.schedules.find(s => s.eventId === eventId)
  const notPublished = !sched || sched.status !== 'PUBLISHED'
  const missingResults = state.scheduledMatches.filter(m => m.eventId === eventId && (m.homeScore === null || m.awayScore === null)).length
  let unresolvedTies = 0
  for (const g of distinctGroups(state, eventId)) if (rankGroup(state, eventId, g.categoryId, g.groupLabel).unresolved.length) unresolvedTies++
  const ev = state.events.find(e => e.id === eventId)
  const unpaid = ev?.playbook === 'PB-2' ? 0 : state.registrations.filter(r => r.eventId === eventId && r.status === 'CONFIRMED' && r.paymentStatus === 'UNPAID').length
  return { missingResults, unresolvedTies, unpaid, notPublished }
}

export function nextMatches(state: State, eventId: string, n: number): ScheduledMatch[] {
  return state.scheduledMatches.filter(m => m.eventId === eventId && (m.homeScore === null || m.awayScore === null))
    .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time)).slice(0, n)
}
export function lastResults(state: State, eventId: string, n: number): ScheduledMatch[] {
  return state.scheduledMatches.filter(m => m.eventId === eventId && m.homeScore !== null && m.awayScore !== null)
    .sort((a, b) => (b.day + b.time).localeCompare(a.day + a.time)).slice(0, n)
}
export function groupLeaders(state: State, eventId: string): Array<{ categoryId: string; groupLabel: string; team: string }> {
  const out: Array<{ categoryId: string; groupLabel: string; team: string }> = []
  for (const g of distinctGroups(state, eventId)) {
    const top = rankGroup(state, eventId, g.categoryId, g.groupLabel).rows[0]
    if (top) out.push({ categoryId: g.categoryId, groupLabel: g.groupLabel, team: top.team })
  }
  return out
}
```

- [ ] **Step 4: Aggiungi `EventPhase` ai tipi**

In `shared/mock/types.ts`, in cima (dopo gli altri `type`), aggiungi:

```ts
export type EventPhase = 'PREP' | 'LIVE' | 'DONE'
```

- [ ] **Step 5: Aggiungi i wrapper store**

In `shared/mock/store.ts`, aggiungi l'import in cima:

```ts
import { eventPhase, pendingActions, nextMatches, lastResults, groupLeaders } from './overview'
import type { EventPhase } from './types'
```

In fondo al file:

```ts
export function getEventPhase(eventId: string): EventPhase { return eventPhase(load(), eventId) }
export function getPendingActions(eventId: string) { return pendingActions(load(), eventId) }
export function getNextMatches(eventId: string, n: number) { return nextMatches(load(), eventId, n) }
export function getLastResults(eventId: string, n: number) { return lastResults(load(), eventId, n) }
export function getGroupLeaders(eventId: string) { return groupLeaders(load(), eventId) }
```

- [ ] **Step 6: Esegui i test**

Run: `npm test -- overview`
Expected: PASS.

- [ ] **Step 7: Suite completa + typecheck**

Run: `npm test` → tutti PASS (99 + nuovi).
Run: `npx tsc --noEmit` → nessun errore.

- [ ] **Step 8: Commit**

```bash
git add shared/mock/overview.ts shared/mock/overview.test.ts shared/mock/types.ts shared/mock/store.ts docs/superpowers/specs/2026-07-20-ov-event-workspace-design.md docs/superpowers/plans/2026-07-20-ov-event-workspace.md
git commit -m "feat(ov): overview.ts — event phase + panoramica building blocks"
```

---

### Task 2: Shell condiviso `renderOrganizerWorkspace`

**Files:**
- Modify: `shared/chrome.ts` (nuovo export + CSS via ui.css)
- Modify: `shared/ui.css` (hero + tab bar sticky)

**Interfaces:**
- Consumes: `TournamentEvent` da `./mock/types`; `getEventPhase` NON qui (lo shell riceve la fase già calcolata per restare sync-free — la fase è passata dal chiamante). Rivedi: per semplicità lo shell importa `getEventPhase` e `getRegistrations` da `./mock/store`.
- Produces: `renderOrganizerWorkspace(event: TournamentEvent, activeKey: string): string`.

- [ ] **Step 1: Aggiungi l'helper in `shared/chrome.ts`**

In cima, estendi gli import store (chrome.ts oggi importa solo tipi/funzioni derive; aggiungi):

```ts
import type { TournamentEvent } from './mock/types'
import { getEventPhase } from './mock/store'
```

Aggiungi la funzione (vicino a `renderOrganizerTopbar`):

```ts
export function renderOrganizerWorkspace(event: TournamentEvent, activeKey: string): string {
  const id = event.id
  const phase = getEventPhase(id)
  const phaseLabel = { PREP: 'In preparazione', LIVE: 'In corso', DONE: 'Concluso' }[phase]
  const phaseMod = { PREP: 'prep', LIVE: 'live', DONE: 'done' }[phase]
  const enroll = event.playbook === 'PB-2' ? 'teams' : 'registrations'
  const tabs: Array<{ key: string; label: string; href: string }> = [
    { key: 'overview', label: 'Panoramica', href: `/apps/organizer/event-hub.html?event=${id}` },
    { key: 'enroll', label: 'Iscrizioni', href: `/apps/organizer/${enroll}.html?event=${id}` },
    { key: 'calendar', label: 'Calendario', href: `/apps/organizer/schedule.html?event=${id}` },
    { key: 'standings', label: 'Classifiche', href: `/apps/organizer/classifiche.html?event=${id}` },
    { key: 'bracket', label: 'Tabellone', href: `/apps/organizer/tabellone.html?event=${id}` },
    { key: 'announcements', label: 'Avvisi', href: `/apps/organizer/avvisi.html?event=${id}` },
    { key: 'settings', label: '⚙ Impostazioni', href: `/apps/organizer/competition.html?event=${id}` },
  ]
  const nav = tabs.map(t => `<a class="pf-wtab${t.key === activeKey ? ' pf-wtab--active' : ''}" href="${t.href}">${t.label}</a>`).join('')
  return `
    <div class="pf-topbar"><a class="pf-brand" href="/apps/organizer/dashboard.html">play<b>fusion</b><small>Organizer</small></a>
      <nav><a href="/apps/organizer/dashboard.html">Eventi</a><a href="/index.html">Esci demo</a></nav></div>
    <div class="pf-whero">
      <div class="pf-whero__inner">
        <span class="pf-wphase pf-wphase--${phaseMod}">${phaseLabel}</span>
        <h1>${event.name}</h1>
        <div class="pf-mono pf-muted">${event.sport} · ${event.location} · ${event.startDate}→${event.endDate}</div>
      </div>
      <nav class="pf-wtabs">${nav}</nav>
    </div>`
}
```

- [ ] **Step 2: Aggiungi il CSS in `shared/ui.css`**

In fondo al file:

```css
/* ---------- Organizer workspace (hero + tabs) ---------- */
.pf-whero { position: sticky; top: 0; z-index: 20; background: var(--color-surface); border-bottom: 1px solid var(--color-border-strong); }
.pf-whero__inner { max-width: 960px; margin: 0 auto; padding: var(--space-4) var(--space-4) var(--space-3); }
.pf-whero h1 { margin: 6px 0 4px; }
.pf-wphase { display: inline-block; padding: 3px 10px; border-radius: var(--radius-pill); font-size: 11px; font-weight: 700; }
.pf-wphase--prep { background: #fef3e2; color: #b45309; }
.pf-wphase--live { background: #eafaf1; color: var(--color-success); }
.pf-wphase--done { background: #eef2f7; color: var(--color-text-soft); }
.pf-wtabs { display: flex; gap: 2px; max-width: 960px; margin: 0 auto; padding: 0 var(--space-4); overflow-x: auto; }
.pf-wtab { padding: 10px 14px; font-weight: 700; font-size: 14px; color: var(--color-text-soft); text-decoration: none; border-bottom: 2px solid transparent; white-space: nowrap; }
.pf-wtab--active { color: var(--color-action-primary); border-bottom-color: var(--color-action-primary); }
```

- [ ] **Step 3: Build + typecheck**

Run: `npm run build` → OK.
Run: `npx tsc --noEmit` → nessun errore.

- [ ] **Step 4: Commit**

```bash
git add shared/chrome.ts shared/ui.css
git commit -m "feat(ov): renderOrganizerWorkspace shell (sticky hero + tab bar)"
```

---

### Task 3: Panoramica fase-aware (`event-hub.html` riscritta)

**Files:**
- Modify: `apps/organizer/event-hub.html` (contenitori)
- Modify: `apps/organizer/event-hub.ts` (riscrittura)

**Interfaces:**
- Consumes: `renderOrganizerWorkspace` (Task 2); `getEventPhase`, `getPendingActions`, `getNextMatches`, `getLastResults`, `getGroupLeaders` (Task 1); getter esistenti; `decideMatch` da `../../shared/mock/derive`.
- Produces: Panoramica su `activeKey: 'overview'`.

- [ ] **Step 1: Aggiorna l'HTML**

Sostituisci `apps/organizer/event-hub.html` con:

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Evento</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header id="shell"></header>
  <main class="pf-container" id="body"></main>
  <script type="module" src="./event-hub.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Riscrivi `event-hub.ts`**

```ts
import { renderOrganizerWorkspace, renderCalendar } from '../../shared/chrome'
import { decideMatch } from '../../shared/mock/derive'
import {
  getEvent, getRegistrations, getCategories, getCompetitions, getSchedule, getGroupSlots,
  getEventPhase, getPendingActions, getNextMatches, getLastResults, getGroupLeaders, getFinals,
} from '../../shared/mock/store'

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const event = getEvent(id)
if (!event) {
  document.getElementById('body')!.innerHTML = `<p class="pf-muted">Evento non trovato.</p>`
} else {
  document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(event, 'overview')
  const catName = (c: string) => getCategories(id).find(x => x.id === c)?.name ?? '—'
  const body = document.getElementById('body')!
  const phase = getEventPhase(id)
  if (phase === 'PREP') body.innerHTML = renderPrep()
  else if (phase === 'LIVE') body.innerHTML = renderLive()
  else body.innerHTML = renderDone()

  function renderPrep(): string {
    const regs = getRegistrations(id)
    const cats = getCategories(id); const comps = getCompetitions(id)
    const pb2 = event!.playbook === 'PB-2'
    const schedStatus = getSchedule(id)?.status ?? 'NONE'
    const gironiComposed = cats.length > 0 && cats.every(c => getGroupSlots(id).some(s => s.categoryId === c.id))
    const competitionConfigured = cats.length > 0 && cats.every(c => comps.some(k => k.categoryId === c.id))
    const steps: Array<{ label: string; href?: string; done: boolean }> = [
      { label: 'Crea evento da template', done: true },
      { label: 'Configura categorie', href: `/apps/organizer/categories.html?event=${id}`, done: true },
      ...(pb2
        ? [{ label: 'Inserisci squadre', href: `/apps/organizer/teams.html?event=${id}`, done: regs.some(r => r.status === 'CONFIRMED') }]
        : [
            { label: 'Apri iscrizioni', href: `/apps/organizer/registrations.html?event=${id}`, done: !!event!.registrationsOpen },
            { label: 'Conferma squadre', href: `/apps/organizer/inbox.html?event=${id}`, done: regs.some(r => r.status === 'CONFIRMED') },
            { label: 'Riscuoti quote', href: `/apps/organizer/payments.html?event=${id}`, done: regs.some(r => r.paymentStatus === 'PAID') },
          ]),
      { label: 'Configura competizione', href: `/apps/organizer/competition.html?event=${id}`, done: competitionConfigured },
      { label: 'Componi gironi', href: `/apps/organizer/gironi.html?event=${id}`, done: gironiComposed },
      { label: 'Genera calendario', href: `/apps/organizer/schedule.html?event=${id}`, done: schedStatus !== 'NONE' },
      { label: 'Approva e pubblica', href: `/apps/organizer/schedule.html?event=${id}`, done: schedStatus === 'PUBLISHED' },
    ]
    const doneN = steps.filter(s => s.done).length
    const pct = Math.round((doneN / steps.length) * 100)
    const rows = steps.map(s => `<li data-done="${s.done}">${s.href ? `<a href="${s.href}">${s.label}</a>` : `<span>${s.label}</span>`}</li>`).join('')
    return `<div class="pf-card"><h2>Prossimi passi</h2>
      <div style="height:8px;background:#e2e8f0;border-radius:99px;margin:8px 0"><div style="width:${pct}%;height:8px;background:var(--color-action-primary);border-radius:99px"></div></div>
      <div class="pf-muted" style="margin-bottom:var(--space-3)">Setup ${pct}%</div>
      <ol class="pf-steplist">${rows}</ol></div>
      <div class="pf-card pf-muted">${regs.length} iscrizioni · ${regs.filter(r => r.status !== 'CONFIRMED').length} da confermare · ${cats.length} categorie</div>`
  }

  function renderLive(): string {
    const p = getPendingActions(id)
    const todo: string[] = []
    if (p.notPublished) todo.push(`<li><a href="/apps/organizer/schedule.html?event=${id}">Pubblica il calendario</a></li>`)
    if (p.missingResults) todo.push(`<li><a href="/apps/organizer/schedule.html?event=${id}">${p.missingResults} risultati da inserire</a></li>`)
    if (p.unresolvedTies) todo.push(`<li><a href="/apps/organizer/classifiche.html?event=${id}">${p.unresolvedTies} parità da risolvere</a></li>`)
    if (p.unpaid) todo.push(`<li><a href="/apps/organizer/payments.html?event=${id}">${p.unpaid} quote non pagate</a></li>`)
    const todoCard = todo.length ? `<div class="pf-card"><h2>Da fare ora</h2><ul class="pf-todo">${todo.join('')}</ul></div>` : ''
    const next = getNextMatches(id, 5)
    const nextCard = `<div class="pf-card"><h2>Prossime partite</h2>${next.length ? renderCalendar(next, catName) : '<p class="pf-muted">Nessuna partita in programma.</p>'}</div>`
    const last = getLastResults(id, 5)
    const lastCard = `<div class="pf-card"><h2>Ultimi risultati</h2>${last.length ? renderCalendar(last, catName) : '<p class="pf-muted">Ancora nessun risultato.</p>'}</div>`
    const leaders = getGroupLeaders(id)
    const leadCard = `<div class="pf-card"><h2>Classifiche in breve</h2>${leaders.length
      ? `<ul class="pf-roster">${leaders.map(l => `<li class="pf-rosterrow"><span class="pf-mono pf-muted">${catName(l.categoryId)} · ${l.groupLabel}</span><span class="pf-rosterrow__name">${l.team}</span></li>`).join('')}</ul>
         <a class="pf-btn" href="/apps/organizer/classifiche.html?event=${id}">Vedi classifiche →</a>`
      : '<p class="pf-muted">Classifiche non disponibili.</p>'}</div>`
    return todoCard + nextCard + lastCard + leadCard
  }

  function renderDone(): string {
    const champs = getFinals(id).filter(f => f.round === 'Finale').map(f => {
      const d = decideMatch(f); return d ? `<li class="pf-rosterrow"><span class="pf-mono pf-muted">${catName(f.categoryId)} · ${f.bracketLabel}</span><span class="pf-rosterrow__name">🏆 ${d.winner}</span></li>` : ''
    }).join('')
    const played = getScheduledMatches(id).filter(m => m.homeScore !== null).length
    return `<div class="pf-card"><h2>Campioni</h2>${champs ? `<ul class="pf-roster">${champs}</ul>` : '<p class="pf-muted">Nessun campione decretato.</p>'}</div>
      <div class="pf-card pf-muted">${played} partite giocate · ${getRegistrations(id).filter(r => r.status === 'CONFIRMED').length} squadre</div>`
  }
}
```

(Nota: aggiungi l'import mancante `getScheduledMatches` alla riga di import store.)

- [ ] **Step 3: CSS minimo per le liste**

In `shared/ui.css`, in fondo:

```css
.pf-todo { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.pf-todo li { padding: 8px 12px; background: #fff8f8; border: 1px solid #fde0e0; border-radius: var(--radius-2); }
```

- [ ] **Step 4: Build + typecheck + verifica**

Run: `npm run build` → OK. Run: `npx tsc --noEmit` → OK.
Manuale: `evt-1` mostra Panoramica PREP (prossimi passi + barra); dopo genera/approva/pubblica in Calendario, torna in Panoramica → LIVE (Da fare ora + prossime/ultimi + classifiche); `evt-finals` giocato tutto → DONE (campioni).

- [ ] **Step 5: Commit**

```bash
git add apps/organizer/event-hub.html apps/organizer/event-hub.ts shared/ui.css
git commit -m "feat(ov): phase-aware Panoramica (PREP steps / LIVE dashboard / DONE champions)"
```

---

### Task 4: Estrai i pannelli editor in `apps/organizer/panels.ts`

**Files:**
- Create: `apps/organizer/panels.ts`
- (nessun consumo finché Task 5-7 non lo usano)

**Interfaces:**
- Consumes: store mutation (`rescheduleMatch`, `recordResult`, `recordFinalResult`, `setTieOverride`), getter, `getScheduledMatches`, `getFinals`.
- Produces: funzioni che aprono un pannello nel container `#editmatch` e richiamano un callback `onDone`:
  - `openEditPanel(eventId, matchId, onDone)`
  - `openResultPanel(eventId, matchId, onDone)`
  - `openFinalResultPanel(eventId, finalMatchId, onDone)`
  - `openTiePanel(eventId, categoryId, groupLabel, teams, onDone)`

- [ ] **Step 1: Crea `panels.ts`**

Sposta le 4 funzioni pannello da `schedule.ts` (righe 120-220) in `panels.ts`, parametrizzando `id` e il refresh. Contenuto:

```ts
import { getScheduledMatches, getFinals, getSchedule, rescheduleMatch, recordResult, recordFinalResult, setTieOverride } from '../../shared/mock/store'

function panel(): HTMLElement { return document.getElementById('editmatch')! }

export function openEditPanel(eventId: string, matchId: string, onDone: () => void): void {
  const m = getScheduledMatches(eventId).find(x => x.id === matchId); if (!m) return
  const fields = getSchedule(eventId)?.config.byCategory[m.categoryId]?.fields ?? [...new Set(getScheduledMatches(eventId).map(x => x.field))]
  panel().innerHTML = `<div class="pf-card"><h2>Sposta partita</h2><p class="pf-muted">${m.home} vs ${m.away}</p>
    <div class="pf-field"><label>Campo</label><select id="em-field">${fields.map(f => `<option value="${f}"${f === m.field ? ' selected' : ''}>${f}</option>`).join('')}</select></div>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Giorno</label><input id="em-day" type="date" value="${m.day}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Ora</label><input id="em-time" type="time" value="${m.time}" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="em-save">Salva</button><button class="pf-btn" id="em-cancel">Annulla</button></div></div>`
  document.getElementById('em-save')!.addEventListener('click', () => {
    rescheduleMatch(matchId, { day: (document.getElementById('em-day') as HTMLInputElement).value, time: (document.getElementById('em-time') as HTMLInputElement).value, field: (document.getElementById('em-field') as HTMLSelectElement).value })
    onDone()
  })
  document.getElementById('em-cancel')!.addEventListener('click', () => { panel().innerHTML = '' })
}

export function openResultPanel(eventId: string, matchId: string, onDone: () => void): void {
  const m = getScheduledMatches(eventId).find(x => x.id === matchId); if (!m) return
  panel().innerHTML = `<div class="pf-card"><h2>Risultato</h2><p class="pf-muted">${m.home} vs ${m.away}</p>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${m.home}</label><input id="rs-home" type="number" min="0" value="${m.homeScore ?? 0}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${m.away}</label><input id="rs-away" type="number" min="0" value="${m.awayScore ?? 0}" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="rs-save">Salva</button><button class="pf-btn" id="rs-cancel">Annulla</button></div></div>`
  document.getElementById('rs-save')!.addEventListener('click', () => {
    recordResult(matchId, Number((document.getElementById('rs-home') as HTMLInputElement).value), Number((document.getElementById('rs-away') as HTMLInputElement).value)); onDone()
  })
  document.getElementById('rs-cancel')!.addEventListener('click', () => { panel().innerHTML = '' })
}

export function openFinalResultPanel(eventId: string, finalMatchId: string, onDone: () => void): void {
  const f = getFinals(eventId).find(x => x.id === finalMatchId); if (!f) return
  const home = f.homeResolved ?? f.home; const away = f.awayResolved ?? f.away
  panel().innerHTML = `<div class="pf-card"><h2>Risultato · ${f.round}</h2><p class="pf-muted">${home} vs ${away}</p>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${home}</label><input id="ff-home" type="number" min="0" value="${f.homeScore ?? 0}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${away}</label><input id="ff-away" type="number" min="0" value="${f.awayScore ?? 0}" /></div>
    </div>
    <p class="pf-muted" style="margin:var(--space-3) 0 4px">Rigori — solo in caso di parità</p>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${home} (d.c.r.)</label><input id="ff-sh-home" type="number" min="0" value="${f.homeShootout ?? ''}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${away} (d.c.r.)</label><input id="ff-sh-away" type="number" min="0" value="${f.awayShootout ?? ''}" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="ff-save">Salva</button><button class="pf-btn" id="ff-cancel">Annulla</button></div></div>`
  document.getElementById('ff-save')!.addEventListener('click', () => {
    const hs = (document.getElementById('ff-sh-home') as HTMLInputElement).value; const as = (document.getElementById('ff-sh-away') as HTMLInputElement).value
    const shootout = hs !== '' && as !== '' ? { home: Number(hs), away: Number(as) } : undefined
    recordFinalResult(finalMatchId, Number((document.getElementById('ff-home') as HTMLInputElement).value), Number((document.getElementById('ff-away') as HTMLInputElement).value), shootout); onDone()
  })
  document.getElementById('ff-cancel')!.addEventListener('click', () => { panel().innerHTML = '' })
}

export function openTiePanel(eventId: string, categoryId: string, groupLabel: string, teams: string[], onDone: () => void): void {
  const order = [...teams]
  const draw = (): void => {
    panel().innerHTML = `<div class="pf-card"><h2>Risolvi parità</h2><p class="pf-muted">${groupLabel} · ordina le squadre a pari merito</p>
      <ol class="pf-tblist">${order.map((t, i) => `<li class="pf-tbrow"><span>${i + 1}. ${t}</span>
        <span class="pf-tbmove"><button type="button" class="pf-btn pf-btn--ghost" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="pf-btn pf-btn--ghost" data-down="${i}" ${i === order.length - 1 ? 'disabled' : ''}>↓</button></span></li>`).join('')}</ol>
      <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="tie-save">Salva</button><button class="pf-btn" id="tie-cancel">Annulla</button></div></div>`
    panel().querySelectorAll<HTMLButtonElement>('button[data-up]').forEach(b => b.addEventListener('click', () => { const i = Number(b.dataset.up); [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw() }))
    panel().querySelectorAll<HTMLButtonElement>('button[data-down]').forEach(b => b.addEventListener('click', () => { const i = Number(b.dataset.down); [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw() }))
    document.getElementById('tie-save')!.addEventListener('click', () => { setTieOverride(eventId, categoryId, groupLabel, order); onDone() })
    document.getElementById('tie-cancel')!.addEventListener('click', () => { panel().innerHTML = '' })
  }
  draw()
}
```

- [ ] **Step 2: Build + typecheck**

Run: `npm run build` → OK (panels.ts non ancora importato: nessun entry Vite serve, è un modulo importato da altri).
Run: `npx tsc --noEmit` → OK.

- [ ] **Step 3: Commit**

```bash
git add apps/organizer/panels.ts
git commit -m "refactor(ov): extract editor panels from schedule.ts into panels.ts"
```

---

### Task 5: Calendario — riduci `schedule.ts` alla sola vista calendario + shell

**Files:**
- Modify: `apps/organizer/schedule.html` (shell + rimuovi contenitori standings/finals)
- Modify: `apps/organizer/schedule.ts` (usa shell + panels; rimuovi standings/tie/finals)

**Interfaces:**
- Consumes: `renderOrganizerWorkspace`, `renderCalendar`, `renderTabs` (chrome); `openEditPanel`, `openResultPanel` (panels); store getter/mutation esistenti.

- [ ] **Step 1: Aggiorna `schedule.html`**

Sostituisci header + rimuovi i contenitori `standings`, `tieactions`, `finals`:

```html
<body>
  <header id="shell"></header>
  <main class="pf-container">
    <div id="flash"></div>
    <div class="pf-card" id="window"></div>
    <div class="pf-card"><label class="pf-switch"><input type="checkbox" id="uniform" /> Stessa config di gioco per tutte le categorie</label></div>
    <div id="configarea"></div>
    <div class="pf-card" id="actions"></div>
    <div id="viewtabs"></div>
    <div id="editmatch"></div>
    <div id="calendar"></div>
  </main>
  <script type="module" src="./schedule.ts"></script>
</body>
```

- [ ] **Step 2: Aggiorna `schedule.ts`**

- Import: sostituisci la riga 1-2 con:

```ts
import { renderOrganizerWorkspace, renderCalendar, renderTabs } from '../../shared/chrome'
import { getCategories, getSchedule, getScheduledMatches, getStandings, getEvent, generateSchedule, approveSchedule, publishSchedule } from '../../shared/mock/store'
import { openEditPanel, openResultPanel } from './panels'
import type { CategorySchedule, ScheduleConfig } from '../../shared/mock/types'
```

- Righe 6-8 (topbar+back) → shell:

```ts
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const ev = getEvent(id)
if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, 'calendar')
```

- Rimuovi le 4 funzioni pannello (ora in `panels.ts`) e la funzione `openTiePanel`.
- In `renderViews`, elimina i blocchi che scrivono su `#standings`, `#tieactions`, `#finals` (righe 250-276) e le loro dipendenze (`rankStanding`, `getTieOverrides`, `getFinals`, `renderStandings`, `renderBracket`). Sostituisci gli handler dei bottoni calendario con:

```ts
  document.querySelectorAll<HTMLButtonElement>('#calendar .js-editmatch').forEach(b =>
    b.addEventListener('click', () => openEditPanel(id, b.dataset.match!, renderViews)))
  document.querySelectorAll<HTMLButtonElement>('#calendar .js-resultmatch').forEach(b =>
    b.addEventListener('click', () => openResultPanel(id, b.dataset.match!, renderViews)))
```

- In `render()` rimuovi gli azzeramenti di `#standings/#tieactions/#finals`.

- [ ] **Step 3: Build + typecheck + verifica**

Run: `npm run build` → OK. Run: `npx tsc --noEmit` → OK (nessun import inutilizzato).
Manuale: `schedule.html?event=evt-1` mostra shell con tab "Calendario" attiva, config + genera/approva/pubblica + calendario editabile; nessuna classifica/tabellone qui.

- [ ] **Step 4: Commit**

```bash
git add apps/organizer/schedule.html apps/organizer/schedule.ts
git commit -m "refactor(ov): schedule.html becomes Calendario-only section under the shell"
```

---

### Task 6: Nuova sezione Classifiche (`classifiche.html`/`.ts`)

**Files:**
- Create: `apps/organizer/classifiche.html`, `apps/organizer/classifiche.ts`
- Modify: `vite.config.ts` (entry `classifiche`)

**Interfaces:**
- Consumes: `renderOrganizerWorkspace`, `renderStandings`, `renderTabs`; `openTiePanel` (panels); `rankStanding`; store getter.

- [ ] **Step 1: HTML**

`apps/organizer/classifiche.html`:

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Classifiche</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header id="shell"></header>
  <main class="pf-container">
    <div id="viewtabs"></div>
    <div id="editmatch"></div>
    <div id="standings"></div>
    <div id="tieactions"></div>
  </main>
  <script type="module" src="./classifiche.ts"></script>
</body>
</html>
```

- [ ] **Step 2: TS**

`apps/organizer/classifiche.ts`:

```ts
import { renderOrganizerWorkspace, renderStandings, renderTabs } from '../../shared/chrome'
import { getCategories, getStandings, getScheduledMatches, getEvent, getTieOverrides } from '../../shared/mock/store'
import { rankStanding } from '../../shared/mock/ranking'
import { openTiePanel } from './panels'

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const ev = getEvent(id)
if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, 'standings')
const catName = (c: string) => getCategories(id).find(x => x.id === c)?.name ?? '—'
let selCat = ''; let selGir = 'ALL'

function presentCats(): string[] { const s: string[] = []; for (const r of getStandings(id)) if (!s.includes(r.categoryId)) s.push(r.categoryId); return s }
function gironiOf(cat: string): string[] { const s: string[] = []; for (const r of getStandings(id)) if (r.categoryId === cat && !s.includes(r.groupLabel)) s.push(r.groupLabel); return s }

function render(): void {
  document.getElementById('editmatch')!.innerHTML = ''
  const cats = presentCats()
  if (!cats.length) { document.getElementById('standings')!.innerHTML = `<p class="pf-muted">Nessuna classifica: genera prima il calendario.</p>`; return }
  if (!cats.includes(selCat)) selCat = cats[0]
  const gironi = gironiOf(selCat)
  if (selGir !== 'ALL' && !gironi.includes(selGir)) selGir = 'ALL'
  document.getElementById('viewtabs')!.innerHTML =
    renderTabs(cats.map(c => ({ key: c, label: catName(c) })), selCat) +
    renderTabs([{ key: 'ALL', label: 'Tutti i gironi' }, ...gironi.map(g => ({ key: g, label: g }))], selGir)
  const bars = document.querySelectorAll<HTMLElement>('#viewtabs .pf-tabs')
  bars[0].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b => b.addEventListener('click', () => { selCat = b.dataset.key!; selGir = 'ALL'; render() }))
  bars[1].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b => b.addEventListener('click', () => { selGir = b.dataset.key!; render() }))
  const inSel = (c: string, g: string) => c === selCat && (selGir === 'ALL' || g === selGir)
  const policy = getEvent(id)?.tieBreak ?? []
  document.getElementById('standings')!.innerHTML = renderStandings(getStandings(id).filter(s => inSel(s.categoryId, s.groupLabel)), getScheduledMatches(id), policy, getTieOverrides(id), catName)
  // tie resolution
  const visRows = getStandings(id).filter(s => inSel(s.categoryId, s.groupLabel))
  const ovAll = getTieOverrides(id)
  const seen: Array<{ cat: string; g: string }> = []
  for (const s of visRows) if (!seen.some(x => x.cat === s.categoryId && x.g === s.groupLabel)) seen.push({ cat: s.categoryId, g: s.groupLabel })
  const tieGroups: Array<{ cat: string; g: string; teams: string[] }> = []
  for (const { cat, g } of seen) {
    const grows = visRows.filter(s => s.categoryId === cat && s.groupLabel === g)
    const gms = getScheduledMatches(id).filter(m => m.categoryId === cat && m.groupLabel === g)
    const ov = ovAll.filter(o => o.categoryId === cat && o.groupLabel === g).map(o => o.order)
    for (const grp of rankStanding(grows, gms, policy, ov).unresolved) tieGroups.push({ cat, g, teams: grp })
  }
  document.getElementById('tieactions')!.innerHTML = tieGroups.map((u, i) => `<button class="pf-btn" data-tie="${i}">Risolvi parità · ${u.g}: ${u.teams.join(', ')}</button>`).join('')
  document.getElementById('tieactions')!.querySelectorAll<HTMLButtonElement>('button[data-tie]').forEach(b =>
    b.addEventListener('click', () => { const u = tieGroups[Number(b.dataset.tie)]; openTiePanel(id, u.cat, u.g, u.teams, render) }))
}
render()
```

- [ ] **Step 3: Vite entry**

In `vite.config.ts`, dopo `schedule`:

```ts
        classifiche: r('apps/organizer/classifiche.html'),
```

- [ ] **Step 4: Build + typecheck + verifica**

Run: `npm run build` → OK. `npx tsc --noEmit` → OK.
Manuale: `classifiche.html?event=evt-tie-open` mostra classifiche + bottone "Risolvi parità"; risolvendo, la parità si sblocca.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer/classifiche.html apps/organizer/classifiche.ts vite.config.ts
git commit -m "feat(ov): Classifiche section page (standings + tie resolution)"
```

---

### Task 7: Nuova sezione Tabellone (`tabellone.html`/`.ts`)

**Files:**
- Create: `apps/organizer/tabellone.html`, `apps/organizer/tabellone.ts`
- Modify: `vite.config.ts` (entry `tabellone`)

**Interfaces:**
- Consumes: `renderOrganizerWorkspace`, `renderBracket`, `renderTabs`; `openFinalResultPanel` (panels); store getter.

- [ ] **Step 1: HTML**

`apps/organizer/tabellone.html`:

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Tabellone</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header id="shell"></header>
  <main class="pf-container">
    <div id="viewtabs"></div>
    <div id="editmatch"></div>
    <div id="finals"></div>
  </main>
  <script type="module" src="./tabellone.ts"></script>
</body>
</html>
```

- [ ] **Step 2: TS**

`apps/organizer/tabellone.ts`:

```ts
import { renderOrganizerWorkspace, renderBracket, renderTabs } from '../../shared/chrome'
import { getCategories, getFinals, getEvent } from '../../shared/mock/store'
import { openFinalResultPanel } from './panels'

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const ev = getEvent(id)
if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, 'bracket')
const catName = (c: string) => getCategories(id).find(x => x.id === c)?.name ?? '—'
let selCat = ''

function catsWithFinals(): string[] { const s: string[] = []; for (const f of getFinals(id)) if (!s.includes(f.categoryId)) s.push(f.categoryId); return s }

function render(): void {
  document.getElementById('editmatch')!.innerHTML = ''
  const cats = catsWithFinals()
  if (!cats.length) { document.getElementById('finals')!.innerHTML = `<p class="pf-muted">Nessuna fase finale: genera prima il calendario.</p>`; return }
  if (!cats.includes(selCat)) selCat = cats[0]
  document.getElementById('viewtabs')!.innerHTML = renderTabs(cats.map(c => ({ key: c, label: catName(c) })), selCat)
  document.querySelectorAll<HTMLButtonElement>('#viewtabs .pf-tab').forEach(b => b.addEventListener('click', () => { selCat = b.dataset.key!; render() }))
  document.getElementById('finals')!.innerHTML = renderBracket(getFinals(id).filter(f => f.categoryId === selCat), true)
  document.querySelectorAll<HTMLButtonElement>('#finals button[data-final]').forEach(b =>
    b.addEventListener('click', () => openFinalResultPanel(id, b.dataset.final!, render)))
}
render()
```

- [ ] **Step 3: Vite entry**

In `vite.config.ts`, dopo `classifiche`:

```ts
        tabellone: r('apps/organizer/tabellone.html'),
```

- [ ] **Step 4: Build + typecheck + verifica**

Run: `npm run build` → OK. `npx tsc --noEmit` → OK.
Manuale: `tabellone.html?event=evt-finals` mostra il bracket + bottone "Risultato" sui match giocabili; inserendo risultati, i vincenti propagano.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer/tabellone.html apps/organizer/tabellone.ts vite.config.ts
git commit -m "feat(ov): Tabellone section page (bracket + final results)"
```

---

### Task 8: Adozione shell sulle pagine restanti

**Files (Modify):** `apps/organizer/{categories,registrations,inbox,payments,teams,competition,gironi,avvisi}.ts` e i rispettivi `.html`.

**Interfaces:**
- Consumes: `renderOrganizerWorkspace`.

Trasformazione **uniforme** per ogni pagina (esempio su `competition`):

- Nel `.html`: sostituisci `<header class="pf-topbar" id="topbar"></header>` con `<header id="shell"></header>` e rimuovi la riga `<a class="pf-back" id="back" …>` (le tab sostituiscono il back).
- Nel `.ts`: sostituisci
  ```ts
  document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
  ```
  con (usando l'`id` già presente nella pagina e l'`activeKey` dalla tabella sotto):
  ```ts
  const ev = getEvent(id)
  if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, '<activeKey>')
  ```
  e rimuovi la riga `document.getElementById('back')!.setAttribute('href', …)`.
  Aggiorna gli import: togli `renderOrganizerTopbar`, aggiungi `renderOrganizerWorkspace` (da `../../shared/chrome`) e assicurati che `getEvent` sia importato da `../../shared/mock/store`.

activeKey per pagina:

| Pagina | activeKey |
|---|---|
| `registrations`, `inbox`, `payments`, `teams` | `enroll` |
| `competition`, `gironi`, `categories` | `settings` |
| `avvisi` | `announcements` |

Nota: in alcune pagine `id` è derivato dopo la riga topbar — spostare la lettura di `id`/`getEvent` prima dell'iniezione shell.

- [ ] **Step 1: Applica la trasformazione a tutte le 8 pagine**

Segui la trasformazione sopra per ciascun file `.ts`/`.html`. Verifica che ogni pagina abbia `const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'` prima dell'iniezione.

- [ ] **Step 2: Build + typecheck**

Run: `npm run build` → OK. `npx tsc --noEmit` → nessun errore (nessun `renderOrganizerTopbar` residuo nelle pagine evento; `dashboard`/`create-event` lo mantengono).

- [ ] **Step 3: Verifica**

Manuale: apri ogni pagina con `?event=evt-1` — la barra tab è presente e la tab corretta è evidenziata; niente link "back" rotti.

- [ ] **Step 4: Suite completa**

Run: `npm test` → tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer/categories.* apps/organizer/registrations.* apps/organizer/inbox.* apps/organizer/payments.* apps/organizer/teams.* apps/organizer/competition.* apps/organizer/gironi.* apps/organizer/avvisi.*
git commit -m "feat(ov): adopt workspace shell across remaining organizer pages"
```

---

## Self-Review

**Spec coverage:**
- Shell `renderOrganizerWorkspace` (hero+tab) → Task 2. ✓
- Modello di fase + funzioni Panoramica (`overview.ts`) → Task 1. ✓
- Tab → destinazioni (enroll dipende da playbook, settings) → Task 2 helper + Task 8 activeKey. ✓
- Panoramica fase-aware PREP/LIVE/DONE con i 4 blocchi → Task 3. ✓
- Scorporo schedule → Calendario (Task 5) + Classifiche (Task 6) + Tabellone (Task 7), pannelli condivisi (Task 4). ✓
- Adozione shell sulle altre pagine → Task 8. ✓
- Vite entries classifiche/tabellone → Task 6/7. ✓
- Test overview + suite verde → Task 1. ✓
- Fuori scope (public/admin, orario reale) → non toccati. ✓

**Placeholder scan:** nessun TBD/TODO; ogni step ha codice o comando. La trasformazione ripetuta di Task 8 è mostrata una volta (DRY) con tabella activeKey esplicita.

**Type consistency:** `EventPhase` definito in types (Task 1 Step 4) e usato in overview + store wrapper + chrome; `renderOrganizerWorkspace(event, activeKey)` firma coerente tra Task 2 e i consumi (Task 3/5/6/7/8); i pannelli `open*Panel(eventId, …, onDone)` firma coerente tra Task 4 e Task 5/6/7; activeKey enumerati coerenti con le tab dello shell.
