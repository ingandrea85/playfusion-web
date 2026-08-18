import { renderOrganizerTopbar, esc } from '@playfusion/app-shell'
import type { CreateEventInput } from '@playfusion/rest-client'
import { inlineError, type Screen, type ViewCtx } from '../view.js'

/** Chip markup for the category list — factored out so both renderCreateEvent (initial
 *  render, node-testable) and mount's redraw() (after add/remove) share one template. */
export function renderCatChips(categorie: string[]): string {
  return categorie.map((c, i) =>
    `<li class="pf-cat"><span class="pf-cat__label">${esc(c)}</span><button type="button" class="pf-btn pf-btn--ghost" data-cat-remove="${i}">✕</button></li>`).join('')
}

export function renderCreateEvent(categorie: string[] = []): string {
  return `${renderOrganizerTopbar('dashboard')}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">Nuovo</div><h1>Crea evento</h1></div>
      <div id="err"></div>
      <form id="form" class="pf-card">
        <div class="pf-field"><label>Sport</label><input name="sport" required placeholder="es. Calcio a 5" /></div>
        <div class="pf-field"><label>Categorie</label>
          <div class="pf-row"><input id="cat" placeholder="es. U10" /><button type="button" class="pf-btn" data-cat-add>Aggiungi</button></div>
          <ul class="pf-catlist" id="cats">${renderCatChips(categorie)}</ul>
        </div>
        <div class="pf-row">
          <div class="pf-field" style="flex:1"><label>Dal</label><input type="date" name="from" required /></div>
          <div class="pf-field" style="flex:1"><label>Al</label><input type="date" name="to" required /></div>
        </div>
        <button class="pf-btn pf-btn--primary pf-btn--lg" type="submit" data-create>Crea evento</button>
      </form>
    </main>`
}

/** Create-event is stateful (the category list), so mount keeps a local array and re-renders
 *  the chips in place via renderCatChips; submit builds CreateEventInput and calls o3.createEvent. */
export const createEventScreen: Screen<null> = {
  load: async () => null,
  render: () => renderCreateEvent([]),
  mount(root, ctx: ViewCtx) {
    const categorie: string[] = []
    const cats = root.querySelector('#cats')!
    const catInput = root.querySelector<HTMLInputElement>('#cat')!
    const err = root.querySelector('#err')!
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
      const input: CreateEventInput = {
        sport: String(data.get('sport') ?? '').trim(),
        categorie: [...categorie],
        dates: { from: String(data.get('from') ?? ''), to: String(data.get('to') ?? '') },
      }
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
