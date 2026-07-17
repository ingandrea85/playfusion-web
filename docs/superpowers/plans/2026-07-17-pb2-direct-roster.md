# PB-2 direct roster + Squadre editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a no-invite playbook (PB-2) where the organizer enters teams directly via a dedicated "Squadre" editor, chosen at event creation, without disturbing the existing invite flow (PB-1).

**Architecture:** A `playbook` field on the event switches the E1 hub and the public landing between invite (PB-1) and direct-roster (PB-2) behavior. Teams reuse `Registration`; direct entry creates `CONFIRMED` registrations via new `addTeam`/`updateTeam`/`removeTeam` store functions (remove also prunes the team's `GroupSlot`s). A new `teams.html` screen manages the roster.

**Tech Stack:** Vite MPA, vanilla TypeScript, Vitest + jsdom. Mock store in `shared/mock/`.

## Global Constraints

- No new dependencies; no framework.
- `TournamentEvent.playbook: 'PB-1' | 'PB-2'`, default `'PB-1'`.
- Direct-entered teams are `status: 'CONFIRMED'`, `paymentStatus: 'UNPAID'`.
- `removeTeam` deletes the registration AND every `GroupSlot` for that team in that event (matched by `eventId` + team name).
- PB-1 flow (registrations/inbox/payments/E3 enroll) stays unchanged; `evt-1` and all existing demo events are PB-1.
- Public landing hides the enroll CTA when the event is PB-2.
- Italian UI copy. No drag-and-drop.

---

### Task 1: `playbook` field + team store functions + PB-2 demo event

**Files:**
- Modify: `shared/mock/types.ts` (`TournamentEvent.playbook`)
- Modify: `shared/mock/store.ts` (`createEvent` playbook; add `addTeam`/`updateTeam`/`removeTeam`)
- Modify: `shared/mock/seed.ts` (evt-1 + `demoEvent` set `playbook: 'PB-1'`; add `evt-direct` PB-2 event)
- Modify: `shared/mock/store.test.ts`, `shared/mock/organizations.test.ts` (count assertions)
- Test: `shared/mock/teams.test.ts` (create)

**Interfaces:**
- Produces: `TournamentEvent.playbook: 'PB-1' | 'PB-2'`; `addTeam(eventId, categoryId, teamName, contacts?): Registration`; `updateTeam(regId, patch): void`; `removeTeam(regId): void`; `createEvent` input gains `playbook?: 'PB-1' | 'PB-2'`. New seed event `evt-direct` (category `evt-direct-cat`, 4 CONFIRMED teams).

- [ ] **Step 1: Write the failing test**

Create `shared/mock/teams.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getEvent, getRegistrations, getGroupSlots, addTeam, updateTeam, removeTeam, upsertCompetition, drawGroups } from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('direct roster (PB-2)', () => {
  it('evt-direct is a PB-2 event with four confirmed teams and no gironi', () => {
    expect(getEvent('evt-direct')?.playbook).toBe('PB-2')
    const regs = getRegistrations('evt-direct')
    expect(regs).toHaveLength(4)
    expect(regs.every(r => r.status === 'CONFIRMED')).toBe(true)
    expect(getGroupSlots('evt-direct')).toHaveLength(0)
  })

  it('addTeam appends a CONFIRMED team', () => {
    const t = addTeam('evt-direct', 'evt-direct-cat', 'Nuova ASD', { contactName: 'Mario Rossi' })
    expect(t.status).toBe('CONFIRMED')
    expect(t.contactName).toBe('Mario Rossi')
    expect(t.contactEmail).toBe('') // missing contact → empty string
    expect(getRegistrations('evt-direct')).toHaveLength(5)
  })

  it('updateTeam renames and can change category', () => {
    const r = getRegistrations('evt-direct')[0]
    updateTeam(r.id, { teamName: 'Rinominata', categoryId: 'evt-direct-cat' })
    expect(getRegistrations('evt-direct').find(x => x.id === r.id)?.teamName).toBe('Rinominata')
  })

  it('removeTeam deletes the registration and prunes its group slots', () => {
    // Give evt-direct a competition and draw gironi so its teams get group slots.
    upsertCompetition({ eventId: 'evt-direct', categoryId: 'evt-direct-cat', format: 'GROUPS_KNOCKOUT', legs: 'SINGLE', groupsCount: 1, qualifiersPerGroup: 2, finalsType: 'SINGLE_GROUP_CROSSOVER' })
    drawGroups('evt-direct', 'evt-direct-cat')
    const r = getRegistrations('evt-direct')[0]
    expect(getGroupSlots('evt-direct').some(s => s.team === r.teamName)).toBe(true) // slot exists after draw
    removeTeam(r.id)
    expect(getRegistrations('evt-direct').some(x => x.id === r.id)).toBe(false)
    expect(getGroupSlots('evt-direct').some(s => s.team === r.teamName)).toBe(false) // pruned
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- teams`
Expected: FAIL — `addTeam` undefined / `evt-direct` not seeded.

- [ ] **Step 3: Add the `playbook` field**

In `shared/mock/types.ts`, add to `TournamentEvent` (after `tieBreak`):

```ts
  playbook: 'PB-1' | 'PB-2'
```

- [ ] **Step 4: `createEvent` playbook + team functions**

In `shared/mock/store.ts`, update `createEvent`'s input type and the built event. The input type gains `playbook?: 'PB-1' | 'PB-2'`; the event literal gains `playbook: input.playbook ?? 'PB-1',` (keep the existing `tieBreak` line). 

Then add, near `addRegistration`:

```ts
export function addTeam(eventId: string, categoryId: string, teamName: string, contacts?: { contactName?: string; contactPhone?: string; contactEmail?: string }): Registration {
  const state = load()
  const reg: Registration = {
    id: `reg-${state.registrations.length + 1}`, eventId, categoryId, teamName,
    contactName: contacts?.contactName ?? '', contactPhone: contacts?.contactPhone ?? '', contactEmail: contacts?.contactEmail ?? '',
    status: 'CONFIRMED', paymentStatus: 'UNPAID', createdAt: new Date().toISOString(),
  }
  state.registrations.push(reg); save(state); return reg
}
export function updateTeam(regId: string, patch: { teamName?: string; categoryId?: string; contactName?: string; contactPhone?: string; contactEmail?: string }): void {
  const state = load()
  const r = state.registrations.find(x => x.id === regId); if (r) Object.assign(r, patch)
  save(state)
}
export function removeTeam(regId: string): void {
  const state = load()
  const r = state.registrations.find(x => x.id === regId)
  if (!r) { save(state); return }
  state.registrations = state.registrations.filter(x => x.id !== regId)
  state.groupSlots = state.groupSlots.filter(s => !(s.eventId === r.eventId && s.team === r.teamName))
  save(state)
}
```

- [ ] **Step 5: Give existing events a playbook + add `evt-direct`**

In `shared/mock/seed.ts`:
- evt-1 literal: add `playbook: 'PB-1',` (next to `tieBreak`).
- In `demoEvent`, the `event` literal (has `registrationsOpen: false, tieBreak: [...]`): add `playbook: 'PB-1',`.
- In `buildSeed`, AFTER the DEMOS append+hydrate loop and BEFORE `return state`, add the direct-roster demo:

```ts
  state.events.push({
    id: 'evt-direct', organizationId: 'org-1', name: 'Demo · Iscrizione diretta', sport: 'Calcio',
    location: 'Palasport Comunale', startDate: '2026-09-05', startTime: '09:00', endDate: '2026-09-05',
    template: 'PB-1', playbook: 'PB-2', registrationsOpen: false,
    tieBreak: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
  })
  state.categories.push({ id: 'evt-direct-cat', eventId: 'evt-direct', name: 'Open', maxTeams: 8 })
  ;['Tigri Rosse', 'Falchi Blu', 'Leoni Verdi', 'Aquile Nere'].forEach((t, i) => state.registrations.push({
    id: `reg-direct-${i + 1}`, eventId: 'evt-direct', categoryId: 'evt-direct-cat', teamName: t,
    contactName: '', contactPhone: '', contactEmail: '', status: 'CONFIRMED', paymentStatus: 'UNPAID',
    createdAt: '2026-08-01T09:00:00.000Z',
  }))
```

- [ ] **Step 6: Update count assertions**

Adding `evt-direct` grows the seed by 1 event and 1 category. Run the suite and update the exact-count assertions it flags:
- `shared/mock/store.test.ts`: events total `7 → 8`; `createEvent` count `8 → 9` (id still `evt-2`); `addCategory` id `cat-10 → cat-11` (10 seed categories now). Leave evt-1's own `getCategories`(3)/`getRegistrations`(12) unchanged.
- `shared/mock/organizations.test.ts`: org-1 events `7 → 8`.

- [ ] **Step 7: Run tests + tsc**

Run: `npm test && npx tsc --noEmit`
Expected: `teams` 4 tests PASS; full suite PASS; tsc clean. Fix any remaining count assertion the run flags.

- [ ] **Step 8: Commit**

```bash
git add shared/mock/types.ts shared/mock/store.ts shared/mock/seed.ts shared/mock/teams.test.ts shared/mock/store.test.ts shared/mock/organizations.test.ts
git commit -m "feat(pb2): event.playbook + addTeam/updateTeam/removeTeam + evt-direct demo"
```

---

### Task 2: Squadre screen (`teams.html` + `teams.ts`)

**Files:**
- Create: `apps/organizer/teams.html`
- Create: `apps/organizer/teams.ts`
- Modify: `vite.config.ts` (add the `teams` input)
- Modify: `shared/ui.css` (team-row styles)

**Interfaces:**
- Consumes: `getEvent`, `getCategories`, `getRegistrations`, `addTeam`, `updateTeam`, `removeTeam` from store.

- [ ] **Step 1: Register the page in Vite**

In `vite.config.ts`, add to the `input` map (next to `gironi`):

```ts
        teams: r('apps/organizer/teams.html'),
```

- [ ] **Step 2: Create `apps/organizer/teams.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Organizer · Squadre</title>
  <link rel="stylesheet" href="/shared/tokens.css" /><link rel="stylesheet" href="/shared/ui.css" />
</head>
<body>
  <header class="pf-topbar" id="topbar"></header>
  <main class="pf-container">
    <a class="pf-back" id="back" href="#">← Torna all'evento</a>
    <div class="pf-pagehead"><div class="pf-eyebrow">Roster</div><h1 id="title">Squadre</h1></div>
    <div id="teamedit"></div>
    <div class="pf-card"><h2>Aggiungi squadra</h2><div id="addform"></div></div>
    <div id="teams"></div>
  </main>
  <script type="module" src="./teams.ts"></script>
</body>
</html>
```

- [ ] **Step 3: Create `apps/organizer/teams.ts`**

```ts
import { renderOrganizerTopbar } from '../../shared/chrome'
import { getEvent, getCategories, getRegistrations, addTeam, updateTeam, removeTeam } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

const cats = () => getCategories(id)

function renderAdd(): void {
  const opts = cats().map(c => `<option value="${c.id}">${c.name}</option>`).join('')
  document.getElementById('addform')!.innerHTML = `
    <div class="pf-row" style="gap:var(--space-3)">
      <div class="pf-field" style="width:160px;margin-bottom:0"><label>Categoria</label><select id="t-cat">${opts}</select></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Nome squadra</label><input id="t-name" placeholder="Es. ASD Aurora" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Referente (opz.)</label><input id="t-ref" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Telefono (opz.)</label><input id="t-phone" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Email (opz.)</label><input id="t-email" /></div>
    </div>
    <button class="pf-btn pf-btn--primary" id="t-add">Aggiungi squadra</button>`
  document.getElementById('t-add')!.addEventListener('click', () => {
    const name = (document.getElementById('t-name') as HTMLInputElement).value.trim()
    if (!name) return
    addTeam(id, (document.getElementById('t-cat') as HTMLSelectElement).value, name, {
      contactName: (document.getElementById('t-ref') as HTMLInputElement).value.trim(),
      contactPhone: (document.getElementById('t-phone') as HTMLInputElement).value.trim(),
      contactEmail: (document.getElementById('t-email') as HTMLInputElement).value.trim(),
    })
    render()
  })
}

function openEdit(regId: string): void {
  const r = getRegistrations(id).find(x => x.id === regId); if (!r) return
  const opts = cats().map(c => `<option value="${c.id}" ${c.id === r.categoryId ? 'selected' : ''}>${c.name}</option>`).join('')
  const panel = document.getElementById('teamedit')!
  panel.innerHTML = `<div class="pf-card"><h2>Modifica squadra</h2>
    <div class="pf-row" style="gap:var(--space-3)">
      <div class="pf-field" style="width:160px;margin-bottom:0"><label>Categoria</label><select id="e-cat">${opts}</select></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Nome</label><input id="e-name" value="${r.teamName}" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Referente</label><input id="e-ref" value="${r.contactName}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Telefono</label><input id="e-phone" value="${r.contactPhone}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Email</label><input id="e-email" value="${r.contactEmail}" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="e-save">Salva</button><button class="pf-btn" id="e-cancel">Annulla</button></div>
  </div>`
  document.getElementById('e-save')!.addEventListener('click', () => {
    updateTeam(regId, {
      teamName: (document.getElementById('e-name') as HTMLInputElement).value.trim(),
      categoryId: (document.getElementById('e-cat') as HTMLSelectElement).value,
      contactName: (document.getElementById('e-ref') as HTMLInputElement).value.trim(),
      contactPhone: (document.getElementById('e-phone') as HTMLInputElement).value.trim(),
      contactEmail: (document.getElementById('e-email') as HTMLInputElement).value.trim(),
    })
    panel.innerHTML = ''; render()
  })
  document.getElementById('e-cancel')!.addEventListener('click', () => { panel.innerHTML = '' })
}

function render(): void {
  document.getElementById('title')!.textContent = `Squadre · ${getEvent(id)?.name ?? ''}`
  renderAdd()
  const regs = getRegistrations(id)
  const el = document.getElementById('teams')!
  if (!regs.length) { el.innerHTML = `<p class="pf-muted">Nessuna squadra inserita.</p>`; return }
  el.innerHTML = cats().map(c => {
    const rs = regs.filter(r => r.categoryId === c.id)
    if (!rs.length) return ''
    const rows = rs.map(r => `<li class="pf-teamrow">
      <span class="pf-teamrow__name">${r.teamName}</span>
      <span class="pf-mono">${[r.contactName, r.contactPhone, r.contactEmail].filter(Boolean).join(' · ') || '—'}</span>
      <span class="pf-teamrow__act"><button class="pf-btn pf-btn--ghost" data-edit="${r.id}">Modifica</button><button class="pf-btn pf-btn--ghost" data-del="${r.id}">Rimuovi</button></span>
    </li>`).join('')
    return `<div class="pf-card"><div class="pf-cat__label" style="margin-bottom:var(--space-3)">${c.name}</div><ul class="pf-teamlist">${rows}</ul></div>`
  }).join('')
  el.querySelectorAll<HTMLButtonElement>('button[data-edit]').forEach(b => b.addEventListener('click', () => openEdit(b.dataset.edit!)))
  el.querySelectorAll<HTMLButtonElement>('button[data-del]').forEach(b => b.addEventListener('click', () => { if (confirm('Rimuovere la squadra?')) { removeTeam(b.dataset.del!); render() } }))
}

render()
```

- [ ] **Step 4: Team-row CSS**

Append to `shared/ui.css`:

```css
.pf-teamlist { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.pf-teamrow { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; padding: 8px 10px; border: 1px solid var(--color-border); border-radius: 8px; }
.pf-teamrow__name { font-weight: 700; }
.pf-teamrow__act { margin-left: auto; display: inline-flex; gap: 4px; }
```

- [ ] **Step 5: Build + tsc**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: build includes `teams.html`, tsc clean, full suite still green.

- [ ] **Step 6: Commit**

```bash
git add apps/organizer/teams.html apps/organizer/teams.ts vite.config.ts shared/ui.css
git commit -m "feat(pb2): Squadre roster editor (add/edit/remove teams)"
```

---

### Task 3: Playbook chooser in create-event + hub gating + dashboard label

**Files:**
- Modify: `apps/organizer/create-event.html` (Template → Playbook select)
- Modify: `apps/organizer/create-event.ts` (pass `playbook`)
- Modify: `apps/organizer/event-hub.ts` (per-playbook steps)
- Modify: `apps/organizer/dashboard.ts` (show playbook on the card)

**Interfaces:** Consumes `TournamentEvent.playbook`.

- [ ] **Step 1: Playbook select in create-event.html**

In `apps/organizer/create-event.html`, replace the Template field (lines 13-14) with:

```html
      <div class="pf-field"><label>Playbook</label>
        <select name="playbook">
          <option value="PB-1">PB-1 · Iscrizione con inviti</option>
          <option value="PB-2">PB-2 · Inserimento diretto squadre</option>
        </select></div>
```

- [ ] **Step 2: Pass `playbook` in create-event.ts**

In `apps/organizer/create-event.ts`, in the `createEvent({ ... })` call, add:

```ts
    playbook: (data.get('playbook') as 'PB-1' | 'PB-2') ?? 'PB-1',
```

- [ ] **Step 3: Per-playbook hub steps**

In `apps/organizer/event-hub.ts`, replace the three registration steps (the `Apri iscrizioni` / `Conferma squadre` / `Riscuoti quote` entries) with a playbook-conditional block. Change the `steps` array construction so those three entries are produced by a helper:

```ts
const pb2 = event?.playbook === 'PB-2'
const rosterSteps: Step[] = pb2
  ? [{ label: 'Inserisci squadre', href: `/apps/organizer/teams.html?event=${id}`, done: regs.some(r => r.status === 'CONFIRMED') }]
  : [
      { label: 'Apri iscrizioni', href: `/apps/organizer/registrations.html?event=${id}`, done: !!event?.registrationsOpen },
      { label: 'Conferma squadre', href: `/apps/organizer/inbox.html?event=${id}`, done: regs.some(r => r.status === 'CONFIRMED') },
      { label: 'Riscuoti quote', href: `/apps/organizer/payments.html?event=${id}`, done: anyPaid },
    ]
```

and build `steps` as:

```ts
const steps: Step[] = [
  { label: 'Crea evento da template', done: !!event },
  { label: 'Configura categorie', href: `/apps/organizer/categories.html?event=${id}`, done: true },
  ...rosterSteps,
  { label: 'Configura competizione', href: `/apps/organizer/competition.html?event=${id}`, done: competitionConfigured },
  { label: 'Componi gironi', href: `/apps/organizer/gironi.html?event=${id}`, done: gironiComposed },
  { label: 'Genera calendario', href: `/apps/organizer/schedule.html?event=${id}`, done: schedStatus !== 'NONE' },
  { label: 'Approva calendario', href: `/apps/organizer/schedule.html?event=${id}`, done: schedStatus === 'APPROVED' || schedStatus === 'PUBLISHED' },
  { label: 'Pubblica evento', href: `/apps/organizer/schedule.html?event=${id}`, done: schedStatus === 'PUBLISHED' },
]
```

- [ ] **Step 4: Show playbook on the dashboard card**

In `apps/organizer/dashboard.ts`, the card eyebrow `${e.sport} · ${e.template}` becomes:

```ts
    <div class="pf-eyebrow">${e.sport} · ${e.playbook}</div>
```

- [ ] **Step 5: Build + tsc + test**

Run: `npm run build && npx tsc --noEmit && npm test`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add apps/organizer/create-event.html apps/organizer/create-event.ts apps/organizer/event-hub.ts apps/organizer/dashboard.ts
git commit -m "feat(pb2): playbook chooser in create-event; hub + dashboard reflect playbook"
```

---

### Task 4: Public landing gating + docs

**Files:**
- Modify: `apps/public/landing.ts` (hide enroll CTA / adjust eyebrow for PB-2)
- Modify: `README.md`

**Interfaces:** none.

- [ ] **Step 1: Gate the public landing**

In `apps/public/landing.ts`:
- Add after `const event = getEvent(id)`:
  ```ts
  const direct = event?.playbook === 'PB-2'
  ```
- Change the eyebrow line so PB-2 does not advertise invite registration:
  ```ts
  document.getElementById('eyebrow')!.textContent =
    event ? (direct ? event.sport : `${event.sport} · Iscrizioni ${open ? 'aperte' : 'chiuse'}`) : 'Evento'
  ```
- In the `cta` innerHTML, replace the enroll block so PB-2 shows no enroll link:
  ```ts
    ${direct
      ? `<p class="pf-muted">Iscrizioni gestite dall'organizzatore.</p>`
      : (open
        ? `<a class="pf-btn pf-btn--primary pf-btn--lg" href="/apps/public/enroll.html?event=${id}">Iscrivi la squadra</a>`
        : `<p class="pf-muted">Le iscrizioni sono chiuse.</p>`)}
  ```
  (Keep the published calendar/standings/bracket links block unchanged.)

- [ ] **Step 2: Update the README**

In `README.md`, extend the E3 scope bullet (or add one under E1). Add a bullet:

```md
- **Playbooks** — events are created with a playbook: **PB-1** (invite enrollment, the default: open registrations → shareable link → team enrolls in E3 → confirm) or **PB-2** (direct roster: the organizer enters teams in the E1 **Squadre** editor; no invites/link, teams are confirmed on entry). A demo event "Iscrizione diretta" shows PB-2.
```

- [ ] **Step 3: Full verification**

Run: `npm test && npm run build && npx tsc --noEmit`
Expected: all tests PASS, build OK, tsc clean.

- [ ] **Step 4: Commit**

```bash
git add apps/public/landing.ts README.md
git commit -m "feat(pb2): public landing hides enroll for direct-roster events; docs"
```

---

## Self-Review

**Spec coverage:**
- `event.playbook` + createEvent — Task 1/3. ✔
- `addTeam`/`updateTeam`/`removeTeam` (+ GroupSlot prune) — Task 1. ✔
- Squadre screen — Task 2. ✔
- create-event playbook chooser — Task 3. ✔
- Hub gating (PB-2 → "Inserisci squadre") — Task 3. ✔
- Public landing hides enroll for PB-2 — Task 4. ✔
- `evt-direct` demo — Task 1. ✔
- Success criteria 1-4 — Tasks 1,2,3,4. ✔

**Placeholder scan:** none — all steps carry concrete code.

**Type consistency:** `TournamentEvent.playbook: 'PB-1' | 'PB-2'` set in seed (evt-1, demoEvent, evt-direct), createEvent, and read in event-hub/dashboard/landing. `addTeam(eventId, categoryId, teamName, contacts?)` returns `Registration`; `updateTeam(regId, patch)` / `removeTeam(regId)` used consistently by teams.ts and tests. `createEvent` still yields `evt-2` (numeric-max id unaffected by non-numeric `evt-direct`/`reg-direct-*` ids). New page registered in `vite.config.ts` so `npm run build` emits it.

**Note:** `evt-direct` seeds registrations directly (not via `addTeam`) so the fixture is deterministic; `addTeam`'s `reg-${length+1}` id (used only at runtime) does not collide with the non-numeric `reg-direct-*` seed ids. `removeTeam`'s GroupSlot prune is keyed by event+team name, matching how `GroupSlot` stores the team; the roster demo starts with no gironi, and the prune test first upserts a competition + `drawGroups` so real slots exist, asserts one exists, then asserts it is gone after `removeTeam` (genuinely exercises the prune path).
