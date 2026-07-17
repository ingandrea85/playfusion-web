# E4 Admin — tenant monitoring (A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the E4 Admin back-office: an Organizations list + detail (status, module activation, events count) with suspend/reactivate and module toggles.

**Architecture:** Introduce an `Organization` entity + `TournamentEvent.organizationId` in the mock store, seeded with 4 orgs. A new `apps/admin/` area (list + detail) with an admin top bar consumes O1 store ops. E1/E3 unaffected (other orgs have no real events). No framework.

**Tech Stack:** Vite MPA, vanilla TypeScript, Vitest + jsdom, plain HTML/CSS.

## Global Constraints

- **No framework**; vanilla TS/HTML/CSS; no backend/network; deterministic.
- **M-Core is always active** (not deactivatable).
- **Do not disturb E1/E3**: `organizationId` is additive; other orgs seed 0 real events.
- **Reuse Matchday classes** (`.pf-badge`, `.pf-chip`, `.pf-card`, `.pf-switch`, `.pf-pagehead`); no hardcoded hex in screens.
- Module keys: `M-Core`, `M-Compete`, `M-Broadcast`, `M-Payments`, `M-Billing`.

---

## File Structure

```
shared/mock/types.ts        # + OrgStatus, Organization; TournamentEvent + organizationId; State + organizations
shared/mock/seed.ts         # evt-1.organizationId; + organizations[4]
shared/mock/store.ts        # createEvent sets organizationId; + getOrganizations/getOrganization/setOrgStatus/setOrgModule
shared/mock/organizations.test.ts  # NEW
shared/chrome.ts            # + renderAdminTopbar
apps/admin/organizations.html/.ts  # NEW list
apps/admin/organization.html/.ts   # NEW detail
index.html                  # + E4 Admin card
vite.config.ts              # + organizations + organization inputs
```

---

### Task 1: Organization model + store ops (TDD)

**Files:**
- Modify: `shared/mock/types.ts`, `shared/mock/seed.ts`, `shared/mock/store.ts`
- Test: `shared/mock/organizations.test.ts` (new)

**Interfaces:**
- Produces:
  - `type OrgStatus = 'ACTIVE' | 'SUSPENDED'`
  - `interface Organization { id: string; name: string; status: OrgStatus; modules: string[] }`
  - `TournamentEvent.organizationId: string`; `State.organizations: Organization[]`
  - `getOrganizations()`, `getOrganization(id)`, `setOrgStatus(id, status)`, `setOrgModule(id, moduleKey, active)`

- [ ] **Step 1: Add types in `shared/mock/types.ts`**

Add `organizationId: string` to `TournamentEvent` (after `id`). Append:

```ts
export type OrgStatus = 'ACTIVE' | 'SUSPENDED'
export interface Organization {
  id: string
  name: string
  status: OrgStatus
  modules: string[]
}
```

Extend `State` with `organizations: Organization[]`.

- [ ] **Step 2: Seed in `shared/mock/seed.ts`**

Add `organizationId: 'org-1',` to the `evt-1` event object. After `groupSlots: [],` add:

```ts
    organizations: [
      { id: 'org-1', name: 'ASD Memorial Rivalta', status: 'ACTIVE', modules: ['M-Core', 'M-Compete', 'M-Broadcast', 'M-Payments'] },
      { id: 'org-2', name: 'Polisportiva Chierese', status: 'ACTIVE', modules: ['M-Core', 'M-Compete'] },
      { id: 'org-3', name: 'US Basse Valle', status: 'SUSPENDED', modules: ['M-Core', 'M-Compete', 'M-Broadcast'] },
      { id: 'org-4', name: 'GS Collina Padel', status: 'ACTIVE', modules: ['M-Core', 'M-Compete', 'M-Payments', 'M-Billing'] },
    ],
```

