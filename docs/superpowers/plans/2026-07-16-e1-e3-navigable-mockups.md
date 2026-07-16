# E1 + E3 Navigable Mockups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build mid-fidelity, navigable browser mockups of the E1 Organizer and E3 Public experiences covering the Bundle Enrollment flow, with a shared fake `localStorage` backend so the enrollment loop works end-to-end without a real backend.

**Architecture:** A single Vite multi-page app (MPA) rooted at `playfusion-web`. Each screen is its own `.html` + `.ts` pair; navigation is plain `<a href>` links (truly navigable, real URLs). A shared, framework-free `store` module persists demo state in `localStorage` so an enrollment submitted in E3 appears in E1's inbox. Styling comes from design tokens (CSS custom properties) copied from the existing design system, plus a small shared `ui.css`. No framework, no `pf-*` component library, no backend.

**Tech Stack:** Vite (MPA mode), TypeScript (vanilla, no framework), Vitest + jsdom (store tests), plain HTML/CSS.

## Global Constraints

- **No framework** — vanilla TS/HTML/CSS only. No React/Vue/Lit/web-component library.
- **No backend / no network** — all state is seed JSON + `localStorage`. No `fetch`, no Auth0.
- **Styling via design tokens** — colors/spacing/radius/typography come from CSS custom properties in `shared/tokens.css` (copied from `playfusion-frontend/playfuse-frontend/libs/tokens`, semantic names like `--color-action-primary`). Screens must not hardcode hex values; use `var(--…)`.
- **Deterministic IDs** — generate IDs from array length + prefix (e.g. `r${n+1}`), never `Math.random`.
- **Node** `>=20 <21`.
- **Form factors** — E1 (`apps/organizer`) desktop-first, mobile-adaptive; E3 (`apps/public`) mobile-first.
- **Scope stop** — E1 Setup flow stops at "quota pagata"; later PB-1 steps (fixture/approve/publish) are rendered visible-but-disabled, not implemented. E3 standings/schedule are stubbed.

---

## File Structure

```
playfusion-web/
  package.json
  tsconfig.json
  vite.config.ts              # MPA: every screen html is an input
  vitest.config.ts
  index.html                  # demo hub → links into E1 and E3 + reset
  shared/
    tokens.css                # design tokens (custom properties)
    ui.css                    # shared chrome, buttons, cards, tables, badges
    mock/
      types.ts                # domain types
      seed.ts                 # buildSeed(): State
      store.ts                # localStorage-backed store API (real logic, tested)
      store.test.ts           # Vitest tests for store
    chrome.ts                 # renderOrganizerNav() / renderPublicHeader() helpers
  apps/
    organizer/                # E1
      dashboard.html   dashboard.ts
      create-event.html create-event.ts
      event-hub.html   event-hub.ts
      categories.html  categories.ts
      registrations.html registrations.ts
      inbox.html       inbox.ts
      payments.html    payments.ts
    public/                   # E3
      landing.html     landing.ts
      enroll.html      enroll.ts
      participants.html participants.ts
```

Split rationale: `store.ts` holds all logic (one responsibility: demo state), so screens stay thin (render + wire clicks). `chrome.ts` centralizes navigation markup (DRY). Each screen file owns exactly one screen.

---

### Task 1: Project scaffold + shared styling + demo hub

**Files:**
- Create: `playfusion-web/package.json`
- Create: `playfusion-web/tsconfig.json`
- Create: `playfusion-web/vite.config.ts`
- Create: `playfusion-web/vitest.config.ts`
- Create: `playfusion-web/shared/tokens.css`
- Create: `playfusion-web/shared/ui.css`
- Create: `playfusion-web/index.html`

**Interfaces:**
- Consumes: nothing.
- Produces: a running Vite dev server; `shared/tokens.css` (custom properties) and `shared/ui.css` (classes `.pf-btn`, `.pf-btn--primary`, `.pf-card`, `.pf-table`, `.pf-badge`, `.pf-badge--paid`, `.pf-badge--unpaid`, `.pf-topbar`, `.pf-container`) consumed by every screen.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "playfusion-web",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20 <21" },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["vite/client"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["shared", "apps"]
}
```

- [ ] **Step 3: Create `vite.config.ts` (MPA — one input per screen)**

```ts
import { defineConfig } from 'vite'
import { resolve } from 'node:path'

const r = (p: string) => resolve(__dirname, p)

