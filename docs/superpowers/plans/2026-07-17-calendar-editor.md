# Calendar editor (B2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the organizer reschedule a single match (campo/giorno/ora) from the E1 calendar, updating it in place (allowed even after publish).

**Architecture:** A `rescheduleMatch` store op edits a stored `ScheduledMatch`. `renderCalendar` gains an `editable` flag that adds a per-match "Modifica" button; E1 opens an edit panel (select campo + date + time) and saves via `rescheduleMatch`. E3 stays read-only. No framework.

**Tech Stack:** Vite MPA, vanilla TypeScript, Vitest + jsdom, plain HTML/CSS.

## Global Constraints

- **No framework**; vanilla TS/HTML/CSS; no backend/network; deterministic.
- **`rescheduleMatch` allowed whenever the match exists** (incl. PUBLISHED); independent of `groupsLocked` and of the config/regeneration lock.
- **`renderCalendar(..., editable=false)` default keeps E3 identical.**
- **Only group matches** (`ScheduledMatch`) are editable — not finals (`FinalMatch`).
- **Select/date/time controls, no drag&drop**; reuse Matchday classes; no hardcoded hex in screens.

---

## File Structure

```
shared/mock/store.ts        # + rescheduleMatch
shared/mock/schedule.test.ts# + rescheduleMatch test
shared/chrome.ts            # renderCalendar gains editable param
apps/organizer/schedule.html/.ts  # #editmatch panel + editable calendar + wiring
```

---

### Task 1: `rescheduleMatch` store op (TDD)

**Files:**
- Modify: `shared/mock/store.ts`, `shared/mock/schedule.test.ts`

**Interfaces:**
- Produces: `rescheduleMatch(matchId: string, patch: { day: string; time: string; field: string }): void`

- [ ] **Step 1: Add a failing test to `shared/mock/schedule.test.ts`**

Add `rescheduleMatch` to the import from `./store`, and add this test inside the `describe`:

```ts
  it('rescheduleMatch updates a match day/time/field in place', () => {
    generateSchedule('evt-1', config)
    const m = getScheduledMatches('evt-1')[0]
    rescheduleMatch(m.id, { day: '2026-08-31', time: '15:30', field: 'Campo Z' })
    const after = getScheduledMatches('evt-1').find(x => x.id === m.id)!
    expect(after).toMatchObject({ day: '2026-08-31', time: '15:30', field: 'Campo Z' })
    // other matches untouched
    expect(getScheduledMatches('evt-1').filter(x => x.field === 'Campo Z')).toHaveLength(1)
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd playfusion-web && npx vitest run shared/mock/schedule.test.ts`
Expected: FAIL — `rescheduleMatch` not exported.

- [ ] **Step 3: Implement in `shared/mock/store.ts`**

Append at the end of the file:

```ts
export function rescheduleMatch(matchId: string, patch: { day: string; time: string; field: string }): void {
  const state = load()
  const m = state.scheduledMatches.find(x => x.id === matchId)
  if (m) { m.day = patch.day; m.time = patch.time; m.field = patch.field }
  save(state)
}
```

- [ ] **Step 4: Run the full suite**

Run: `cd playfusion-web && npm test`
Expected: PASS — 31 tests green.

- [ ] **Step 5: Commit**

```bash
cd playfusion-web
git add shared/mock/store.ts shared/mock/schedule.test.ts
git commit -m "feat: rescheduleMatch store op (O7 manual reschedule)"
```

---

### Task 2: `renderCalendar` editable + E1 edit panel

**Files:**
- Modify: `shared/chrome.ts`, `apps/organizer/schedule.html`, `apps/organizer/schedule.ts`

**Interfaces:**
- Consumes: `rescheduleMatch` (Task 1), `getScheduledMatches`.
- Produces: `renderCalendar(matches, catName, editable = false)`.

- [ ] **Step 1: Add the `editable` param to `renderCalendar` in `shared/chrome.ts`**

Replace the `renderCalendar` function with:

```ts
export function renderCalendar(matches: ScheduledMatch[], catName: (id: string) => string, editable = false): string {
  if (!matches.length) return `<p class="pf-muted">Nessuna partita in calendario.</p>`
  const days = [...new Set(matches.map(m => m.day))].sort()
  return days.map(day => {
    const rows = matches.filter(m => m.day === day)
      .sort((a, b) => a.time.localeCompare(b.time) || a.field.localeCompare(b.field))
      .map(m => `<li class="pf-match">
        <span class="pf-match__time">${m.time}</span>
        <span class="pf-match__field">${m.field}</span>
        <span class="pf-match__cat">${catName(m.categoryId)} · ${m.groupLabel}</span>
        <span class="pf-match__teams">${m.home} <b>vs</b> ${m.away}</span>
        ${editable ? `<button class="pf-btn js-editmatch" data-match="${m.id}" style="margin-top:6px">Modifica</button>` : ''}
      </li>`).join('')
    return `<div class="pf-calday"><div class="pf-calday__head">${day}</div><ul class="pf-callist">${rows}</ul></div>`
  }).join('')
}
```

- [ ] **Step 2: Add the `#editmatch` container in `apps/organizer/schedule.html`**

Change the `<div id="viewtabs"></div>` line to:

```html
    <div id="viewtabs"></div>
    <div id="editmatch"></div>
```

- [ ] **Step 3: Wire the editor in `apps/organizer/schedule.ts`**

Add `rescheduleMatch` to the store import:

