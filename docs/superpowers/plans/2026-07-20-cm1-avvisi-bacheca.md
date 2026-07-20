# cm1 — Bacheca avvisi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare all'organizer una bacheca avvisi per evento (E1) che il pubblico legge in E3, con targeting opzionale per categoria e flag "in evidenza".

**Architecture:** Nuova entità `Announcement` nello store mock (seed + localStorage), quattro funzioni store pure-ish, e due pagine MPA (una E1, una E3) più agganci su event-hub, landing e calendario public. Nessun backend: stato finto come il resto del mockup.

**Tech Stack:** TypeScript, Vite (MPA), Vitest + jsdom. Nessuna dipendenza nuova.

## Global Constraints

- Stato finto: seed + `localStorage`, chiave `playfusion-mock-v1`. Nessun backend, nessun framework.
- `load()` fa merge sopra un seed fresco: le nuove collection top-level devono avere default nel seed così gli stati vecchi non crashano.
- ID stile esistente; timestamp con `new Date().toISOString()` (già usato in `addRegistration`).
- CSS solo via classi `pf-*` esistenti in `shared/ui.css` (`pf-card`, `pf-field`, `pf-row`, `pf-btn`, `pf-btn--primary`, `pf-btn--ghost`, `pf-badge`, `pf-muted`, `pf-mono`, `pf-tabs`/`pf-tab` via `renderTabs`, `pf-cat__label`). Niente nuovo CSS salvo micro-inline-style coerenti con l'esistente.
- Testi UI in italiano.
- Tag di fetta: `cm1`.
- Ogni pagina nuova va aggiunta a `vite.config.ts` come input rollup.

---

### Task 1: Modello dati, store e seed per gli avvisi

**Files:**
- Modify: `shared/mock/types.ts` (aggiungi `Announcement`; aggiungi `announcements` a `State`)
- Modify: `shared/mock/store.ts` (import tipo + 4 funzioni + helper reach)
- Modify: `shared/mock/seed.ts` (collection `announcements` con demo su `evt-1`)
- Test: `shared/mock/announcements.test.ts` (create)

**Interfaces:**
- Consumes: `State`, `load()`/`save()` (interni a store), `getRegistrations` pattern.
- Produces (usate dai Task 2 e 3):
  - `getAnnouncements(eventId: string): Announcement[]` — ordinati: pinned prima, poi `createdAt` desc.
  - `addAnnouncement(input: { eventId: string; categoryId: string | null; title: string; body: string; pinned: boolean }): Announcement`
  - `removeAnnouncement(id: string): void`
  - `togglePin(id: string): void`
  - `announcementReach(eventId: string, categoryId: string | null): number` — n° registration `CONFIRMED` nello scope.
  - Tipo `Announcement { id: string; eventId: string; categoryId: string | null; title: string; body: string; pinned: boolean; createdAt: string }`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `shared/mock/announcements.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getAnnouncements, addAnnouncement, removeAnnouncement, togglePin, announcementReach } from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('announcements store', () => {
  it('seed has demo announcements on evt-1', () => {
    expect(getAnnouncements('evt-1').length).toBeGreaterThanOrEqual(3)
  })

  it('orders pinned first, then most recent', () => {
    const a = getAnnouncements('evt-1')
    // no non-pinned appears before a pinned one
    const firstNonPinned = a.findIndex(x => !x.pinned)
    const lastPinned = a.map(x => x.pinned).lastIndexOf(true)
    if (firstNonPinned !== -1 && lastPinned !== -1) expect(lastPinned).toBeLessThan(firstNonPinned)
    // within same pinned group, createdAt descending
    for (let i = 1; i < a.length; i++) if (a[i].pinned === a[i - 1].pinned) expect(a[i - 1].createdAt >= a[i].createdAt).toBe(true)
  })

  it('addAnnouncement persists and is scoped to the event', () => {
    const created = addAnnouncement({ eventId: 'evt-1', categoryId: null, title: 'T', body: 'B', pinned: false })
    expect(created.id).toMatch(/^ann-/)
    expect(created.createdAt).not.toBe('')
    expect(getAnnouncements('evt-1').some(x => x.id === created.id)).toBe(true)
    expect(getAnnouncements('evt-finals').some(x => x.id === created.id)).toBe(false)
  })

  it('removeAnnouncement removes only the given one', () => {
    const a = addAnnouncement({ eventId: 'evt-1', categoryId: null, title: 'X', body: 'Y', pinned: false })
    const before = getAnnouncements('evt-1').length
    removeAnnouncement(a.id)
    expect(getAnnouncements('evt-1').length).toBe(before - 1)
    expect(getAnnouncements('evt-1').some(x => x.id === a.id)).toBe(false)
  })

  it('togglePin flips the flag and re-sorts to the front', () => {
    const a = addAnnouncement({ eventId: 'evt-1', categoryId: null, title: 'Z', body: 'Z', pinned: false })
    togglePin(a.id)
    expect(getAnnouncements('evt-1').find(x => x.id === a.id)?.pinned).toBe(true)
  })

  it('announcementReach counts CONFIRMED regs in scope', () => {
    const all = announcementReach('evt-1', null)
    const cat1 = announcementReach('evt-1', 'cat-1')
    // evt-1 seed: cat-1 has 4 CONFIRMED (reg-1,4,5,6), reg-3 is PENDING
    expect(cat1).toBe(4)
    expect(all).toBeGreaterThanOrEqual(cat1)
  })
})
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `npm test -- announcements`
Expected: FAIL (import mancanti: `getAnnouncements`, ecc. non esportati).

- [ ] **Step 3: Aggiungi il tipo e il campo State**

In `shared/mock/types.ts`, prima di `export interface State` aggiungi:

```ts
export interface Announcement {
  id: string
  eventId: string
  categoryId: string | null   // null = tutto l'evento
  title: string
  body: string
  pinned: boolean
  createdAt: string
}
```

E dentro `export interface State { ... }` aggiungi la riga:

```ts
  announcements: Announcement[]