export default defineConfig({
  appType: 'mpa',
  build: {
    rollupOptions: {
      input: {
        hub: r('index.html'),
        dashboard: r('apps/organizer/dashboard.html'),
        createEvent: r('apps/organizer/create-event.html'),
        eventHub: r('apps/organizer/event-hub.html'),
        categories: r('apps/organizer/categories.html'),
        registrations: r('apps/organizer/registrations.html'),
        inbox: r('apps/organizer/inbox.html'),
        payments: r('apps/organizer/payments.html'),
        landing: r('apps/public/landing.html'),
        enroll: r('apps/public/enroll.html'),
        participants: r('apps/public/participants.html'),
      },
    },
  },
})
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'jsdom', include: ['shared/**/*.test.ts'] },
})
```

- [ ] **Step 5: Create `shared/tokens.css`** (semantic tokens; values are placeholder-brand until synced from design system)

```css
:root {
  --color-bg: #f6f7f9;
  --color-surface: #ffffff;
  --color-border: #e2e5ea;
  --color-text: #1c2430;
  --color-text-muted: #667085;
  --color-action-primary: #2f6df6;
  --color-action-primary-text: #ffffff;
  --color-success: #1f9d55;
  --color-warning: #b7791f;
  --color-danger: #d64545;
  --space-1: 4px; --space-2: 8px; --space-3: 12px;
  --space-4: 16px; --space-5: 24px; --space-6: 32px;
  --radius-1: 6px; --radius-2: 10px;
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --shadow-1: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.1);
}
```

- [ ] **Step 6: Create `shared/ui.css`** (shared chrome/components)

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: var(--font-sans); color: var(--color-text); background: var(--color-bg); }
a { color: var(--color-action-primary); }
.pf-container { max-width: 1040px; margin: 0 auto; padding: var(--space-5); }
.pf-container--narrow { max-width: 560px; }
.pf-topbar { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3) var(--space-5);
  background: var(--color-surface); border-bottom: 1px solid var(--color-border); }
.pf-topbar strong { font-size: 18px; }
.pf-topbar nav { display: flex; gap: var(--space-4); margin-left: auto; }
.pf-topbar nav a { text-decoration: none; color: var(--color-text-muted); }
.pf-topbar nav a[aria-current="page"] { color: var(--color-text); font-weight: 600; }
.pf-card { background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-2); padding: var(--space-5); box-shadow: var(--shadow-1); margin-bottom: var(--space-4); }
.pf-btn { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-1); border: 1px solid var(--color-border); background: var(--color-surface);
  color: var(--color-text); font: inherit; cursor: pointer; text-decoration: none; }
.pf-btn--primary { background: var(--color-action-primary); color: var(--color-action-primary-text); border-color: transparent; }
.pf-btn:disabled, .pf-btn[aria-disabled="true"] { opacity: .5; cursor: not-allowed; }
.pf-table { width: 100%; border-collapse: collapse; }
.pf-table th, .pf-table td { text-align: left; padding: var(--space-3); border-bottom: 1px solid var(--color-border); }
.pf-badge { display: inline-block; padding: 2px var(--space-2); border-radius: var(--radius-1); font-size: 12px; font-weight: 600; }
.pf-badge--paid { background: #e7f6ee; color: var(--color-success); }
.pf-badge--unpaid { background: #fbeeee; color: var(--color-danger); }
.pf-badge--pending { background: #fff4e0; color: var(--color-warning); }
.pf-field { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-4); }
.pf-field input, .pf-field select { padding: var(--space-3); border: 1px solid var(--color-border);
  border-radius: var(--radius-1); font: inherit; }
.pf-muted { color: var(--color-text-muted); }
.pf-steplist { list-style: none; padding: 0; margin: 0; }
.pf-steplist li { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0;
  border-bottom: 1px solid var(--color-border); }
.pf-steplist li[data-done="true"]::before { content: "✓"; color: var(--color-success); font-weight: 700; }
.pf-steplist li[data-done="false"]::before { content: "○"; color: var(--color-text-muted); }
.pf-steplist li[data-disabled="true"] { opacity: .45; }
```

- [ ] **Step 7: Create `index.html` (demo hub)**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PlayFusion — Demo Mockups</title>
  <link rel="stylesheet" href="/shared/tokens.css" />
  <link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <div class="pf-container pf-container--narrow">
    <h1>PlayFusion — Mockup navigabili</h1>
    <p class="pf-muted">Demo del flusso Bundle Enrollment. Lo stato è finto (localStorage).</p>
    <div class="pf-card">
      <h2>E1 — Organizer</h2>
      <a class="pf-btn pf-btn--primary" href="/apps/organizer/dashboard.html">Apri Organizer</a>
    </div>
    <div class="pf-card">
      <h2>E3 — Public</h2>
      <a class="pf-btn pf-btn--primary" href="/apps/public/landing.html?event=evt-1">Apri vista pubblica</a>
    </div>
    <button class="pf-btn" id="reset">Reset demo</button>
  </div>
  <script type="module">
    import { resetDemo } from '/shared/mock/store.ts'
    document.getElementById('reset').addEventListener('click', () => { resetDemo(); alert('Demo resettata.') })
  </script>
</body>
</html>
```

- [ ] **Step 8: Install and run the dev server**

Run: `cd playfusion-web && npm install && npm run dev`
Expected: Vite serves; opening the printed URL shows the hub with two "Apri" buttons and a "Reset demo" button. (The reset button will error until Task 2 creates the store — that is expected; the page itself renders.)

- [ ] **Step 9: Commit**

```bash
cd playfusion-web
git add package.json tsconfig.json vite.config.ts vitest.config.ts shared/tokens.css shared/ui.css index.html
git commit -m "chore: scaffold playfusion-web mockups (vite mpa + shared styling + hub)"
```

---

### Task 2: Domain types, seed data, and the localStorage store (TDD)

**Files:**
- Create: `playfusion-web/shared/mock/types.ts`
- Create: `playfusion-web/shared/mock/seed.ts`
- Create: `playfusion-web/shared/mock/store.ts`
- Test: `playfusion-web/shared/mock/store.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (relied on by every screen):
  - Types `TournamentEvent`, `Category`, `Registration`, `RegStatus = 'PENDING'|'CONFIRMED'`, `PayStatus = 'UNPAID'|'PAID'`.
  - `resetDemo(): void`
  - `getEvents(): TournamentEvent[]`
  - `getEvent(id: string): TournamentEvent | undefined`
  - `createEvent(input: { name: string; sport: string; startDate: string; endDate: string }): TournamentEvent`
  - `getCategories(eventId: string): Category[]`
  - `addCategory(eventId: string, name: string): Category`
  - `setRegistrationsOpen(eventId: string, open: boolean): void`
  - `getRegistrations(eventId: string): Registration[]`
  - `addRegistration(input: { eventId: string; categoryId: string; teamName: string; coachName: string; contactPhone: string }): Registration`
  - `confirmTeam(regId: string): void`
  - `markPaid(regId: string): void`