- [ ] **Step 3: Write the failing test `shared/mock/organizations.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getOrganizations, getOrganization, setOrgStatus, setOrgModule, getEvents } from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('organizations', () => {
  it('seeds four organizations with statuses and modules', () => {
    expect(getOrganizations()).toHaveLength(4)
    expect(getOrganization('org-3')?.status).toBe('SUSPENDED')
    expect(getOrganization('org-1')?.modules).toContain('M-Payments')
  })

  it('setOrgStatus toggles the tenant status', () => {
    setOrgStatus('org-3', 'ACTIVE')
    expect(getOrganization('org-3')?.status).toBe('ACTIVE')
  })

  it('setOrgModule adds/removes a module but never touches M-Core', () => {
    setOrgModule('org-2', 'M-Broadcast', true)
    expect(getOrganization('org-2')?.modules).toContain('M-Broadcast')
    setOrgModule('org-2', 'M-Broadcast', false)
    expect(getOrganization('org-2')?.modules).not.toContain('M-Broadcast')
    setOrgModule('org-2', 'M-Core', false)
    expect(getOrganization('org-2')?.modules).toContain('M-Core')
  })

  it('the seed event belongs to org-1 (others have no events)', () => {
    expect(getEvents().filter(e => e.organizationId === 'org-1')).toHaveLength(1)
    expect(getEvents().filter(e => e.organizationId === 'org-2')).toHaveLength(0)
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd playfusion-web && npx vitest run shared/mock/organizations.test.ts`
Expected: FAIL — org functions not exported.

- [ ] **Step 5: Update `shared/mock/store.ts`**

Add `Organization`, `OrgStatus` to the type import. In `createEvent`, add `organizationId: 'org-1',` to the constructed `event` object. Append the ops at the end:

```ts
export function getOrganizations(): Organization[] { return load().organizations }
export function getOrganization(id: string): Organization | undefined { return load().organizations.find(o => o.id === id) }
export function setOrgStatus(id: string, status: OrgStatus): void {
  const state = load()
  const o = state.organizations.find(x => x.id === id); if (o) o.status = status
  save(state)
}
export function setOrgModule(id: string, moduleKey: string, active: boolean): void {
  const state = load()
  const o = state.organizations.find(x => x.id === id)
  if (!o || moduleKey === 'M-Core') { save(state); return }
  if (active) { if (!o.modules.includes(moduleKey)) o.modules.push(moduleKey) }
  else o.modules = o.modules.filter(m => m !== moduleKey)
  save(state)
}
```

- [ ] **Step 6: Run the full suite**

Run: `cd playfusion-web && npm test`
Expected: PASS — 35 tests green (existing 31 + 4 new organizations tests).

- [ ] **Step 7: Commit**

```bash
cd playfusion-web
git add shared/mock/types.ts shared/mock/seed.ts shared/mock/store.ts shared/mock/organizations.test.ts
git commit -m "feat: Organization model + tenant store ops (O1); event.organizationId"
```

---

### Task 2: E4 Admin app (list + detail) + admin bar + hub card

**Files:**
- Modify: `shared/chrome.ts`, `index.html`, `vite.config.ts`
- Create: `apps/admin/organizations.html`, `apps/admin/organizations.ts`, `apps/admin/organization.html`, `apps/admin/organization.ts`

**Interfaces:**
- Consumes: `getOrganizations`, `getOrganization`, `setOrgStatus`, `setOrgModule`, `getEvents` (store); `renderAdminTopbar`.

- [ ] **Step 1: Add `renderAdminTopbar` to `shared/chrome.ts`**

Append:

```ts
export function renderAdminTopbar(): string {
  return `<a class="pf-brand" href="/apps/admin/organizations.html">play<b>fusion</b><small>Admin</small></a>
    <nav>
      <a href="/apps/admin/organizations.html" aria-current="page">Organizzazioni</a>
      <a href="/index.html">Esci demo</a>
    </nav>`
}
```

- [ ] **Step 2: Register the two pages in `vite.config.ts`**

After the `bracket` entry add:

```ts
        adminOrgs: r('apps/admin/organizations.html'),
        adminOrg: r('apps/admin/organization.html'),
```

- [ ] **Step 3: Create `apps/admin/organizations.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PlayFusion · Admin · Organizzazioni</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-topbar" id="topbar"></header>
  <main class="pf-container">
    <div class="pf-pagehead"><div class="pf-eyebrow">Back-office · Tenant</div><h1>Organizzazioni</h1></div>
    <div id="list" class="pf-stack"></div>
  </main>
  <script type="module" src="./organizations.ts"></script>
</body>
</html>
```

