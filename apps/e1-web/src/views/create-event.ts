import { renderOrganizerTopbar, esc } from '@playfusion/app-shell'
import type { CreateEventInput, TieBreakCriterion } from '@playfusion/rest-client'
import { inlineError, type Screen, type ViewCtx } from '../view.js'
import { ALL_CRITERIA, defaultTieBreak, criterionLabel } from './tiebreak.js'

/** Chip markup for the category list — factored out so both renderCreateEvent (initial
 *  render, node-testable) and mount's redraw() (after add/remove) share one template. */
export function renderCatChips(categorie: string[]): string {
  return categorie.map((c, i) =>
    `<li class="pf-cat"><span class="pf-cat__label">${esc(c)}</span><button type="button" class="pf-btn pf-btn--ghost" data-cat-remove="${i}">✕</button></li>`).join('')
}

/** Tie-break editor markup: a fixed "Punti" row first, then every criterion (active ones
 *  first in policy order) with a toggle checkbox and ↑/↓ reorder controls. Shared by the
 *  initial render and mount's redraw so the two never drift. */
export function renderTieBreakEditor(ordered: TieBreakCriterion[], enabled: Set<TieBreakCriterion>): string {
  return `<ol class="pf-tblist">
    <li class="pf-tbrow pf-tbrow--fixed"><span class="pf-mono">1.</span> Punti <span class="pf-muted">(sempre, bloccato)</span></li>
    ${ordered.map((c, i) => `<li class="pf-tbrow">
      <label><input type="checkbox" data-c="${c}" ${enabled.has(c) ? 'checked' : ''}/> ${esc(criterionLabel(c))}</label>
      <span class="pf-tbmove">
        <button type="button" class="pf-btn pf-btn--ghost" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="pf-btn pf-btn--ghost" data-down="${i}" ${i === ordered.length - 1 ? 'disabled' : ''}>↓</button>
      </span>
    </li>`).join('')}
  </ol>`
}

export function renderCreateEvent(categorie: string[] = []): string {
  const policy = defaultTieBreak('')
  const ordered = [...policy, ...ALL_CRITERIA.filter(c => !policy.includes(c))]
  return `${renderOrganizerTopbar('dashboard')}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">Nuovo</div><h1>Crea evento</h1></div>
      <div id="err"></div>
      <form id="form" class="pf-card">
        <div class="pf-field"><label>Playbook</label>
          <select name="playbook">
            <option value="PB-1">PB-1 · Iscrizione con inviti</option>
            <option value="PB-2">PB-2 · Inserimento diretto squadre</option>
          </select>
        </div>
        <div class="pf-field"><label>Nome evento</label><input name="name" placeholder="es. Torneo Estivo Memorial" /></div>
        <div class="pf-field"><label>Sport</label><input name="sport" required placeholder="es. Calcio a 5" /></div>
        <div class="pf-field"><label>Luogo</label><input name="location" placeholder="es. Centro Sportivo Comunale" /></div>
        <div class="pf-field"><label>Categorie</label>
          <div class="pf-row"><input id="cat" placeholder="es. U10" /><button type="button" class="pf-btn" data-cat-add>Aggiungi</button></div>
          <ul class="pf-catlist" id="cats">${renderCatChips(categorie)}</ul>
        </div>
        <div class="pf-row" style="align-items:flex-end">
          <div class="pf-field" style="flex:1"><label>Inizio</label><input type="date" name="from" required /></div>
          <div class="pf-field" style="width:120px"><label>Ora</label><input type="time" name="startTime" /></div>
        </div>
        <div class="pf-field"><label>Fine</label><input type="date" name="to" required /></div>
        <div class="pf-field">
          <label>Criteri di spareggio (i punti valgono sempre per primi)</label>
          <div id="tiebreak">${renderTieBreakEditor(ordered, new Set(policy))}</div>
        </div>
        <button class="pf-btn pf-btn--primary pf-btn--lg" type="submit" data-create>Crea evento</button>
      </form>
    </main>`
}

/** S20 Free plan cap: a FREE org may keep only 1 event. When the cap is hit, create-event shows a
 *  block with an upgrade link instead of the form. NOTE: the spec counts only ACTIVE (non-DONE)
 *  events; computing per-event phase needs match data, so this slice caps on total events for FREE
 *  and leaves the active-only refinement as a follow-up. */
export function renderCapBlocked(): string {
  return `${renderOrganizerTopbar('dashboard')}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">Nuovo</div><h1>Crea evento</h1></div>
      <div class="pf-card">
        <h2 class="pf-h3">Hai raggiunto il limite del piano Free</h2>
        <p class="pf-muted">Il piano Free include <b>1 evento</b>. Passa a Pro per crearne quanti vuoi.</p>
        <div class="pf-row" style="justify-content:flex-start;gap:var(--space-sm)">
          <a class="pf-btn pf-btn--primary" href="#/account/subscription">Passa a Pro</a>
          <a class="pf-btn" href="#/">← Torna ai tornei</a>
        </div>
      </div>
    </main>`
}