- [ ] **Step 1: Write `shared/mock/types.ts`**

```ts
export type RegStatus = 'PENDING' | 'CONFIRMED'
export type PayStatus = 'UNPAID' | 'PAID'

export interface TournamentEvent {
  id: string
  name: string
  sport: string
  startDate: string
  endDate: string
  template: string
  registrationsOpen: boolean
}

export interface Category { id: string; eventId: string; name: string }

export interface Registration {
  id: string
  eventId: string
  categoryId: string
  teamName: string
  coachName: string
  contactPhone: string
  status: RegStatus
  paymentStatus: PayStatus
  createdAt: string
}

export interface State {
  events: TournamentEvent[]
  categories: Category[]
  registrations: Registration[]
}
```

- [ ] **Step 2: Write `shared/mock/seed.ts`**

```ts
import type { State } from './types'

export function buildSeed(): State {
  return {
    events: [{
      id: 'evt-1', name: 'Torneo Estivo Memorial', sport: 'Calcio',
      startDate: '2026-08-29', endDate: '2026-08-30', template: 'PB-1',
      registrationsOpen: true,
    }],
    categories: [
      { id: 'cat-1', eventId: 'evt-1', name: 'U10' },
      { id: 'cat-2', eventId: 'evt-1', name: 'U12' },
      { id: 'cat-3', eventId: 'evt-1', name: 'U14' },
    ],
    registrations: [
      { id: 'reg-1', eventId: 'evt-1', categoryId: 'cat-1', teamName: 'ASD Aurora',
        coachName: 'Luigi Verdi', contactPhone: '340 1112223', status: 'CONFIRMED',
        paymentStatus: 'PAID', createdAt: '2026-07-10T09:00:00.000Z' },
      { id: 'reg-2', eventId: 'evt-1', categoryId: 'cat-2', teamName: 'Polisportiva San Marco',
        coachName: 'Anna Bianchi', contactPhone: '347 4445556', status: 'CONFIRMED',
        paymentStatus: 'UNPAID', createdAt: '2026-07-11T14:30:00.000Z' },
      { id: 'reg-3', eventId: 'evt-1', categoryId: 'cat-1', teamName: 'GS Rivalta',
        coachName: 'Marco Neri', contactPhone: '333 7778889', status: 'PENDING',
        paymentStatus: 'UNPAID', createdAt: '2026-07-12T08:15:00.000Z' },
    ],
  }
}
```

- [ ] **Step 3: Write the failing test `shared/mock/store.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  resetDemo, getEvents, getEvent, createEvent, getCategories, addCategory,
  setRegistrationsOpen, getRegistrations, addRegistration, confirmTeam, markPaid,
} from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('store', () => {
  it('seeds one event with three categories and three registrations', () => {
    expect(getEvents()).toHaveLength(1)
    expect(getEvent('evt-1')?.name).toBe('Torneo Estivo Memorial')
    expect(getCategories('evt-1')).toHaveLength(3)
    expect(getRegistrations('evt-1')).toHaveLength(3)
  })

  it('createEvent appends an event with a fresh id and open registrations off', () => {
    const e = createEvent({ name: 'Coppa Primavera', sport: 'Calcio', startDate: '2026-09-01', endDate: '2026-09-02' })
    expect(e.id).toBe('evt-2')
    expect(e.registrationsOpen).toBe(false)
    expect(getEvents()).toHaveLength(2)
  })

  it('addCategory appends to the event', () => {
    const c = addCategory('evt-1', 'U16')
    expect(c.id).toBe('cat-4')
    expect(getCategories('evt-1').map(x => x.name)).toContain('U16')
  })

  it('setRegistrationsOpen toggles the flag', () => {
    setRegistrationsOpen('evt-1', false)
    expect(getEvent('evt-1')?.registrationsOpen).toBe(false)
  })

  it('addRegistration creates a PENDING/UNPAID registration visible in the list', () => {
    const r = addRegistration({ eventId: 'evt-1', categoryId: 'cat-3', teamName: 'Nuova Squadra',
      coachName: 'Test Coach', contactPhone: '000' })
    expect(r.id).toBe('reg-4')
    expect(r.status).toBe('PENDING')
    expect(r.paymentStatus).toBe('UNPAID')
    expect(getRegistrations('evt-1')).toHaveLength(4)
  })

  it('confirmTeam and markPaid mutate the registration', () => {
    confirmTeam('reg-3'); markPaid('reg-3')
    const r = getRegistrations('evt-1').find(x => x.id === 'reg-3')!
    expect(r.status).toBe('CONFIRMED')
    expect(r.paymentStatus).toBe('PAID')
  })

  it('persists across store reads via localStorage', () => {
    addCategory('evt-1', 'U16')
    expect(getCategories('evt-1')).toHaveLength(4)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd playfusion-web && npm test`
Expected: FAIL — cannot resolve `./store` / functions not defined.

- [ ] **Step 5: Write `shared/mock/store.ts`**

