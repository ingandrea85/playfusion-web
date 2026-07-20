# cm2 — Avvisi automatici Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generare automaticamente avvisi "di sistema" nella bacheca di cm1 al verificarsi di quattro eventi di dominio, distinti da quelli manuali.

**Architecture:** Estende `Announcement` con `source` e `dedupeKey`; aggiunge due helper store (`upsertSystemAnnouncement`/`removeSystemAnnouncement`) chiamati dentro le mutation esistenti (`publishSchedule`, `setRegistrationsOpen`, `rescheduleMatch`, `recordFinalResult`); l'E1 mostra un tag "Automatico".

**Tech Stack:** TypeScript, Vite (MPA), Vitest + jsdom. Nessuna dipendenza nuova.

## Global Constraints

- Stato finto: seed + `localStorage` (chiave `playfusion-mock-v1`). Nessun backend.
- `source === 'SYSTEM'` → avviso automatico; qualsiasi altro valore (incluso assente in cache cm1) → trattato come manuale.
- `dedupeKey` presente solo sugli avvisi di sistema; unicità per `eventId + dedupeKey`.
- Iscrizioni aperte: solo `open === true` **e** `playbook !== 'PB-2'`.
- Campione: solo finali con `round === 'Finale'` (la "Finale 3º/4º" è esclusa).
- Nessun nuovo CSS: usare `pf-mono`, `pf-muted`, `pf-badge` esistenti.
- Testi UI in italiano. Tag di fetta: `cm2`.

---

### Task 1: Modello + helper + quattro trigger (logica)

**Files:**
- Modify: `shared/mock/types.ts` (campi `source`, `dedupeKey` su `Announcement`)
- Modify: `shared/mock/store.ts` (import `decideMatch`; `addAnnouncement` set source; 2 helper; 4 hook)
- Modify: `shared/mock/seed.ts` (`source: 'ORGANIZER'` sui 3 avvisi seed)
- Test: `shared/mock/announcements-auto.test.ts` (create)

**Interfaces:**
- Consumes: `load`/`save`/`nextAnnId` (interni store, da cm1); `decideMatch` da `./derive`; mutation esistenti `publishSchedule`, `setRegistrationsOpen`, `rescheduleMatch`, `recordFinalResult`.
- Produces (per Task 2): `Announcement.source: 'ORGANIZER' | 'SYSTEM'`, `Announcement.dedupeKey?: string`. Avvisi di sistema visibili via `getAnnouncements(eventId)` (cm1).

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `shared/mock/announcements-auto.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  resetDemo, getAnnouncements, getScheduledMatches, getFinals,
  generateSchedule, approveSchedule, publishSchedule, getSchedule,
  setRegistrationsOpen, rescheduleMatch, recordFinalResult,
} from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

const sys = (eventId: string) => getAnnouncements(eventId).filter(a => a.source === 'SYSTEM')

describe('auto announcements — schedule published', () => {
  it('publishSchedule adds one system announcement, no duplicate', () => {
    const cfg = getSchedule('evt-1')!.config
    generateSchedule('evt-1', cfg); approveSchedule('evt-1'); publishSchedule('evt-1')
    const pub = sys('evt-1').filter(a => a.dedupeKey === 'schedule-published')
    expect(pub).toHaveLength(1)
    expect(pub[0].categoryId).toBeNull()
  })
})

describe('auto announcements — registrations open', () => {
  it('creates the notice on a PB-1 event', () => {
    setRegistrationsOpen('evt-1', false)
    setRegistrationsOpen('evt-1', true)
    expect(sys('evt-1').filter(a => a.dedupeKey === 'registrations-open')).toHaveLength(1)
  })
  it('does not create it on a PB-2 event', () => {
    setRegistrationsOpen('evt-direct', true)
    expect(sys('evt-direct').filter(a => a.dedupeKey === 'registrations-open')).toHaveLength(0)
  })
})

describe('auto announcements — match rescheduled', () => {
  it('one per match; rescheduling the same match replaces it', () => {
    const m = getScheduledMatches('evt-finals')[0]
    rescheduleMatch(m.id, { day: '2026-09-02', time: '10:00', field: 'Campo 2' })
    let n = sys('evt-finals').filter(a => a.dedupeKey === `reschedule:${m.id}`)
    expect(n).toHaveLength(1)
    expect(n[0].body).toContain('10:00')
    rescheduleMatch(m.id, { day: '2026-09-02', time: '15:30', field: 'Campo 3' })
    n = sys('evt-finals').filter(a => a.dedupeKey === `reschedule:${m.id}`)
    expect(n).toHaveLength(1)              // still one
    expect(n[0].body).toContain('15:30')  // updated
    const m2 = getScheduledMatches('evt-finals')[1]
    rescheduleMatch(m2.id, { day: '2026-09-02', time: '11:00', field: 'Campo 2' })
    expect(sys('evt-finals').filter(a => a.dedupeKey?.startsWith('reschedule:'))).toHaveLength(2)
  })
})

describe('auto announcements — champion', () => {
  const finale = () => getFinals('evt-finals').find(f => f.round === 'Finale')!
  const semi = (order: number) => getFinals('evt-finals').find(f => f.round === 'Semifinali' && f.order === order)!
  it('appears when the final is decided and is removed if it becomes undecided', () => {
    recordFinalResult(semi(1).id, 2, 0)
    recordFinalResult(semi(2).id, 1, 0)
    recordFinalResult(finale().id, 3, 1) // decided
    const champ = sys('evt-finals').filter(a => a.dedupeKey?.startsWith('champion:'))
    expect(champ).toHaveLength(1)
    expect(champ[0].body.length).toBeGreaterThan(0)
    recordFinalResult(finale().id, 1, 1) // draw, no shootout → undecided
    expect(sys('evt-finals').filter(a => a.dedupeKey?.startsWith('champion:'))).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

Run: `npm test -- announcements-auto`
Expected: FAIL (nessun avviso `source:'SYSTEM'`; alcune assert falliscono).

- [ ] **Step 3: Estendi il tipo `Announcement`**

In `shared/mock/types.ts`, dentro `export interface Announcement { ... }` aggiungi le due righe (dopo `pinned: boolean`):

```ts
  source: 'ORGANIZER' | 'SYSTEM'
  dedupeKey?: string
