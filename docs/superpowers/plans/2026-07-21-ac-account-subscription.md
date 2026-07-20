# ac — Account & Subscription onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Percorso self-serve trial-first ibrido: sign-up senza carta → org in prova Pro (14gg) → uso → scadenza a Free limitato → schermo piani/acquisto.

**Architecture:** Nuove entità `User`/`Session` nel mock store (sessione = org attiva, default `org-1`); `signUp`/`activatePro`/`expireTrial` guidano il ciclo `Subscription`; una pagina sign-up pubblica + una pagina abbonamento in E1; banner abbonamento nello shell; gating (cap 1 evento attivo su Free + moduli M-Broadcast/M-Payments = Pro).

**Tech Stack:** TypeScript, Vite (MPA), Vitest + jsdom. Nessuna dipendenza nuova.

## Global Constraints

- Stato finto: seed + `localStorage` (`playfusion-mock-v1`). Nessun backend, no Auth0 reale.
- `getCurrentOrgId()` = `session?.organizationId ?? 'org-1'` (i demo esistenti restano su org-1).
- Trial = 14 giorni; `Subscription` sign-up `{plan:'PRO',status:'TRIAL'}`; scadenza `{plan:'FREE',status:'ACTIVE'}`; upgrade `{plan:'PRO',status:'ACTIVE'}`.
- Free = moduli `['M-Core','M-Compete']` + max 1 evento attivo (fase ≠ DONE). Pro = illimitati + M-Broadcast + M-Payments.
- Classi CSS esistenti + micro-CSS per il banner. Testi in italiano. Tag di fetta: `ac`.

---

### Task 1: Dati + store (User, Session, ciclo subscription, gating helpers)