```ts
import type { Category, Registration, State, TournamentEvent } from './types'
import { buildSeed } from './seed'

const KEY = 'playfusion-mock-v1'

function load(): State {
  const raw = localStorage.getItem(KEY)
  if (!raw) { const seed = buildSeed(); localStorage.setItem(KEY, JSON.stringify(seed)); return seed }
  return JSON.parse(raw) as State
}
function save(state: State): void { localStorage.setItem(KEY, JSON.stringify(state)) }

export function resetDemo(): void { save(buildSeed()) }

export function getEvents(): TournamentEvent[] { return load().events }
export function getEvent(id: string): TournamentEvent | undefined { return load().events.find(e => e.id === id) }

export function createEvent(input: { name: string; sport: string; startDate: string; endDate: string }): TournamentEvent {
  const state = load()
  const event: TournamentEvent = {
    id: `evt-${state.events.length + 1}`, name: input.name, sport: input.sport,
    startDate: input.startDate, endDate: input.endDate, template: 'PB-1', registrationsOpen: false,
  }
  state.events.push(event); save(state); return event
}

export function getCategories(eventId: string): Category[] {
  return load().categories.filter(c => c.eventId === eventId)
}
export function addCategory(eventId: string, name: string): Category {
  const state = load()
  const category: Category = { id: `cat-${state.categories.length + 1}`, eventId, name }
  state.categories.push(category); save(state); return category
}

export function setRegistrationsOpen(eventId: string, open: boolean): void {
  const state = load()
  const e = state.events.find(x => x.id === eventId); if (e) e.registrationsOpen = open
  save(state)
}

export function getRegistrations(eventId: string): Registration[] {
  return load().registrations.filter(r => r.eventId === eventId)
}
export function addRegistration(input: {
  eventId: string; categoryId: string; teamName: string; coachName: string; contactPhone: string
}): Registration {
  const state = load()
  const reg: Registration = {
    id: `reg-${state.registrations.length + 1}`, ...input,
    status: 'PENDING', paymentStatus: 'UNPAID', createdAt: new Date().toISOString(),
  }
  state.registrations.push(reg); save(state); return reg
}
export function confirmTeam(regId: string): void {
  const state = load()
  const r = state.registrations.find(x => x.id === regId); if (r) r.status = 'CONFIRMED'
  save(state)
}
export function markPaid(regId: string): void {
  const state = load()
  const r = state.registrations.find(x => x.id === regId); if (r) r.paymentStatus = 'PAID'
  save(state)
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd playfusion-web && npm test`
Expected: PASS — all 7 tests green.

- [ ] **Step 7: Verify the hub reset button now works**

Run: `npm run dev`, open the hub, click "Reset demo".
Expected: alert "Demo resettata."; no console error.

- [ ] **Step 8: Commit**

```bash
cd playfusion-web
git add shared/mock/types.ts shared/mock/seed.ts shared/mock/store.ts shared/mock/store.test.ts
git commit -m "feat: mock domain types, seed data and localStorage store with tests"
```

---

### Task 3: Shared chrome helper + E1 read-only screens (dashboard, create-event, event-hub)

**Files:**
- Create: `playfusion-web/shared/chrome.ts`
- Create: `playfusion-web/apps/organizer/dashboard.html`, `dashboard.ts`
- Create: `playfusion-web/apps/organizer/create-event.html`, `create-event.ts`
- Create: `playfusion-web/apps/organizer/event-hub.html`, `event-hub.ts`

**Interfaces:**
- Consumes: store API from Task 2.
- Produces: `renderOrganizerTopbar(active: string): string` and `renderPublicTopbar(): string` from `shared/chrome.ts` (return HTML strings injected into a `.pf-topbar` mount). E1 screens link to each other and to `event-hub.html?event=<id>`.

- [ ] **Step 1: Write `shared/chrome.ts`**

```ts
export function renderOrganizerTopbar(active: string): string {
  const link = (href: string, label: string, key: string) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`
  return `<strong>PlayFusion · Organizer</strong>
    <nav>
      ${link('/apps/organizer/dashboard.html', 'Eventi', 'dashboard')}
      <a href="/index.html">Esci demo</a>
    </nav>`
}

export function renderPublicTopbar(): string {
  return `<strong>PlayFusion</strong>`
}
```

- [ ] **Step 2: Write `apps/organizer/dashboard.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Eventi</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-topbar" id="topbar"></header>
  <main class="pf-container">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <h1>I tuoi eventi</h1>
      <a class="pf-btn pf-btn--primary" href="/apps/organizer/create-event.html">+ Crea evento</a>
    </div>
    <div id="events"></div>
  </main>
  <script type="module" src="./dashboard.ts"></script>
</body>
</html>
```

- [ ] **Step 3: Write `apps/organizer/dashboard.ts`**

```ts
import '../../shared/mock/store'
import { renderOrganizerTopbar } from '../../shared/chrome'
import { getEvents, getRegistrations } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')

const events = getEvents()
document.getElementById('events')!.innerHTML = events.map(e => {
  const count = getRegistrations(e.id).length
  return `<a class="pf-card" style="display:block;text-decoration:none;color:inherit"
      href="/apps/organizer/event-hub.html?event=${e.id}">
    <h2 style="margin:0 0 8px">${e.name}</h2>
    <div class="pf-muted">${e.sport} · ${e.startDate} → ${e.endDate} · ${count} iscrizioni</div>
  </a>`
}).join('')
```

- [ ] **Step 4: Write `apps/organizer/create-event.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Crea evento</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-topbar" id="topbar"></header>
  <main class="pf-container pf-container--narrow">
    <h1>Crea evento</h1>
    <form class="pf-card" id="form">
      <div class="pf-field"><label>Template</label>
        <select name="template"><option value="PB-1">PB-1 · Torneo Estivo Memorial (Calcio giovanile)</option></select></div>
      <div class="pf-field"><label>Nome evento</label><input name="name" required value="Torneo Estivo Memorial" /></div>
      <div class="pf-field"><label>Sport</label><input name="sport" required value="Calcio" /></div>
      <div class="pf-field"><label>Inizio</label><input name="startDate" type="date" required value="2026-08-29" /></div>
      <div class="pf-field"><label>Fine</label><input name="endDate" type="date" required value="2026-08-30" /></div>
      <button class="pf-btn pf-btn--primary" type="submit">Crea evento</button>
    </form>
  </main>
  <script type="module" src="./create-event.ts"></script>