```

- [ ] **Step 4: Marca gli avvisi seed come ORGANIZER**

In `shared/mock/seed.ts`, nei 3 oggetti dell'array `announcements`, aggiungi `source: 'ORGANIZER',` (es. subito dopo `pinned: true,` / `pinned: false,`). Risultato per ciascuno, esempio:

```ts
      { id: 'ann-1', eventId: 'evt-1', categoryId: null, pinned: true, source: 'ORGANIZER',
        title: 'Iscrizioni in chiusura', body: 'Ultimi giorni per iscriversi: gironi in pubblicazione a breve.',
        createdAt: '2026-07-14T09:00:00.000Z' },
```

(fai lo stesso per `ann-2` e `ann-3`).

- [ ] **Step 5: `addAnnouncement` marca ORGANIZER + aggiungi gli helper e l'import**

In `shared/mock/store.ts`, aggiorna l'import da `./derive`:

```ts
import { recomputeStandings, resolveFinals, decideMatch } from './derive'
```

In `addAnnouncement` (da cm1) aggiungi `source: 'ORGANIZER'` all'oggetto creato:

```ts
  const ann: Announcement = { id: nextAnnId(state), ...input, source: 'ORGANIZER', createdAt: new Date().toISOString() }
```

Subito sotto `announcementReach(...)` aggiungi i due helper:

```ts
function upsertSystemAnnouncement(state: State, input: { eventId: string; categoryId: string | null; title: string; body: string; dedupeKey: string }): void {
  const existing = state.announcements.find(a => a.eventId === input.eventId && a.dedupeKey === input.dedupeKey)
  if (existing) { existing.title = input.title; existing.body = input.body; existing.categoryId = input.categoryId; existing.createdAt = new Date().toISOString(); return }
  state.announcements.push({ id: nextAnnId(state), source: 'SYSTEM', pinned: false, createdAt: new Date().toISOString(), ...input })
}
function removeSystemAnnouncement(state: State, eventId: string, dedupeKey: string): void {
  state.announcements = state.announcements.filter(a => !(a.eventId === eventId && a.dedupeKey === dedupeKey))
}
```

- [ ] **Step 6: Aggancia i quattro trigger nelle mutation esistenti**

In `shared/mock/store.ts`:

`setRegistrationsOpen`:

```ts
export function setRegistrationsOpen(eventId: string, open: boolean): void {
  const state = load()
  const e = state.events.find(x => x.id === eventId); if (e) e.registrationsOpen = open
  if (open && e && e.playbook !== 'PB-2') upsertSystemAnnouncement(state, { eventId, categoryId: null, title: 'Iscrizioni aperte', body: 'Le iscrizioni al torneo sono aperte.', dedupeKey: 'registrations-open' })
  save(state)
}
```

`publishSchedule`:

```ts
export function publishSchedule(eventId: string): void {
  const state = load()
  const s = state.schedules.find(x => x.eventId === eventId)
  if (s && s.status === 'APPROVED') {
    s.status = 'PUBLISHED'
    upsertSystemAnnouncement(state, { eventId, categoryId: null, title: 'Calendario pubblicato', body: 'Il calendario delle gare è online.', dedupeKey: 'schedule-published' })
  }
  save(state)
}
```

`rescheduleMatch`:

```ts
export function rescheduleMatch(matchId: string, patch: { day: string; time: string; field: string }): void {
  const state = load()
  const m = state.scheduledMatches.find(x => x.id === matchId)
  if (m) {
    m.day = patch.day; m.time = patch.time; m.field = patch.field
    upsertSystemAnnouncement(state, { eventId: m.eventId, categoryId: m.categoryId, title: 'Gara riprogrammata', body: `${m.home} vs ${m.away}: ${m.day} ${m.time} · ${m.field}`, dedupeKey: `reschedule:${m.id}` })
  }
  save(state)
}
```

`recordFinalResult` (dopo `resolveFinals(state, f.eventId)`, prima di `save`):

```ts
  resolveFinals(state, f.eventId)
  for (const fin of state.finals.filter(x => x.eventId === f.eventId && x.round === 'Finale')) {
    const key = `champion:${fin.categoryId}:${fin.bracketLabel}`
    const d = decideMatch(fin)
    if (d) upsertSystemAnnouncement(state, { eventId: f.eventId, categoryId: fin.categoryId, title: 'Campione', body: `${d.winner} ha vinto ${fin.bracketLabel}.`, dedupeKey: key })
    else removeSystemAnnouncement(state, f.eventId, key)
  }
  save(state)