```

- [ ] **Step 4: Aggiungi la collection al seed**

In `shared/mock/seed.ts`, nell'oggetto `state: State = { ... }` (dopo `subscriptions: [...]`, prima della chiusura), aggiungi:

```ts
    announcements: [
      { id: 'ann-1', eventId: 'evt-1', categoryId: null, pinned: true,
        title: 'Iscrizioni in chiusura', body: 'Ultimi giorni per iscriversi: gironi in pubblicazione a breve.',
        createdAt: '2026-07-14T09:00:00.000Z' },
      { id: 'ann-2', eventId: 'evt-1', categoryId: 'cat-1', pinned: false,
        title: 'U10 · cambio campo', body: 'Le gare U10 di sabato si giocano su Campo B.',
        createdAt: '2026-07-13T15:30:00.000Z' },
      { id: 'ann-3', eventId: 'evt-1', categoryId: null, pinned: false,
        title: 'Ritrovo squadre', body: 'Presentarsi 30 minuti prima della prima gara per il ritiro pettorine.',
        createdAt: '2026-07-12T08:00:00.000Z' },
    ],
```

Nota: `State` è tipizzato, quindi finché `announcements` non è aggiunto al tipo (Step 3) qui darebbe errore — Step 3 va fatto prima o insieme.

- [ ] **Step 5: Aggiungi le funzioni store**

In `shared/mock/store.ts`, estendi l'import dei tipi in cima aggiungendo `Announcement`:

```ts
import type { Category, Competition, CompetitionConfig, Registration, Schedule, ScheduleConfig, ScheduledMatch, StandingRow, FinalMatch, GroupSlot, FixtureCategory, State, TournamentEvent, ScheduledCategory, Organization, OrgStatus, Subscription, PlanKey, SubStatus, TieBreakCriterion, TieOverride, Announcement } from './types'
```

In fondo al file aggiungi:

```ts
export function getAnnouncements(eventId: string): Announcement[] {
  return load().announcements
    .filter(a => a.eventId === eventId)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt))
}
function nextAnnId(state: State): string {
  return `ann-${Math.max(0, ...state.announcements.map(a => Number(a.id.replace('ann-', '')) || 0)) + 1}`
}
export function addAnnouncement(input: { eventId: string; categoryId: string | null; title: string; body: string; pinned: boolean }): Announcement {
  const state = load()
  const ann: Announcement = { id: nextAnnId(state), ...input, createdAt: new Date().toISOString() }
  state.announcements.push(ann); save(state); return ann
}
export function removeAnnouncement(id: string): void {
  const state = load()
  state.announcements = state.announcements.filter(a => a.id !== id)
  save(state)
}
export function togglePin(id: string): void {
  const state = load()
  const a = state.announcements.find(x => x.id === id); if (a) a.pinned = !a.pinned
  save(state)
}
export function announcementReach(eventId: string, categoryId: string | null): number {
  return load().registrations.filter(r =>
    r.eventId === eventId && r.status === 'CONFIRMED' && (categoryId === null || r.categoryId === categoryId),
  ).length
}
```

- [ ] **Step 6: Esegui i test per verificare che passino**

Run: `npm test -- announcements`
Expected: PASS (6 test).

- [ ] **Step 7: Esegui l'intera suite per non aver rotto nulla**

Run: `npm test`
Expected: tutti PASS (le suite esistenti + la nuova).

- [ ] **Step 8: Commit**

```bash
git add shared/mock/types.ts shared/mock/store.ts shared/mock/seed.ts shared/mock/announcements.test.ts
git commit -m "feat(cm1): Announcement entity + store (get/add/remove/togglePin/reach) + seed"
```

---

### Task 2: E1 Organizer — pagina Bacheca avvisi + aggancio event-hub

**Files:**
- Create: `apps/organizer/avvisi.html`
- Create: `apps/organizer/avvisi.ts`
- Modify: `apps/organizer/event-hub.ts` (aggiungi step "Comunica avvisi")
- Modify: `vite.config.ts` (input `avvisiOrg`)

**Interfaces:**
- Consumes: `getAnnouncements`, `addAnnouncement`, `removeAnnouncement`, `togglePin`, `announcementReach` (Task 1); `getEvent`, `getCategories` (esistenti); `renderOrganizerTopbar` (esistente).
- Produces: pagina raggiungibile a `/apps/organizer/avvisi.html?event=<id>`.

- [ ] **Step 1: Crea l'HTML della pagina**

`apps/organizer/avvisi.html`:

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Avvisi</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-topbar" id="topbar"></header>
  <main class="pf-container">
    <a class="pf-back" id="back" href="#">← Torna all'evento</a>
    <div class="pf-pagehead"><div class="pf-eyebrow">Comunicazioni</div><h1 id="title">Avvisi</h1></div>
    <div class="pf-card"><h2>Pubblica un avviso</h2><div id="addform"></div></div>
    <div id="list"></div>
  </main>
  <script type="module" src="./avvisi.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Crea la logica della pagina**

`apps/organizer/avvisi.ts`:

```ts
import { renderOrganizerTopbar } from '../../shared/chrome'
import { getEvent, getCategories, getAnnouncements, addAnnouncement, removeAnnouncement, togglePin, announcementReach } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