</body>
</html>
```

- [ ] **Step 5: Write `apps/organizer/create-event.ts`**

```ts
import { renderOrganizerTopbar } from '../../shared/chrome'
import { createEvent } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')

document.getElementById('form')!.addEventListener('submit', (ev) => {
  ev.preventDefault()
  const f = ev.target as HTMLFormElement
  const data = new FormData(f)
  const event = createEvent({
    name: String(data.get('name')), sport: String(data.get('sport')),
    startDate: String(data.get('startDate')), endDate: String(data.get('endDate')),
  })
  location.href = `/apps/organizer/event-hub.html?event=${event.id}`
})
```

- [ ] **Step 6: Write `apps/organizer/event-hub.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Evento</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-topbar" id="topbar"></header>
  <main class="pf-container">
    <a class="pf-muted" href="/apps/organizer/dashboard.html">← Tutti gli eventi</a>
    <h1 id="title"></h1>
    <div class="pf-card">
      <h2>Setup — PB-1</h2>
      <ol class="pf-steplist" id="steps"></ol>
    </div>
  </main>
  <script type="module" src="./event-hub.ts"></script>
</body>
</html>
```

- [ ] **Step 7: Write `apps/organizer/event-hub.ts`** (checklist; steps up to "quota pagata" active, rest disabled)

```ts
import { renderOrganizerTopbar } from '../../shared/chrome'
import { getEvent, getRegistrations } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const event = getEvent(id)
document.getElementById('title')!.textContent = event ? event.name : 'Evento non trovato'

const regs = event ? getRegistrations(id) : []
const anyPaid = regs.some(r => r.paymentStatus === 'PAID')

type Step = { label: string; href?: string; done: boolean; disabled?: boolean }
const steps: Step[] = [
  { label: 'Crea evento da template', done: !!event },
  { label: 'Configura categorie', href: `/apps/organizer/categories.html?event=${id}`, done: true },
  { label: 'Apri iscrizioni', href: `/apps/organizer/registrations.html?event=${id}`, done: !!event?.registrationsOpen },
  { label: 'Conferma squadre', href: `/apps/organizer/inbox.html?event=${id}`, done: regs.some(r => r.status === 'CONFIRMED') },
  { label: 'Riscuoti quote', href: `/apps/organizer/payments.html?event=${id}`, done: anyPaid },
  { label: 'Genera calendario', done: false, disabled: true },
  { label: 'Approva calendario', done: false, disabled: true },
  { label: 'Pubblica evento', done: false, disabled: true },
]

document.getElementById('steps')!.innerHTML = steps.map(s => {
  const inner = s.href && !s.disabled ? `<a href="${s.href}">${s.label}</a>` : `<span>${s.label}</span>`
  return `<li data-done="${s.done}" data-disabled="${s.disabled ? 'true' : 'false'}">${inner}</li>`
}).join('')
```

- [ ] **Step 8: Verify in the browser**

Run: `npm run dev`. From hub → "Apri Organizer": dashboard lists the Memorial event with "3 iscrizioni". Click it → event hub shows the PB-1 checklist (first 5 steps active, last 3 dimmed). Click "+ Crea evento" → fill form → submit → lands on the new event's hub.
Expected: all navigation works; no console errors.

- [ ] **Step 9: Commit**

```bash
cd playfusion-web
git add shared/chrome.ts apps/organizer/dashboard.* apps/organizer/create-event.* apps/organizer/event-hub.*
git commit -m "feat: E1 chrome + dashboard, create-event, event-hub screens"
```

---

### Task 4: E1 action screens (categories, registrations + shareable link, inbox, payments)

**Files:**
- Create: `playfusion-web/apps/organizer/categories.html`, `categories.ts`
- Create: `playfusion-web/apps/organizer/registrations.html`, `registrations.ts`
- Create: `playfusion-web/apps/organizer/inbox.html`, `inbox.ts`
- Create: `playfusion-web/apps/organizer/payments.html`, `payments.ts`

**Interfaces:**
- Consumes: store API from Task 2, `renderOrganizerTopbar` from Task 3.
- Produces: the shareable link on `registrations.html` pointing to `/apps/public/landing.html?event=<id>` (the bridge to E3). `inbox.html` and `payments.html` mutate the store via `confirmTeam` / `markPaid`.

- [ ] **Step 1: Write `apps/organizer/categories.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Categorie</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-topbar" id="topbar"></header>
  <main class="pf-container pf-container--narrow">
    <a class="pf-muted" id="back" href="#">← Torna all'evento</a>
    <h1>Categorie</h1>
    <div class="pf-card">
      <ul id="list"></ul>
      <form id="form" style="display:flex;gap:8px;margin-top:16px">
        <input class="pf-field" name="name" placeholder="Es. U16" required style="flex:1" />
        <button class="pf-btn pf-btn--primary" type="submit">Aggiungi</button>
      </form>
    </div>
  </main>
  <script type="module" src="./categories.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Write `apps/organizer/categories.ts`**