**Files:**
- Modify: `shared/mock/types.ts` (`User`, `Session`, `State.users`, `State.session`)
- Modify: `shared/mock/seed.ts` (`users: []`, `session: null`)
- Modify: `shared/mock/store.ts` (import + funzioni; `createEvent` usa l'org di sessione)
- Test: `shared/mock/account.test.ts`

**Interfaces:**
- Consumes: `getEventPhase` (da store, fetta ov); `Organization`, `Subscription`, `PlanKey`, `SubStatus`.
- Produces (per Task 2-5):
  - `interface User { id: string; name: string; email: string; organizationId: string; role: 'ADMIN' }`
  - `interface Session { userId: string; organizationId: string }`
  - `signUp(input: { name: string; email: string; orgName: string }): { user: User; organization: Organization }`
  - `getSession(): Session | null`, `getCurrentOrgId(): string`, `logout(): void`
  - `activatePro(orgId: string): void`, `expireTrial(orgId: string): void`
  - `trialDaysLeft(orgId: string): number`, `planOf(orgId: string): PlanKey`
  - `hasModule(orgId: string, key: string): boolean`, `canCreateEvent(orgId: string): boolean`

- [ ] **Step 1: Scrivi i test che falliscono**

Crea `shared/mock/account.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  resetDemo, getCurrentOrgId, getSession, signUp, activatePro, expireTrial,
  trialDaysLeft, planOf, hasModule, canCreateEvent, getSubscription, createEvent, logout,
} from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('session default', () => {
  it('no session → current org is org-1', () => {
    expect(getSession()).toBeNull()
    expect(getCurrentOrgId()).toBe('org-1')
  })
})

describe('signUp', () => {
  it('creates org + user + trial subscription and sets the session', () => {
    const { user, organization } = signUp({ name: 'Marco Test', email: 'marco@test.it', orgName: 'ASD Prova' })
    expect(organization.name).toBe('ASD Prova')
    expect(user.role).toBe('ADMIN')
    expect(getCurrentOrgId()).toBe(organization.id)
    const sub = getSubscription(organization.id)!
    expect(sub.plan).toBe('PRO')
    expect(sub.status).toBe('TRIAL')
    expect(planOf(organization.id)).toBe('PRO')
    expect(hasModule(organization.id, 'M-Broadcast')).toBe(true)
    expect(trialDaysLeft(organization.id)).toBeGreaterThan(12)
  })
})

describe('trial lifecycle', () => {
  it('expireTrial downgrades to limited Free', () => {
    const { organization } = signUp({ name: 'A', email: 'a@b.it', orgName: 'Org X' })
    expireTrial(organization.id)
    expect(planOf(organization.id)).toBe('FREE')
    expect(getSubscription(organization.id)!.status).toBe('ACTIVE')
    expect(hasModule(organization.id, 'M-Broadcast')).toBe(false)
    expect(hasModule(organization.id, 'M-Payments')).toBe(false)
    expect(hasModule(organization.id, 'M-Compete')).toBe(true)
    expect(trialDaysLeft(organization.id)).toBe(0)
  })
  it('activatePro restores Pro + modules', () => {
    const { organization } = signUp({ name: 'A', email: 'a@b.it', orgName: 'Org Y' })
    expireTrial(organization.id)
    activatePro(organization.id)
    expect(planOf(organization.id)).toBe('PRO')
    expect(getSubscription(organization.id)!.status).toBe('ACTIVE')
    expect(hasModule(organization.id, 'M-Payments')).toBe(true)
  })
})

describe('event cap on Free', () => {
  it('Free org may create one active event, not a second', () => {
    const { organization } = signUp({ name: 'A', email: 'a@b.it', orgName: 'Org Z' })
    expireTrial(organization.id) // now FREE, session still on this org
    expect(canCreateEvent(organization.id)).toBe(true)
    createEvent({ name: 'T1', sport: 'Calcio', location: 'X', startDate: '2026-09-01', startTime: '09:00', endDate: '2026-09-01' })
    expect(canCreateEvent(organization.id)).toBe(false) // 1 active event already
  })
  it('Pro (trial) org has no cap', () => {
    const { organization } = signUp({ name: 'A', email: 'a@b.it', orgName: 'Org W' })
    createEvent({ name: 'T1', sport: 'Calcio', location: 'X', startDate: '2026-09-01', startTime: '09:00', endDate: '2026-09-01' })
    expect(canCreateEvent(organization.id)).toBe(true) // PRO → unlimited
  })
})

describe('logout', () => {
  it('clears session back to default org', () => {
    signUp({ name: 'A', email: 'a@b.it', orgName: 'Org L' })
    logout()
    expect(getSession()).toBeNull()
    expect(getCurrentOrgId()).toBe('org-1')
  })
})
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

Run: `npm test -- account`
Expected: FAIL (funzioni assenti).

- [ ] **Step 3: Aggiungi i tipi**

In `shared/mock/types.ts`, prima di `export interface State`:

```ts
export interface User {
  id: string
  name: string
  email: string
  organizationId: string
  role: 'ADMIN'
}
export interface Session {
  userId: string
  organizationId: string
}
```

In `export interface State { ... }` aggiungi:

```ts
  users: User[]
  session: Session | null
```

- [ ] **Step 4: Aggiorna il seed**

In `shared/mock/seed.ts`, nell'oggetto `state: State = { ... }` (dopo `announcements: [...]`):

```ts
    users: [],
    session: null,
```

- [ ] **Step 5: Import + funzioni store**

In `shared/mock/store.ts` estendi l'import dei tipi aggiungendo `User, Session`:

```ts
import type { Category, Competition, CompetitionConfig, Registration, Schedule, ScheduleConfig, ScheduledMatch, StandingRow, FinalMatch, GroupSlot, FixtureCategory, State, TournamentEvent, ScheduledCategory, Organization, OrgStatus, Subscription, PlanKey, SubStatus, TieBreakCriterion, TieOverride, Announcement, User, Session } from './types'
```

Modifica `createEvent` per usare l'org di sessione (sostituisci `organizationId: 'org-1'` nella creazione dell'evento con `organizationId: state.session?.organizationId ?? 'org-1'`).

In fondo al file aggiungi:

```ts
export function getSession(): Session | null { return load().session }
export function getCurrentOrgId(): string { return load().session?.organizationId ?? 'org-1' }
export function logout(): void { const s = load(); s.session = null; save(s) }

export function signUp(input: { name: string; email: string; orgName: string }): { user: User; organization: Organization } {
  const state = load()
  const orgNum = Math.max(0, ...state.organizations.map(o => Number(o.id.replace('org-', '')) || 0)) + 1
  const usrNum = Math.max(0, ...state.users.map(u => Number(u.id.replace('usr-', '')) || 0)) + 1
  const orgId = `org-${orgNum}`
  const organization: Organization = { id: orgId, name: input.orgName, status: 'ACTIVE', modules: ['M-Core', 'M-Compete', 'M-Broadcast', 'M-Payments'] }
  const user: User = { id: `usr-${usrNum}`, name: input.name, email: input.email, organizationId: orgId, role: 'ADMIN' }
  const renewsOn = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const sub: Subscription = { organizationId: orgId, plan: 'PRO', status: 'TRIAL', renewsOn }
  state.organizations.push(organization); state.users.push(user); state.subscriptions.push(sub)
  state.session = { userId: user.id, organizationId: orgId }
  save(state); return { user, organization }
}

export function planOf(orgId: string): PlanKey { return load().subscriptions.find(s => s.organizationId === orgId)?.plan ?? 'FREE' }
export function hasModule(orgId: string, key: string): boolean { return load().organizations.find(o => o.id === orgId)?.modules.includes(key) ?? false }
export function trialDaysLeft(orgId: string): number {
  const sub = load().subscriptions.find(s => s.organizationId === orgId)
  if (!sub) return 0
  const ms = new Date(sub.renewsOn).getTime() - Date.now()
  return Math.max(0, Math.floor(ms / 86400000))
}
export function activatePro(orgId: string): void {
  const state = load()
  const sub = state.subscriptions.find(s => s.organizationId === orgId); if (sub) { sub.plan = 'PRO'; sub.status = 'ACTIVE' }
  const org = state.organizations.find(o => o.id === orgId)
  if (org) for (const m of ['M-Broadcast', 'M-Payments']) if (!org.modules.includes(m)) org.modules.push(m)
  save(state)
}
export function expireTrial(orgId: string): void {
  const state = load()
  const sub = state.subscriptions.find(s => s.organizationId === orgId); if (sub) { sub.plan = 'FREE'; sub.status = 'ACTIVE'; sub.renewsOn = new Date(Date.now() - 86400000).toISOString().slice(0, 10) }
  const org = state.organizations.find(o => o.id === orgId); if (org) org.modules = ['M-Core', 'M-Compete']
  save(state)
}
export function canCreateEvent(orgId: string): boolean {
  if (planOf(orgId) !== 'FREE') return true
  const active = load().events.filter(e => e.organizationId === orgId && getEventPhase(e.id) !== 'DONE').length
  return active < 1
}
```

- [ ] **Step 6: Esegui i test**

Run: `npm test -- account`
Expected: PASS.

- [ ] **Step 7: Suite completa + typecheck**

Run: `npm test` → tutti PASS (108 + nuovi). Run: `npx tsc --noEmit` → nessun errore.

- [ ] **Step 8: Commit**

```bash
git add shared/mock/types.ts shared/mock/seed.ts shared/mock/store.ts shared/mock/account.test.ts docs/superpowers/specs/2026-07-21-ac-account-subscription-design.md docs/superpowers/plans/2026-07-21-ac-account-subscription.md
git commit -m "feat(ac): User/Session + subscription lifecycle (signUp/activatePro/expireTrial) + gating helpers"
```

---

### Task 2: Schermo sign-up (`apps/account/signup.html` + `.ts`) + entry hub

**Files:**
- Create: `apps/account/signup.html`, `apps/account/signup.ts`
- Modify: `index.html` (entry "Prova gratis")
- Modify: `vite.config.ts` (entry `signup`)

**Interfaces:**
- Consumes: `signUp` (Task 1); `renderPublicTopbar`.

- [ ] **Step 1: HTML**

`apps/account/signup.html`:

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PlayFusion · Prova gratis</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-publicbar" id="topbar"></header>
  <main class="pf-container pf-container--narrow">
    <div class="pf-pagehead"><div class="pf-eyebrow">Inizia · nessuna carta richiesta</div><h1>Prova Playfusion gratis</h1></div>
    <p class="pf-muted">14 giorni di Pro, poi resti su Free — nessun blocco. Crea l'account e sei subito operativo.</p>
    <div class="pf-card"><form id="form">
      <div class="pf-field"><label>Nome e cognome</label><input name="name" required /></div>
      <div class="pf-field"><label>Email</label><input name="email" type="email" required /></div>
      <div class="pf-field"><label>Nome organizzazione</label><input name="orgName" required placeholder="Es. ASD Aurora" /></div>
      <button class="pf-btn pf-btn--primary pf-btn--lg" type="submit">Crea account e inizia</button>
    </form></div>
  </main>
  <script type="module" src="./signup.ts"></script>
</body>
</html>
```

- [ ] **Step 2: TS**

`apps/account/signup.ts`:

```ts
import { renderPublicTopbar } from '../../shared/chrome'
import { signUp } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
document.getElementById('form')!.addEventListener('submit', (ev) => {
  ev.preventDefault()
  const f = ev.target as HTMLFormElement
  const data = new FormData(f)
  const name = String(data.get('name')).trim()
  const email = String(data.get('email')).trim()
  const orgName = String(data.get('orgName')).trim()
  if (!name || !email.includes('@') || !orgName) return
  signUp({ name, email, orgName })
  location.href = '/apps/organizer/dashboard.html'
})
```

- [ ] **Step 3: Entry hub + Vite**

In `index.html`, dopo il `<p class="pf-muted">…localStorage).</p>` aggiungi una card in testa:

```html
    <div class="pf-card">
      <div class="pf-eyebrow">Nuovo cliente</div>
      <h2 style="margin:6px 0 4px">Prova gratis</h2>
      <p class="pf-muted">Registrati e ottieni un'organizzazione in prova Pro (14 giorni).</p>
      <a class="pf-btn pf-btn--primary" href="/apps/account/signup.html">Prova gratis →</a>
    </div>
```

In `vite.config.ts`, dentro `input: { ... }`:

```ts
        signup: r('apps/account/signup.html'),
```

- [ ] **Step 4: Build + typecheck + verifica**

Run: `npm run build` → OK. `npx tsc --noEmit` → OK.
Manuale: hub → "Prova gratis" → compila 3 campi → atterri sulla dashboard organizer della nuova org (vuota).

- [ ] **Step 5: Commit**

```bash
git add apps/account/signup.html apps/account/signup.ts index.html vite.config.ts
git commit -m "feat(ac): public sign-up page (3 fields, fake auth) + hub entry"
```

---

### Task 3: Schermo abbonamento (`apps/organizer/abbonamento.html` + `.ts`)

**Files:**
- Create: `apps/organizer/abbonamento.html`, `apps/organizer/abbonamento.ts`
- Modify: `vite.config.ts` (entry `abbonamento`)

**Interfaces:**
- Consumes: `renderOrganizerWorkspace`; `getCurrentOrgId`, `getSubscription`, `planOf`, `activatePro`, `getEvents` (per un event dell'org da passare allo shell), `getEvent`; `PLANS`/`planLabel`/`planPrice`.

- [ ] **Step 1: HTML**

`apps/organizer/abbonamento.html`:

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Abbonamento</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header id="shell"></header>
  <main class="pf-container">
    <div id="flash"></div>
    <div class="pf-pagehead"><div class="pf-eyebrow">Abbonamento</div><h1 id="title">Il tuo piano</h1></div>
    <div id="plans"></div>
  </main>
  <script type="module" src="./abbonamento.ts"></script>
</body>
</html>
```

- [ ] **Step 2: TS**

`apps/organizer/abbonamento.ts`:

```ts
import { renderOrganizerWorkspace } from '../../shared/chrome'
import { getCurrentOrgId, getSubscription, getEvents, getEvent, planOf, activatePro } from '../../shared/mock/store'
import { PLANS, planLabel } from '../../shared/mock/plans'

const orgId = getCurrentOrgId()
// The shell needs an event; use the org's first event if any, else a synthetic header-less fallback.
const anyEvent = getEvents().find(e => e.organizationId === orgId)
if (anyEvent) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(anyEvent, 'settings')

function render(): void {
  const sub = getSubscription(orgId)
  const cur = planOf(orgId)
  document.getElementById('title')!.textContent = `Il tuo piano · ${planLabel(cur)}${sub?.status === 'TRIAL' ? ' (in prova)' : ''}`
  document.getElementById('plans')!.innerHTML = PLANS.map(p => {
    const active = p.key === cur
    const feats = p.key === 'FREE' ? '1 evento attivo · funzioni base'
      : p.key === 'PRO' ? 'Eventi illimitati · portale pubblico · pagamenti quote'
      : 'Tutto Pro · supporto dedicato'
    const cta = active ? `<span class="pf-badge pf-badge--paid">Piano attuale</span>`
      : p.key === 'PRO' ? `<button class="pf-btn pf-btn--primary" id="buy-pro">Attiva Pro</button>`
      : p.key === 'BUSINESS' ? `<a class="pf-btn" href="#" onclick="return false">Contattaci</a>`
      : ''
    return `<div class="pf-card"${p.key === 'PRO' ? ' style="border-color:var(--color-action-primary)"' : ''}>
      <div class="pf-eyebrow">${planLabel(p.key)}${p.priceMonthly ? ` · €${p.priceMonthly}/mese` : ' · gratis'}</div>
      <p class="pf-muted">${feats}</p>${cta}</div>`
  }).join('')
  const buy = document.getElementById('buy-pro')
  if (buy) buy.addEventListener('click', () => {
    // Fake payment
    activatePro(orgId)
    document.getElementById('flash')!.innerHTML = `<div class="pf-flash">✓ Pro attivato — grazie!</div>`
    render()
  })
}
render()
```

- [ ] **Step 3: Vite entry**

In `vite.config.ts`, dopo `tabellone`:

```ts
        abbonamento: r('apps/organizer/abbonamento.html'),
```

- [ ] **Step 4: Build + typecheck + verifica**

Run: `npm run build` → OK. `npx tsc --noEmit` → OK.
Manuale: dopo sign-up, apri `/apps/organizer/abbonamento.html` → piano "Pro (in prova)"; "Attiva Pro" → flash + piano diventa Pro attivo.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer/abbonamento.html apps/organizer/abbonamento.ts vite.config.ts
git commit -m "feat(ac): subscription page (plan comparison + fake Attiva Pro)"
```

---

### Task 4: Banner abbonamento nello shell + scoping dashboard per org

**Files:**
- Modify: `shared/chrome.ts` (`renderOrganizerWorkspace`: banner)
- Modify: `shared/ui.css` (banner)
- Modify: `apps/organizer/dashboard.ts` (filtra per org di sessione)

**Interfaces:**
- Consumes: `getSubscription`, `trialDaysLeft` (Task 1); `getCurrentOrgId`.

- [ ] **Step 1: Banner nello shell**

In `shared/chrome.ts`, estendi l'import store:

```ts
import { getEventPhase, getSubscription, trialDaysLeft } from './mock/store'
```

In `renderOrganizerWorkspace`, prima del `return`, calcola il banner sulla base della subscription di `event.organizationId`:

```ts
  const sub = getSubscription(event.organizationId)
  let banner = ''
  if (sub?.status === 'TRIAL') banner = `<div class="pf-subbanner pf-subbanner--trial">✨ Pro in prova · <b>${trialDaysLeft(event.organizationId)} giorni</b> rimasti — <a href="/apps/organizer/abbonamento.html">Attiva Pro</a> · <a href="/apps/organizer/abbonamento.html?expire=1">Simula scadenza</a></div>`
  else if (sub?.plan === 'FREE') banner = `<div class="pf-subbanner pf-subbanner--free">Sei su Free — <a href="/apps/organizer/abbonamento.html">Passa a Pro</a></div>`
```

Inserisci `${banner}` nel markup ritornato, subito dopo la chiusura di `.pf-whero__inner` e prima di `<nav class="pf-wtabs">` (così sta tra hero e tab).

- [ ] **Step 2: "Simula scadenza" nell'abbonamento**

In `apps/organizer/abbonamento.ts`, subito dopo `const orgId = getCurrentOrgId()`, gestisci il query param (import `expireTrial`):

```ts
import { getCurrentOrgId, getSubscription, getEvents, getEvent, planOf, activatePro, expireTrial } from '../../shared/mock/store'
if (new URLSearchParams(location.search).get('expire') === '1') expireTrial(getCurrentOrgId())
```

- [ ] **Step 3: CSS banner**

In `shared/ui.css`, in fondo:

```css
.pf-subbanner { max-width: 960px; margin: 0 auto; padding: 8px var(--space-4); font-size: 13px; font-weight: 700; }
.pf-subbanner--trial { background: #eafaf1; color: var(--color-success); }
.pf-subbanner--free { background: #fef3e2; color: #b45309; }
.pf-subbanner a { color: inherit; }
```

- [ ] **Step 4: Scoping dashboard**

In `apps/organizer/dashboard.ts`, importa `getCurrentOrgId` e filtra:

```ts
import { getEvents, getRegistrations, getCurrentOrgId } from '../../shared/mock/store'
...
const orgId = getCurrentOrgId()
const events = getEvents().filter(e => e.organizationId === orgId)
```

(se `events` è vuoto, mostra un invito a creare il primo evento — aggiungi nel render: se `!events.length`, `#events`.innerHTML = `<div class="pf-card pf-muted">Nessun torneo. <a href="/apps/organizer/create-event.html">Crea il primo →</a></div>`.)

- [ ] **Step 5: Build + typecheck + verifica**

Run: `npm run build` → OK. `npx tsc --noEmit` → OK.
Manuale: org in prova → banner verde "N giorni"; "Simula scadenza" → banner arancione "Sei su Free"; org-1 (Pro/Active) → nessun banner; dashboard mostra solo gli eventi dell'org attiva.

- [ ] **Step 6: Commit**

```bash
git add shared/chrome.ts shared/ui.css apps/organizer/dashboard.ts
git commit -m "feat(ac): subscription banner in shell + per-org dashboard scoping"
```

---

### Task 5: Gating — cap eventi (create-event) + lock moduli (payments, avvisi)

**Files:**
- Modify: `apps/organizer/create-event.ts` (cap Free) — e adotta lo shell/topbar coerente
- Modify: `apps/organizer/payments.ts`, `apps/organizer/avvisi.ts` (lock modulo)

**Interfaces:**
- Consumes: `canCreateEvent`, `getCurrentOrgId`, `hasModule` (Task 1); `getEvent`.

- [ ] **Step 1: Cap eventi in create-event**

In `apps/organizer/create-event.ts`, importa `canCreateEvent, getCurrentOrgId`:

```ts
import { createEvent, canCreateEvent, getCurrentOrgId } from '../../shared/mock/store'
```

Nel submit handler, prima di `createEvent({...})`, blocca se non consentito:

```ts
  if (!canCreateEvent(getCurrentOrgId())) {
    alert('Il piano Free consente 1 solo evento attivo. Passa a Pro per crearne altri.')
    location.href = '/apps/organizer/abbonamento.html'
    return
  }
```

- [ ] **Step 2: Lock modulo in payments**

In `apps/organizer/payments.ts`, dopo aver ricavato `id`/`ev` e iniettato lo shell, se l'org dell'evento non ha `M-Payments` mostra il lock e fermati (import `hasModule`):

```ts
import { getCategories, getRegistrations, markPaid, getEvent, hasModule } from '../../shared/mock/store'
...
if (ev && !hasModule(ev.organizationId, 'M-Payments')) {
  document.querySelector('main')!.insertAdjacentHTML('beforeend',
    `<div class="pf-card"><h2>🔒 Riscossione quote — richiede Pro</h2><p class="pf-muted">Con il piano Free non puoi incassare le quote online.</p><a class="pf-btn pf-btn--primary" href="/apps/organizer/abbonamento.html">Passa a Pro</a></div>`)
} else {
  // ... il render esistente della pagina resta qui (racchiudilo in questo ramo)
}
```

(Nota: avvolgi il corpo esistente di `payments.ts` nel ramo `else` così su Free non gira.)

- [ ] **Step 3: Lock modulo in avvisi**

Stessa trasformazione in `apps/organizer/avvisi.ts` con `M-Broadcast`: import `hasModule`; se `ev && !hasModule(ev.organizationId, 'M-Broadcast')` mostra il lock ("🔒 Avvisi — richiede Pro", "Con il piano Free non puoi pubblicare avvisi al pubblico."), altrimenti il render esistente (avvolto in `else`). Nota: in `avvisi.ts` l'evento è `ev = getEvent(id)`.

- [ ] **Step 4: Build + typecheck + verifica**

Run: `npm run build` → OK. `npx tsc --noEmit` → OK. Run: `npm test` → tutti PASS.
Manuale: org su Free (dopo "Simula scadenza") → create-event blocca il 2º evento con redirect ad abbonamento; payments e avvisi mostrano il lock "richiede Pro". Attiva Pro → tutto sbloccato. org-1 (Pro) → nessun lock.

- [ ] **Step 5: Commit**

```bash
git add apps/organizer/create-event.ts apps/organizer/payments.ts apps/organizer/avvisi.ts
git commit -m "feat(ac): gating — Free event cap + M-Payments/M-Broadcast locks"
```

---

## Self-Review

**Spec coverage:**
- User/Session/subscription lifecycle + helpers → Task 1. ✓
- Sign-up page (3 fields, fake auth) + hub entry → Task 2. ✓
- Abbonamento page (Free/Pro/Business, Attiva Pro fake payment, Business placeholder) → Task 3. ✓
- Banner shell (TRIAL/FREE) + Simula scadenza + dashboard scoping → Task 4. ✓
- Gating: cap 1 evento attivo Free + lock M-Payments/M-Broadcast → Task 5. ✓
- Trial 14gg / degrade a Free / upgrade → Task 1 (signUp/expireTrial/activatePro). ✓
- Test account.test.ts + suite verde → Task 1. ✓
- Dominio D-O11-2 → registrato nello spec (Blueprint committato dall'utente, repo separato); nessun task di codice. ✓
- Fuori scope (Auth0/pagamento/inviti/prezzi reali) → non implementati. ✓

**Placeholder scan:** nessun TBD/TODO; ogni step ha codice o comando. Il ramo `else` di payments/avvisi (Task 5) è descritto esplicitamente (avvolgere il corpo esistente).

**Type consistency:** `User`/`Session` definiti in Task 1 e usati coerentemente; `signUp` ritorna `{user, organization}`; `getCurrentOrgId`/`planOf`/`hasModule`/`canCreateEvent`/`trialDaysLeft`/`activatePro`/`expireTrial` firme identiche tra definizione (Task 1) e consumi (Task 2-5); `renderOrganizerWorkspace(event, activeKey)` invariata (Task 4 aggiunge solo il banner interno); `PlanKey`/`SubStatus` riusati dallo store esistente.