const cats = () => getCategories(id)
const catName = (catId: string | null) => catId === null ? 'Tutte le categorie' : (cats().find(c => c.id === catId)?.name ?? '—')

function selectedScope(): string | null {
  const v = (document.getElementById('a-cat') as HTMLSelectElement).value
  return v === '' ? null : v
}
function updateReach(): void {
  document.getElementById('a-reach')!.textContent = `Sarà visibile a ${announcementReach(id, selectedScope())} squadre confermate.`
}

function renderAdd(): void {
  const opts = `<option value="">Tutte le categorie</option>` + cats().map(c => `<option value="${c.id}">${c.name}</option>`).join('')
  document.getElementById('addform')!.innerHTML = `
    <div class="pf-field"><label>Titolo</label><input id="a-title" placeholder="Es. Cambio campo" /></div>
    <div class="pf-field"><label>Testo</label><textarea id="a-body" rows="3" placeholder="Dettagli dell'avviso"></textarea></div>
    <div class="pf-row" style="gap:var(--space-3);align-items:flex-end">
      <div class="pf-field" style="width:200px;margin-bottom:0"><label>Destinatari</label><select id="a-cat">${opts}</select></div>
      <label class="pf-check" style="margin-bottom:0"><input type="checkbox" id="a-pin" /> In evidenza</label>
    </div>
    <p class="pf-muted" id="a-reach"></p>
    <button class="pf-btn pf-btn--primary" id="a-pub">Pubblica</button>`
  document.getElementById('a-cat')!.addEventListener('change', updateReach)
  updateReach()
  document.getElementById('a-pub')!.addEventListener('click', () => {
    const title = (document.getElementById('a-title') as HTMLInputElement).value.trim()
    const body = (document.getElementById('a-body') as HTMLTextAreaElement).value.trim()
    if (!title || !body) return
    addAnnouncement({ eventId: id, categoryId: selectedScope(), title, body, pinned: (document.getElementById('a-pin') as HTMLInputElement).checked })
    render()
  })
}