- [ ] **Step 4: Create `apps/admin/organizations.ts`**

```ts
import { renderAdminTopbar } from '../../shared/chrome'
import { getOrganizations, getEvents } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderAdminTopbar()

const MODULE_LABELS: Record<string, string> = { 'M-Core': 'Core', 'M-Compete': 'Compete', 'M-Broadcast': 'Broadcast', 'M-Payments': 'Payments', 'M-Billing': 'Billing' }
const statusBadge = (s: string) => s === 'ACTIVE'
  ? `<span class="pf-badge pf-badge--paid">Attiva</span>`
  : `<span class="pf-badge pf-badge--unpaid">Sospesa</span>`

document.getElementById('list')!.innerHTML = getOrganizations().map(o => {
  const events = getEvents().filter(e => e.organizationId === o.id).length
  const chips = o.modules.map(m => `<li class="pf-chip">${MODULE_LABELS[m] ?? m}</li>`).join('')
  return `<a class="pf-card pf-card--link" style="display:block;text-decoration:none;color:inherit" href="/apps/admin/organization.html?org=${o.id}">
    <div class="pf-row"><h2 style="margin:0">${o.name}</h2>${statusBadge(o.status)}</div>
    <ul class="pf-chips" style="margin:var(--space-3) 0">${chips}</ul>
    <div class="pf-mono">${events} ${events === 1 ? 'evento' : 'eventi'}</div>
  </a>`
}).join('')
```

- [ ] **Step 5: Create `apps/admin/organization.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PlayFusion · Admin · Organizzazione</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-topbar" id="topbar"></header>
  <main class="pf-container pf-container--narrow">
    <a class="pf-back" href="/apps/admin/organizations.html">← Tutte le organizzazioni</a>
    <div id="content"></div>
  </main>
  <script type="module" src="./organization.ts"></script>
</body>
</html>
```

- [ ] **Step 6: Create `apps/admin/organization.ts`**

```ts
import { renderAdminTopbar } from '../../shared/chrome'
import { getOrganization, getEvents, setOrgStatus, setOrgModule } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderAdminTopbar()
const id = new URLSearchParams(location.search).get('org') ?? 'org-1'

const MODULES: Array<{ key: string; label: string }> = [
  { key: 'M-Core', label: 'Core' }, { key: 'M-Compete', label: 'Compete' }, { key: 'M-Broadcast', label: 'Broadcast' },
  { key: 'M-Payments', label: 'Payments' }, { key: 'M-Billing', label: 'Billing' },
]

function render(): void {
  const o = getOrganization(id)
  const content = document.getElementById('content')!
  if (!o) { content.innerHTML = `<div class="pf-card pf-muted">Organizzazione non trovata.</div>`; return }
  const active = o.status === 'ACTIVE'
  const events = getEvents().filter(e => e.organizationId === o.id).length
  content.innerHTML = `
    <div class="pf-pagehead"><div class="pf-eyebrow">Tenant</div><h1>${o.name}</h1></div>
    <div class="pf-card">
      <div class="pf-row">
        <span class="pf-badge pf-badge--${active ? 'paid' : 'unpaid'}">${active ? 'Attiva' : 'Sospesa'}</span>
        <button class="pf-btn pf-btn--primary" id="togglestatus">${active ? 'Sospendi' : 'Riattiva'}</button>
      </div>
      <p class="pf-mono" style="margin-top:var(--space-3)">${events} ${events === 1 ? 'evento' : 'eventi'}</p>
    </div>
    <div class="pf-card">
      <h2>Moduli</h2>
      ${MODULES.map(m => `<label class="pf-switch" style="display:flex;margin:var(--space-2) 0">
        <input type="checkbox" class="js-mod" data-key="${m.key}" ${o.modules.includes(m.key) ? 'checked' : ''} ${m.key === 'M-Core' ? 'disabled' : ''} /> ${m.label}${m.key === 'M-Core' ? ' (sempre attivo)' : ''}
      </label>`).join('')}
    </div>`
  document.getElementById('togglestatus')!.addEventListener('click', () => { setOrgStatus(id, active ? 'SUSPENDED' : 'ACTIVE'); render() })
  document.querySelectorAll<HTMLInputElement>('.js-mod').forEach(cb =>
    cb.addEventListener('change', () => { setOrgModule(id, cb.dataset.key!, cb.checked); render() }))
}
render()
```