export interface CreateEventGate { capReached: boolean }

/** Create-event is stateful (category list + tie-break policy), so mount keeps local state
 *  and re-renders in place; submit builds CreateEventInput and calls o3.createEvent. */
export const createEventScreen: Screen<CreateEventGate> = {
  load: async (ctx) => {
    const [sub, events] = await Promise.all([
      ctx.client.o11.getSubscription(ctx.orgId).catch(() => null),
      ctx.client.o3.listEvents().catch(() => [] as unknown[]),
    ])
    return { capReached: sub?.plan === 'FREE' && events.length >= 1 }
  },
  render: (data) => (data.capReached ? renderCapBlocked() : renderCreateEvent([])),
  mount(root, ctx: ViewCtx, data) {
    if (data.capReached) return
    const categorie: string[] = []
    const cats = root.querySelector('#cats')!
    const catInput = root.querySelector<HTMLInputElement>('#cat')!
    const sportInput = root.querySelector<HTMLInputElement>('[name=sport]')!
    const tbHost = root.querySelector('#tiebreak')!
    const err = root.querySelector('#err')!

    // Tie-break working state: an ordered view of all criteria (active first) + the active set.
    let policy = defaultTieBreak(sportInput.value)
    let enabled = new Set<TieBreakCriterion>(policy)
    let ordered: TieBreakCriterion[] = [...policy, ...ALL_CRITERIA.filter(c => !policy.includes(c))]
    const collectTieBreak = (): TieBreakCriterion[] => ordered.filter(c => enabled.has(c))

    const drawTieBreak = () => {
      tbHost.innerHTML = renderTieBreakEditor(ordered, enabled)
      tbHost.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(cb =>
        cb.addEventListener('change', () => {
          const c = cb.dataset.c as TieBreakCriterion; if (cb.checked) enabled.add(c); else enabled.delete(c)
        }))
      tbHost.querySelectorAll<HTMLButtonElement>('button[data-up]').forEach(b =>
        b.addEventListener('click', () => { const i = Number(b.dataset.up); [ordered[i - 1], ordered[i]] = [ordered[i], ordered[i - 1]]; drawTieBreak() }))
      tbHost.querySelectorAll<HTMLButtonElement>('button[data-down]').forEach(b =>
        b.addEventListener('click', () => { const i = Number(b.dataset.down); [ordered[i + 1], ordered[i]] = [ordered[i], ordered[i + 1]]; drawTieBreak() }))
    }
    drawTieBreak()

    // Changing the sport resets the policy to that sport's default (matches the mockup).
    sportInput.addEventListener('change', () => {
      policy = defaultTieBreak(sportInput.value)
      enabled = new Set(policy)
      ordered = [...policy, ...ALL_CRITERIA.filter(c => !policy.includes(c))]
      drawTieBreak()
    })

    const redraw = () => { cats.innerHTML = renderCatChips(categorie) }
    root.querySelector('[data-cat-add]')!.addEventListener('click', () => {
      const v = catInput.value.trim(); if (!v) return; categorie.push(v); catInput.value = ''; redraw()
    })
    cats.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-cat-remove]'); if (!b) return
      categorie.splice(Number(b.getAttribute('data-cat-remove')), 1); redraw()
    })
    root.querySelector('#form')!.addEventListener('submit', async (e) => {
      e.preventDefault()
      const f = e.target as HTMLFormElement
      const data = new FormData(f)
      const trimmed = (k: string) => String(data.get(k) ?? '').trim()
      const input: CreateEventInput = {
        sport: trimmed('sport'),
        categorie: [...categorie],
        dates: { from: String(data.get('from') ?? ''), to: String(data.get('to') ?? '') },
        playbook: (String(data.get('playbook') ?? 'PB-1') as CreateEventInput['playbook']),
        tieBreak: collectTieBreak(),
      }
      const name = trimmed('name'); if (name) input.name = name
      const location = trimmed('location'); if (location) input.location = location
      const startTime = trimmed('startTime'); if (startTime) input.startTime = startTime
      if (!input.sport || !input.categorie.length || !input.dates.from || !input.dates.to) {
        err.innerHTML = inlineError('Compila sport, almeno una categoria e le date.'); return
      }
      const btn = f.querySelector<HTMLButtonElement>('[data-create]')!; btn.disabled = true
      try {
        const created = await ctx.client.o3.createEvent(input)
        ctx.navigate(`#/events/${encodeURIComponent(created.sportEventId)}`)
      } catch { err.innerHTML = inlineError('Creazione non riuscita. Riprova.'); btn.disabled = false }
    })
  },
}