function render(): void {
  document.getElementById('title')!.textContent = `Avvisi · ${getEvent(id)?.name ?? ''}`
  renderAdd()
  const list = getAnnouncements(id)
  const el = document.getElementById('list')!
  if (!list.length) { el.innerHTML = `<p class="pf-muted">Nessun avviso pubblicato.</p>`; return }
  el.innerHTML = `<div class="pf-card"><ul class="pf-roster">` + list.map(a => `
    <li class="pf-rosterrow">
      <span class="pf-rosterrow__name">${a.pinned ? '<span class="pf-badge pf-badge--paid">In evidenza</span> ' : ''}${a.title}
        <span class="pf-mono pf-muted"> · ${catName(a.categoryId)}</span>
        <br><span class="pf-muted">${a.body}</span></span>
      <span class="pf-rosterrow__act">
        <button class="pf-btn pf-btn--ghost" data-pin="${a.id}">${a.pinned ? 'Togli evidenza' : 'In evidenza'}</button>
        <button class="pf-btn pf-btn--ghost" data-del="${a.id}">Elimina</button>
      </span>
    </li>`).join('') + `</ul></div>`
  el.querySelectorAll<HTMLButtonElement>('button[data-pin]').forEach(b => b.addEventListener('click', () => { togglePin(b.dataset.pin!); render() }))
  el.querySelectorAll<HTMLButtonElement>('button[data-del]').forEach(b => b.addEventListener('click', () => { if (confirm('Eliminare l\'avviso?')) { removeAnnouncement(b.dataset.del!); render() } }))
}

render()
```

Nota: se `shared/ui.css` non ha `.pf-check`, usa `<label style="margin-bottom:0"><input type="checkbox" id="a-pin" /> In evidenza</label>` — verificare in Step 4.

- [ ] **Step 3: Registra la pagina in Vite e agganciala all'event-hub**

In `vite.config.ts`, dentro `input: { ... }` aggiungi dopo `teams`:

```ts
        avvisiOrg: r('apps/organizer/avvisi.html'),
```

In `apps/organizer/event-hub.ts`, nell'array `steps`, aggiungi come ultima voce (dopo "Pubblica evento"):

```ts
  { label: 'Comunica avvisi', href: `/apps/organizer/avvisi.html?event=${id}`, done: false },