```ts
import { renderOrganizerTopbar } from '../../shared/chrome'
import { addCategory, getCategories } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

function render() {
  document.getElementById('list')!.innerHTML =
    getCategories(id).map(c => `<li>${c.name}</li>`).join('') || '<li class="pf-muted">Nessuna categoria</li>'
}
render()

document.getElementById('form')!.addEventListener('submit', (ev) => {
  ev.preventDefault()
  const f = ev.target as HTMLFormElement
  const name = String(new FormData(f).get('name')).trim()
  if (name) { addCategory(id, name); f.reset(); render() }
})
```

- [ ] **Step 3: Write `apps/organizer/registrations.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Iscrizioni</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-topbar" id="topbar"></header>
  <main class="pf-container pf-container--narrow">
    <a class="pf-muted" id="back" href="#">← Torna all'evento</a>
    <h1>Iscrizioni</h1>
    <div class="pf-card">
      <p>Stato: <strong id="state"></strong></p>
      <button class="pf-btn pf-btn--primary" id="toggle"></button>
    </div>
    <div class="pf-card" id="linkcard">
      <h2>Link iscrizioni</h2>
      <p class="pf-muted">Condividi questo link (es. WhatsApp). I coach si iscrivono da qui.</p>
      <div style="display:flex;gap:8px">
        <input id="link" readonly style="flex:1;padding:12px;border:1px solid var(--color-border);border-radius:6px" />
        <a class="pf-btn pf-btn--primary" id="open" target="_blank">Apri</a>
      </div>
    </div>
  </main>
  <script type="module" src="./registrations.ts"></script>
</body>
</html>
```

- [ ] **Step 4: Write `apps/organizer/registrations.ts`**

```ts
import { renderOrganizerTopbar } from '../../shared/chrome'
import { getEvent, setRegistrationsOpen } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

const shareUrl = `${location.origin}/apps/public/landing.html?event=${id}`
;(document.getElementById('link') as HTMLInputElement).value = shareUrl
document.getElementById('open')!.setAttribute('href', shareUrl)

function render() {
  const open = !!getEvent(id)?.registrationsOpen
  document.getElementById('state')!.textContent = open ? 'Aperte' : 'Chiuse'
  document.getElementById('toggle')!.textContent = open ? 'Chiudi iscrizioni' : 'Apri iscrizioni'
  document.getElementById('linkcard')!.style.display = open ? 'block' : 'none'
}
render()

document.getElementById('toggle')!.addEventListener('click', () => {
  setRegistrationsOpen(id, !getEvent(id)?.registrationsOpen); render()
})
```

- [ ] **Step 5: Write `apps/organizer/inbox.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Inbox iscrizioni</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-topbar" id="topbar"></header>
  <main class="pf-container">
    <a class="pf-muted" id="back" href="#">← Torna all'evento</a>
    <h1>Inbox iscrizioni</h1>
    <div class="pf-card">
      <table class="pf-table">
        <thead><tr><th>Squadra</th><th>Categoria</th><th>Referente</th><th>Stato</th><th></th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  </main>
  <script type="module" src="./inbox.ts"></script>
</body>
</html>
```

- [ ] **Step 6: Write `apps/organizer/inbox.ts`**

```ts
import { renderOrganizerTopbar } from '../../shared/chrome'
import { confirmTeam, getCategories, getRegistrations } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

function catName(catId: string) { return getCategories(id).find(c => c.id === catId)?.name ?? '—' }

function render() {
  document.getElementById('rows')!.innerHTML = getRegistrations(id).map(r => `
    <tr>
      <td>${r.teamName}</td><td>${catName(r.categoryId)}</td><td>${r.coachName}<br><span class="pf-muted">${r.contactPhone}</span></td>
      <td><span class="pf-badge pf-badge--${r.status === 'CONFIRMED' ? 'paid' : 'pending'}">${r.status === 'CONFIRMED' ? 'Confermata' : 'In attesa'}</span></td>
      <td>${r.status === 'CONFIRMED' ? '' : `<button class="pf-btn pf-btn--primary" data-confirm="${r.id}">Conferma</button>`}</td>
    </tr>`).join('')
  document.querySelectorAll<HTMLButtonElement>('[data-confirm]').forEach(b =>
    b.addEventListener('click', () => { confirmTeam(b.dataset.confirm!); render() }))
}
render()
```

- [ ] **Step 7: Write `apps/organizer/payments.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Quote</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-topbar" id="topbar"></header>
  <main class="pf-container">
    <a class="pf-muted" id="back" href="#">← Torna all'evento</a>
    <h1>Quote iscrizione</h1>
    <div class="pf-card">
      <table class="pf-table">
        <thead><tr><th>Squadra</th><th>Categoria</th><th>Quota</th><th></th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  </main>
  <script type="module" src="./payments.ts"></script>
</body>
</html>
```

- [ ] **Step 8: Write `apps/organizer/payments.ts`**