```ts
import { getCategories, getSchedule, getScheduledMatches, getStandings, getFinals, generateSchedule, approveSchedule, publishSchedule, rescheduleMatch } from '../../shared/mock/store'
```

Add this `openEditPanel` function right before `renderViews`:

```ts
function openEditPanel(matchId: string): void {
  const m = getScheduledMatches(id).find(x => x.id === matchId)
  if (!m) return
  const fields = schedule().config.byCategory[m.categoryId]?.fields ?? [...new Set(getScheduledMatches(id).map(x => x.field))]
  const panel = document.getElementById('editmatch')!
  panel.innerHTML = `<div class="pf-card">
    <h2>Sposta partita</h2>
    <p class="pf-muted">${m.home} vs ${m.away}</p>
    <div class="pf-field"><label>Campo</label><select id="em-field">${fields.map(f => `<option value="${f}"${f === m.field ? ' selected' : ''}>${f}</option>`).join('')}</select></div>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Giorno</label><input id="em-day" type="date" value="${m.day}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Ora</label><input id="em-time" type="time" value="${m.time}" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="em-save">Salva</button><button class="pf-btn" id="em-cancel">Annulla</button></div>
  </div>`
  document.getElementById('em-save')!.addEventListener('click', () => {
    rescheduleMatch(matchId, {
      day: (document.getElementById('em-day') as HTMLInputElement).value,
      time: (document.getElementById('em-time') as HTMLInputElement).value,
      field: (document.getElementById('em-field') as HTMLSelectElement).value,
    })
    renderViews()
  })
  document.getElementById('em-cancel')!.addEventListener('click', () => { panel.innerHTML = '' })
}
```

In `renderViews`, at the very start clear the panel, and after setting `#calendar` wire the edit buttons. Specifically: add `document.getElementById('editmatch')!.innerHTML = ''` as the FIRST line of `renderViews` (after the `catsPresent` empty-guard is fine too, but put it before the guard so it clears in all cases); change the `#calendar` line to pass `true`; and after it, wire the buttons:

```ts
  document.getElementById('calendar')!.innerHTML = renderCalendar(getScheduledMatches(id).filter(m => inSel(m.categoryId, m.groupLabel)), catName, true)
  document.querySelectorAll<HTMLButtonElement>('#calendar .js-editmatch').forEach(b =>
    b.addEventListener('click', () => openEditPanel(b.dataset.match!)))
```

Finally, in `render()`, add `document.getElementById('editmatch')!.innerHTML = ''` to the `cats.length === 0` branch and the `status === 'NONE'` branch (alongside the other clears).

- [ ] **Step 4: Verify build + behaviour**

Run: `cd playfusion-web && npm run build`
Expected: succeeds; `npm test` green (31).

`npm run dev`: after generating, each calendar match has a "Modifica" button; clicking it opens the panel; changing campo/giorno/ora + Salva moves that match (calendar re-renders); it works after Approva/Pubblica; the public `calendar.html` reflects the move and has no "Modifica" button.

- [ ] **Step 5: Commit**

```bash
cd playfusion-web
git add shared/chrome.ts apps/organizer/schedule.html apps/organizer/schedule.ts
git commit -m "feat: E1 calendar match reschedule (editable calendar + edit panel)"
```

---

### Task 3: End-to-end verification + README

**Files:** `README.md`

- [ ] **Step 1: Full suite + build**

Run: `cd playfusion-web && npm test && npm run build`
Expected: 31 tests pass; build succeeds.

- [ ] **Step 2: Manual walkthrough (acceptance)**

`npm run dev`: Hub → Reset → Organizer → Memorial → Componi gironi → Genera calendario → open a match's "Modifica", change its campo and ora, Salva → the match moves in the calendar. Approva → Pubblica → reschedule another match (still works) → open the public calendar → the moved match shows the new campo/ora and has no edit control.
Expected: spec success criteria 1–4.

- [ ] **Step 3: Update `README.md`**

Under `## Scope`, add:

```markdown
- **Calendar editor** — reschedule a single match (campo/giorno/ora) from the E1 calendar (O7), allowed even after publish; public calendar reflects it, stays read-only.
```

- [ ] **Step 4: Commit**

```bash
cd playfusion-web
git add README.md
git commit -m "docs: note calendar editor in README"
```

---

## Self-Review

**1. Spec coverage:**
- `rescheduleMatch` store op, no lock → Task 1 + test. ✓
- `renderCalendar` editable flag (E3 unchanged by default) → Task 2 Step 1. ✓
- E1 `#editmatch` panel (campo select from category fields + date + time) + wiring → Task 2. ✓
- Works in every state incl. PUBLISHED; public read-only → Task 2/3 (editable only in E1). ✓
- Only group matches editable (finals untouched) → renderBracket has no edit; only renderCalendar gets editable. ✓
- Blueprint D-O7-3 → coordinator post-step. ✓
- Success criteria 1–4 → Task 3. ✓

**2. Placeholder scan:** No TBD/TODO; full code in every step.

**3. Type consistency:** `rescheduleMatch(matchId, {day,time,field})` identical in store, test, and `openEditPanel` call. `renderCalendar(matches, catName, editable=false)` — E1 passes `true`, E3 (`calendar.ts`) keeps the 2-arg call (default false). `#editmatch`/`#calendar`/`.js-editmatch` ids/classes consistent between schedule.html, schedule.ts, and renderCalendar. `schedule().config.byCategory[categoryId].fields` matches the `ScheduleConfig` shape from earlier rounds.