```

- [ ] **Step 4: Verifica build e classi CSS**

Run: `npm run build`
Expected: build OK, nessun errore TS. Se `.pf-check` non esiste in `shared/ui.css` (verifica con: `grep -n "pf-check" shared/ui.css`), sostituisci con la variante inline indicata nello Step 2.

- [ ] **Step 5: Verifica manuale rapida**

Run: `npm run dev`, apri `/apps/organizer/avvisi.html?event=evt-1`. Verifica: form pubblica (titolo+testo+destinatari+in evidenza), riga "reach" che cambia al variare del destinatario, lista con badge "In evidenza", pulsanti elimina/toggle funzionanti, seed mostra 3 avvisi.

- [ ] **Step 6: Commit**

```bash
git add apps/organizer/avvisi.html apps/organizer/avvisi.ts apps/organizer/event-hub.ts vite.config.ts
git commit -m "feat(cm1): E1 bacheca avvisi (compose+reach+list) + event-hub step"
```

---

### Task 3: E3 Public — pagina avvisi + evidenza su landing e calendario

**Files:**
- Create: `apps/public/avvisi.html`
- Create: `apps/public/avvisi.ts`
- Modify: `apps/public/landing.html` (blocco "Avvisi")
- Modify: `apps/public/landing.ts` (card avviso in evidenza + link)
- Modify: `apps/public/calendar.ts` (striscia avviso in evidenza in cima)
- Modify: `vite.config.ts` (input `avvisiPub`)

**Interfaces:**
- Consumes: `getAnnouncements` (Task 1); `getCategories`, `getEvent` (esistenti); `renderPublicTopbar`, `renderTabs` (esistenti).
- Produces: pagina pubblica a `/apps/public/avvisi.html?event=<id>`; l'avviso "in evidenza" è `getAnnouncements(id)[0]`.

- [ ] **Step 1: Crea l'HTML della pagina public**

`apps/public/avvisi.html`:

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PlayFusion · Avvisi</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-publicbar" id="topbar"></header>
  <main class="pf-container pf-container--narrow">
    <a class="pf-back" id="back" href="#">← Torna all'evento</a>
    <div class="pf-pagehead"><div class="pf-eyebrow" id="eyebrow">Torneo</div><h1>Avvisi</h1></div>
    <div id="viewtabs"></div>
    <div id="list"></div>
  </main>
  <script type="module" src="./avvisi.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Crea la logica public (lista filtrabile per categoria)**

`apps/public/avvisi.ts`:

```ts
import { renderPublicTopbar, renderTabs } from '../../shared/chrome'
import { getCategories, getEvent, getAnnouncements } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)
document.getElementById('eyebrow')!.textContent = getEvent(id)?.name ?? 'Torneo'

const cats = () => getCategories(id)
const catName = (catId: string | null) => catId === null ? 'Tutte le categorie' : (cats().find(c => c.id === catId)?.name ?? '—')
let sel = 'ALL'

function render(): void {
  const all = getAnnouncements(id)
  document.getElementById('viewtabs')!.innerHTML = renderTabs(
    [{ key: 'ALL', label: 'Tutte' }, ...cats().map(c => ({ key: c.id, label: c.name }))], sel)
  document.querySelectorAll<HTMLButtonElement>('#viewtabs .pf-tab').forEach(b =>
    b.addEventListener('click', () => { sel = b.dataset.key!; render() }))
  // event-wide (null) sempre mostrati; una categoria selezionata mostra null + quella categoria
  const rows = all.filter(a => sel === 'ALL' || a.categoryId === null || a.categoryId === sel)
  const el = document.getElementById('list')!
  if (!rows.length) { el.innerHTML = `<p class="pf-muted">Nessun avviso pubblicato.</p>`; return }
  el.innerHTML = rows.map(a => `<div class="pf-card">
    <div class="pf-cat__label" style="margin-bottom:var(--space-2)">${a.pinned ? '<span class="pf-badge pf-badge--paid">In evidenza</span> ' : ''}${a.title}
      <span class="pf-mono pf-muted"> · ${catName(a.categoryId)}</span></div>
    <p>${a.body}</p>
  </div>`).join('')
}
render()
```

- [ ] **Step 3: Card "in evidenza" + link su landing**

In `apps/public/landing.html`, dentro il `<main>`, prima del `<div class="pf-card">` esistente ("Squadre iscritte"), aggiungi:

```html
    <div id="notice"></div>
```

E dentro la card "Squadre iscritte" aggiungi, sotto il link partecipanti, un link avvisi:

```html
      <a class="pf-btn" id="avvisi" href="#" style="margin-left:var(--space-2)">Vedi tutti gli avvisi →</a>