```ts
import { renderOrganizerTopbar } from '../../shared/chrome'
import { getCategories, getRegistrations, markPaid } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

function catName(catId: string) { return getCategories(id).find(c => c.id === catId)?.name ?? '—' }

function render() {
  document.getElementById('rows')!.innerHTML = getRegistrations(id).map(r => `
    <tr>
      <td>${r.teamName}</td><td>${catName(r.categoryId)}</td>
      <td><span class="pf-badge pf-badge--${r.paymentStatus === 'PAID' ? 'paid' : 'unpaid'}">${r.paymentStatus === 'PAID' ? 'Pagata' : 'Da pagare'}</span></td>
      <td>${r.paymentStatus === 'PAID' ? '' : `<button class="pf-btn pf-btn--primary" data-pay="${r.id}">Segna pagata</button>`}</td>
    </tr>`).join('')
  document.querySelectorAll<HTMLButtonElement>('[data-pay]').forEach(b =>
    b.addEventListener('click', () => { markPaid(b.dataset.pay!); render() }))
}
render()
```

- [ ] **Step 9: Verify in the browser**

Run: `npm run dev`. From an event hub: Categorie → add "U16", it appears. Iscrizioni → toggle shows/hides the share link; copy the link. Inbox → "GS Rivalta" is "In attesa", click Conferma → becomes "Confermata". Quote → "Polisportiva San Marco" is "Da pagare", click Segna pagata → "Pagata".
Expected: all mutations persist on reload; no console errors.

- [ ] **Step 10: Commit**

```bash
cd playfusion-web
git add apps/organizer/categories.* apps/organizer/registrations.* apps/organizer/inbox.* apps/organizer/payments.*
git commit -m "feat: E1 action screens (categories, registrations+link, inbox, payments)"
```

---

### Task 5: E3 Public screens (landing, enroll → writes store, participants)

**Files:**
- Create: `playfusion-web/apps/public/landing.html`, `landing.ts`
- Create: `playfusion-web/apps/public/enroll.html`, `enroll.ts`
- Create: `playfusion-web/apps/public/participants.html`, `participants.ts`

**Interfaces:**
- Consumes: store API from Task 2, `renderPublicTopbar` from Task 3.
- Produces: `enroll.ts` calls `addRegistration(...)` — the write that closes the loop into E1's inbox. All three read `?event=<id>` from the query string (default `evt-1`).

- [ ] **Step 1: Write `apps/public/landing.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PlayFusion · Evento</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-topbar" id="topbar"></header>
  <main class="pf-container pf-container--narrow">
    <div class="pf-card">
      <h1 id="title"></h1>
      <p class="pf-muted" id="meta"></p>
      <div id="cta"></div>
    </div>
    <div class="pf-card">
      <h2>Categorie</h2>
      <ul id="cats"></ul>
      <a id="participants" href="#">Vedi le squadre iscritte →</a>
    </div>
  </main>
  <script type="module" src="./landing.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Write `apps/public/landing.ts`**

```ts
import { renderPublicTopbar } from '../../shared/chrome'
import { getCategories, getEvent } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const event = getEvent(id)

document.getElementById('title')!.textContent = event?.name ?? 'Evento non trovato'
document.getElementById('meta')!.textContent = event ? `${event.sport} · ${event.startDate} → ${event.endDate}` : ''
document.getElementById('cats')!.innerHTML = getCategories(id).map(c => `<li>${c.name}</li>`).join('')
document.getElementById('participants')!.setAttribute('href', `/apps/public/participants.html?event=${id}`)

document.getElementById('cta')!.innerHTML = event?.registrationsOpen
  ? `<a class="pf-btn pf-btn--primary" href="/apps/public/enroll.html?event=${id}">Iscrivi la squadra</a>`
  : `<p class="pf-muted">Le iscrizioni sono chiuse.</p>`
```

- [ ] **Step 3: Write `apps/public/enroll.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PlayFusion · Iscrizione</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-topbar" id="topbar"></header>
  <main class="pf-container pf-container--narrow">
    <h1>Iscrivi la squadra</h1>
    <form class="pf-card" id="form">
      <div class="pf-field"><label>Categoria</label><select name="categoryId" id="cat" required></select></div>
      <div class="pf-field"><label>Nome squadra</label><input name="teamName" required /></div>
      <div class="pf-field"><label>Nome allenatore</label><input name="coachName" required /></div>
      <div class="pf-field"><label>Telefono</label><input name="contactPhone" required /></div>
      <button class="pf-btn pf-btn--primary" type="submit">Invia iscrizione</button>
    </form>
    <div class="pf-card" id="done" style="display:none">
      <h2>Iscrizione inviata ✓</h2>
      <p class="pf-muted">L'organizzatore la vedrà nella sua inbox e la confermerà.</p>
      <a class="pf-btn" id="backlink" href="#">Torna all'evento</a>
    </div>
  </main>
  <script type="module" src="./enroll.ts"></script>
</body>
</html>
```

- [ ] **Step 4: Write `apps/public/enroll.ts`**

```ts
import { renderPublicTopbar } from '../../shared/chrome'
import { addRegistration, getCategories } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('backlink')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)

document.getElementById('cat')!.innerHTML =
  getCategories(id).map(c => `<option value="${c.id}">${c.name}</option>`).join('')

document.getElementById('form')!.addEventListener('submit', (ev) => {
  ev.preventDefault()
  const data = new FormData(ev.target as HTMLFormElement)
  addRegistration({
    eventId: id, categoryId: String(data.get('categoryId')), teamName: String(data.get('teamName')),
    coachName: String(data.get('coachName')), contactPhone: String(data.get('contactPhone')),
  })
  ;(document.getElementById('form') as HTMLElement).style.display = 'none'
  ;(document.getElementById('done') as HTMLElement).style.display = 'block'
})
```

- [ ] **Step 5: Write `apps/public/participants.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PlayFusion · Squadre iscritte</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-topbar" id="topbar"></header>
  <main class="pf-container pf-container--narrow">
    <a class="pf-muted" id="back" href="#">← Torna all'evento</a>
    <h1>Squadre iscritte</h1>
    <div class="pf-card" id="list"></div>
  </main>
  <script type="module" src="./participants.ts"></script>