```

- [ ] **Step 7: Esegui i test nuovi**

Run: `npm test -- announcements-auto`
Expected: PASS (tutti).

- [ ] **Step 8: Esegui l'intera suite + typecheck**

Run: `npm test`
Expected: tutti PASS (94 cm1 + i nuovi).
Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 9: Commit**

```bash
git add shared/mock/types.ts shared/mock/store.ts shared/mock/seed.ts shared/mock/announcements-auto.test.ts docs/superpowers/specs/2026-07-20-cm2-avvisi-automatici-design.md docs/superpowers/plans/2026-07-20-cm2-avvisi-automatici.md
git commit -m "feat(cm2): system announcements + 4 domain triggers (publish/regs-open/reschedule/champion)"
```

---

### Task 2: Tag "Automatico" in UI (E1 + E3)

**Files:**
- Modify: `apps/organizer/avvisi.ts` (tag nella lista E1)
- Modify: `apps/public/avvisi.ts` (tag nella lista public)

**Interfaces:**
- Consumes: `Announcement.source` (Task 1).
- Produces: nessuna nuova interfaccia.

- [ ] **Step 1: Tag nella lista E1**

In `apps/organizer/avvisi.ts`, nella funzione `render`, nel template della `<li>`, subito dopo l'apertura di `pf-rosterrow__name` e prima del badge "In evidenza", inserisci il tag sistema. Sostituisci la riga:

```ts
      <span class="pf-rosterrow__name">${a.pinned ? '<span class="pf-badge pf-badge--paid">In evidenza</span> ' : ''}${a.title}
```

con:

```ts
      <span class="pf-rosterrow__name">${a.source === 'SYSTEM' ? '<span class="pf-mono pf-muted">Automatico</span> ' : ''}${a.pinned ? '<span class="pf-badge pf-badge--paid">In evidenza</span> ' : ''}${a.title}
```

- [ ] **Step 2: Tag nella lista public E3**

In `apps/public/avvisi.ts`, nel template della card, sostituisci la riga:

```ts
    <div class="pf-cat__label" style="margin-bottom:var(--space-2)">${a.pinned ? '<span class="pf-badge pf-badge--paid">In evidenza</span> ' : ''}${a.title}
```

con:

```ts
    <div class="pf-cat__label" style="margin-bottom:var(--space-2)">${a.source === 'SYSTEM' ? '<span class="pf-mono pf-muted">Automatico</span> ' : ''}${a.pinned ? '<span class="pf-badge pf-badge--paid">In evidenza</span> ' : ''}${a.title}
```

- [ ] **Step 3: Build + typecheck**

Run: `npm run build`
Expected: build OK.
Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Verifica manuale**

Run: `npm run dev`. Su `/apps/organizer/schedule.html?event=evt-1` genera→approva→pubblica, poi apri `/apps/organizer/avvisi.html?event=evt-1`: deve comparire "Calendario pubblicato" con tag **Automatico**. Su `/apps/public/avvisi.html?event=evt-1` lo stesso avviso appare con il tag.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer/avvisi.ts apps/public/avvisi.ts
git commit -m "feat(cm2): 'Automatico' tag for system announcements in E1 & E3"
```

---

## Self-Review

**Spec coverage:**
- `source` + `dedupeKey` su `Announcement` → Task 1 Step 3. ✓
- Seed avvisi = ORGANIZER; `addAnnouncement` = ORGANIZER → Task 1 Steps 4-5. ✓
- Helper upsert/remove system → Task 1 Step 5. ✓
- Trigger: publish, regs-open (solo PB-1), reschedule (per-match replace), champion (decide/undecide) → Task 1 Step 6 + test Step 1. ✓
- Tag "Automatico" in E1 + E3 → Task 2. ✓
- Test auto (4 gruppi) + suite cm1 verde → Task 1. ✓
- Fuori scope (per-team, email reali, storico, mute) → non implementati. ✓

**Placeholder scan:** nessun TBD/TODO; ogni step ha codice o comando concreto.

**Type consistency:** `source: 'ORGANIZER' | 'SYSTEM'` coerente tra types, seed, addAnnouncement, helper, UI; `dedupeKey` opzionale usato solo in helper/trigger/test; nomi `upsertSystemAnnouncement`/`removeSystemAnnouncement` identici tra definizione e uso; `decideMatch` importato da `./derive` (firma `(FinalMatch) => {winner,loser} | null`).