- [ ] **Step 7: Add the E4 card to `index.html`**

After the E3 public card, add:

```html
    <div class="pf-card">
      <div class="pf-eyebrow">E4 · Desktop</div>
      <h2 style="margin:6px 0 4px">Admin</h2>
      <p class="pf-muted">Back-office Playfusion: monitora le organizzazioni (tenant) e i loro moduli.</p>
      <a class="pf-btn pf-btn--primary" href="/apps/admin/organizations.html">Apri Admin</a>
    </div>
```

- [ ] **Step 8: Verify build + behaviour**

Run: `cd playfusion-web && npm run build`
Expected: succeeds (`adminOrgs`/`adminOrg` entries present); `npm test` green (35).

`npm run dev`: hub → "Apri Admin" → four organizations with status badges, module chips, event counts; open one → toggle status (Sospendi/Riattiva) and module checkboxes persist; M-Core is disabled/checked.

- [ ] **Step 9: Commit**

```bash
cd playfusion-web
git add shared/chrome.ts index.html vite.config.ts apps/admin/organizations.html apps/admin/organizations.ts apps/admin/organization.html apps/admin/organization.ts
git commit -m "feat: E4 Admin — organizations list + detail (status, modules) + hub card"
```

---

### Task 3: End-to-end verification + README

**Files:** `README.md`

- [ ] **Step 1: Full suite + build**

Run: `cd playfusion-web && npm test && npm run build`
Expected: 35 tests pass; build succeeds.

- [ ] **Step 2: Manual walkthrough (acceptance)**

`npm run dev`: hub → Apri Admin → list shows 4 orgs (org-3 "Sospesa"); open org-3 → Riattiva → status flips to Attiva; open org-2 → tick "Broadcast" → chip appears on the list; M-Core cannot be unticked. Confirm the E1 organizer dashboard still shows just the one Memorial event.
Expected: spec success criteria 1–4.

- [ ] **Step 3: Update `README.md`**

Under `## Scope`, add:

```markdown
- **E4 Admin** (`apps/admin/`) — Playfusion back-office: organizations (tenants) list + detail with status (suspend/reactivate) and module activation (O1). Introduces multi-tenancy (`Organization`, `event.organizationId`).
```

- [ ] **Step 4: Commit**

```bash
cd playfusion-web
git add README.md
git commit -m "docs: note E4 Admin in README"
```

---

## Self-Review

**1. Spec coverage:**
- `Organization` + `OrgStatus` + `State.organizations` + `TournamentEvent.organizationId` + seed(4) → Task 1. ✓
- Store ops (get/getOne/setStatus/setModule, M-Core no-op) → Task 1 + tests. ✓
- Admin app list + detail + admin bar + hub card + vite inputs → Task 2. ✓
- Suspend/reactivate + module toggles persist; M-Core disabled → Task 2 (detail). ✓
- E1/E3 unaffected (other orgs 0 events; createEvent defaults org-1) → Task 1 test + no E1/E3 edits. ✓
- Success criteria 1–4 → Task 3. ✓
- No new Blueprint decision (implements O1) → none. ✓

**2. Placeholder scan:** No TBD/TODO; full code in every step.

**3. Type consistency:** `Organization`/`OrgStatus` identical across types, seed, store, screens, tests. `setOrgStatus(id, status)`/`setOrgModule(id, moduleKey, active)`/`getOrganizations`/`getOrganization` names consistent across store, tests, and both screens. `event.organizationId` set in seed + createEvent, read in both admin screens' event-count filter. Module keys (`M-Core`…`M-Billing`) consistent between seed, `setOrgModule` guard, and the screens' MODULE lists. `renderAdminTopbar()` used by both admin screens.