</body>
</html>
```

- [ ] **Step 6: Write `apps/public/participants.ts`** (public view shows only confirmed teams)

```ts
import { renderPublicTopbar } from '../../shared/chrome'
import { getCategories, getRegistrations } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)

const cats = getCategories(id)
const confirmed = getRegistrations(id).filter(r => r.status === 'CONFIRMED')
document.getElementById('list')!.innerHTML = cats.map(c => {
  const teams = confirmed.filter(r => r.categoryId === c.id)
  return `<h3>${c.name}</h3>` + (teams.length
    ? `<ul>${teams.map(t => `<li>${t.teamName}</li>`).join('')}</ul>`
    : `<p class="pf-muted">Nessuna squadra confermata.</p>`)
}).join('')
```

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`. Open `/apps/public/landing.html?event=evt-1`: shows Memorial, categories, and (registrations open) an "Iscrivi la squadra" CTA. Click it → fill form → submit → success card. Open participants → only CONFIRMED teams listed by category.
Expected: no console errors; the enrollment persists.

- [ ] **Step 8: Commit**

```bash
cd playfusion-web
git add apps/public/landing.* apps/public/enroll.* apps/public/participants.*
git commit -m "feat: E3 public screens (landing, enroll->store, participants)"
```

---

### Task 6: End-to-end loop verification + README

**Files:**
- Create: `playfusion-web/README.md`

**Interfaces:**
- Consumes: everything above. No new code.

- [ ] **Step 1: Run the full test suite**

Run: `cd playfusion-web && npm test`
Expected: PASS — all store tests green.

- [ ] **Step 2: Walk the full loop manually (acceptance)**

Run: `npm run dev`, then:
1. Hub → "Reset demo".
2. Organizer → open Memorial event → Iscrizioni → ensure open → copy the share link.
3. Paste the share link in a new tab (E3 landing) → "Iscrivi la squadra" → submit a NEW team (e.g. "ASD Test", category U14).
4. Back to Organizer → Inbox → the new "ASD Test" row appears as "In attesa" → Conferma.
5. Payments → "Segna pagata" for ASD Test.
6. E3 participants page → "ASD Test" now appears under U14.
Expected: every step works; the E3→E1 enrollment appears without any backend. This satisfies spec success criteria 1–6.

- [ ] **Step 3: Write `README.md`**

```markdown
# playfusion-web

Navigable mid-fidelity mockups for PlayFusion 2.0 web experiences.

## Scope (first round)
- **E1 Organizer** (`apps/organizer/`) — Bundle Enrollment setup flow.
- **E3 Public** (`apps/public/`) — public landing + team enrollment.

State is fake: seed data + `localStorage` (`shared/mock/`). No backend, no framework.

## Run
```bash
npm install
npm run dev     # open the printed URL → start at the hub (index.html)
npm test        # store unit tests
```

## The demo loop
Organizer opens registrations and shares a link → a coach enrolls via that link (E3) →
the enrollment shows up in the Organizer inbox (E1) → confirm + mark the fee paid →
the confirmed team appears on the public participants page. "Reset demo" (hub) restores seed state.

## Not included
E2 Referee (separate mobile repo), E4 Admin, real backend wiring, Auth0, deploy,
PB-1 steps after "quota pagata" (shown disabled).
```

- [ ] **Step 4: Commit**

```bash
cd playfusion-web
git add README.md
git commit -m "docs: add playfusion-web README with demo walkthrough"
```

---

## Self-Review

**1. Spec coverage:**
- Scope E1+E3 Bundle Enrollment → Tasks 3–5. ✓
- Stop at "quota pagata", later steps disabled → Task 3 Step 7 (`disabled: true`). ✓
- E3 standings/schedule stubbed → not built; participants only. ✓ (landing has no standings link — consistent with stub.)
- D1 repo topology (mockups only in playfusion-web) → whole plan scoped to that repo. ✓
- D2 fidelity (tokens, no `pf-*`) → Global Constraints + Task 1 tokens.css. ✓
- D3 stack (Vite + vanilla TS) → Task 1. ✓
- Screen inventory E1 (7) → dashboard, create-event, event-hub, categories, registrations, inbox, payments = 7. ✓
- Screen inventory E3 (3) → landing, enroll, participants = 3. ✓
- Navigation loop + localStorage fake backend + share link bridge → Tasks 2,4,5,6. ✓
- Seed scenario (Memorial, U10/U12/U14, mixed payment states) → Task 2 seed.ts. ✓
- Reset demo → Task 1 hub + Task 6 walkthrough. ✓
- Success criteria 1–6 → Task 6 Step 2. ✓

**2. Placeholder scan:** No TBD/TODO; every code step has full code. Token hex values are intentionally real placeholder-brand values (Global Constraint notes they get synced from the design system) — not a plan placeholder.

**3. Type consistency:** Store signatures in Task 2 Interfaces match `store.ts` implementation and all call sites (`addRegistration`, `confirmTeam`, `markPaid`, `setRegistrationsOpen`, `getRegistrations`, `getCategories`, `createEvent`, `addCategory`). `renderOrganizerTopbar`/`renderPublicTopbar` defined in Task 3, used in Tasks 3–5. Query param key `event` consistent across all screens. IDs use length+prefix (deterministic) as required.