```

In `apps/public/landing.ts`, estendi l'import store con `getAnnouncements`:

```ts
import { getCategories, getEvent, getRegistrations, getSchedule, getAnnouncements } from '../../shared/mock/store'
```

In fondo al file aggiungi:

```ts
document.getElementById('avvisi')!.setAttribute('href', `/apps/public/avvisi.html?event=${id}`)
const featured = getAnnouncements(id)[0]
document.getElementById('notice')!.innerHTML = featured
  ? `<div class="pf-card"><div class="pf-cat__label" style="margin-bottom:var(--space-2)">📣 ${featured.title}</div><p>${featured.body}</p>
     <a class="pf-btn" href="/apps/public/avvisi.html?event=${id}">Tutti gli avvisi →</a></div>`
  : ''
```

- [ ] **Step 4: Striscia "in evidenza" in cima al calendario public**

In `apps/public/calendar.ts`, estendi l'import store con `getAnnouncements`:

```ts
import { getCategories, getEvent, getSchedule, getScheduledMatches, getAnnouncements } from '../../shared/mock/store'
```

Subito dopo la riga che imposta l'eyebrow (`document.getElementById('eyebrow')!...`), aggiungi (inietta la striscia prima del blocco `#viewtabs` via `insertAdjacentHTML` sul pagehead):

```ts
const featured = getAnnouncements(id)[0]
if (featured) document.querySelector('.pf-pagehead')!.insertAdjacentHTML('afterend',
  `<div class="pf-card"><span class="pf-mono pf-muted">📣 Avviso</span> <b>${featured.title}</b> — ${featured.body}
   <a href="/apps/public/avvisi.html?event=${id}">Tutti gli avvisi →</a></div>`)
```

- [ ] **Step 5: Registra la pagina in Vite**

In `vite.config.ts`, dentro `input: { ... }` aggiungi dopo `bracket`:

```ts
        avvisiPub: r('apps/public/avvisi.html'),
```

- [ ] **Step 6: Verifica build**

Run: `npm run build`
Expected: build OK, nessun errore TS.

- [ ] **Step 7: Verifica manuale**

Run: `npm run dev`. Verifica:
- `/apps/public/landing.html?event=evt-1` → card "📣 Iscrizioni in chiusura" in evidenza + link "Vedi tutti gli avvisi".
- `/apps/public/avvisi.html?event=evt-1` → lista con chip filtro (Tutte/U10/U12/U14); selezionando U10 restano gli event-wide + l'avviso U10.
- `/apps/public/calendar.html?event=evt-1` → striscia avviso in cima (il calendario evt-1 non è pubblicato: la striscia compare comunque sopra il messaggio "non pubblicato", ok).

- [ ] **Step 8: Esegui l'intera suite**

Run: `npm test`
Expected: tutti PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/public/avvisi.html apps/public/avvisi.ts apps/public/landing.html apps/public/landing.ts apps/public/calendar.ts vite.config.ts
git commit -m "feat(cm1): E3 avvisi page + featured notice on landing & calendar"
```

---

## Self-Review

**Spec coverage:**
- Modello dati `Announcement` + `State.announcements` → Task 1 Step 3. ✓
- Store `getAnnouncements`/`addAnnouncement`/`removeAnnouncement`/`togglePin` + ordinamento pinned/recency → Task 1 Step 5 + test Step 1. ✓
- Seed 3 avvisi demo (event-wide, categoria, in evidenza) → Task 1 Step 4. ✓
- E1 pagina avvisi: form (titolo/testo/categoria/in evidenza), reach simulato, lista con elimina+toggle → Task 2. ✓
- Aggancio event-hub → Task 2 Step 3. ✓
- E3 pagina dedicata filtrabile per categoria → Task 3 Step 2. ✓
- Avviso in evidenza su landing + striscia su calendario + link nav → Task 3 Steps 3-4. ✓
- Test store → Task 1. ✓
- Fuori scope (email reali, DM, ricevute, edit in-place, rich text, notifiche automatiche) → non implementati. ✓

**Placeholder scan:** nessun TBD/TODO; ogni step ha codice o comando concreto. La sola condizionale è la verifica `.pf-check` (Task 2 Step 4) con fallback esplicito.

**Type consistency:** `Announcement` con `categoryId: string | null` usato coerentemente in store, seed, E1, E3; `getAnnouncements(id)[0]` come "in evidenza" coerente tra landing e calendario; nomi funzioni identici tra definizione (Task 1) e uso (Task 2/3).
