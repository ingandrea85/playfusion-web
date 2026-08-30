import { renderOrganizerTopbar, esc } from '@playfusion/app-shell'
import type { CreateEventInput, SportProfile } from '@playfusion/rest-client'
import { inlineError, type Screen, type ViewCtx } from '../view.js'

/** Chip markup for the category list — shared by the initial render and mount's redraw(). */
export function renderCatChips(categorie: string[]): string {
  return categorie.map((c, i) =>
    `<li class="pf-cat"><span class="pf-cat__label">${esc(c)}</span><button type="button" class="pf-btn pf-btn--ghost" data-cat-remove="${i}">✕</button></li>`).join('')
}

const FORMAT_LABEL: Record<NonNullable<CreateEventInput['format']>, string> = {
  'groups': 'Solo gironi',
  'groups+bracket': 'Gironi + Tabellone',
  'bracket': 'Solo tabellone',
}

export function renderCreateEvent(categorie: string[] = [], sports: SportProfile[] = []): string {
  const sportOpts = sports.map((s) => `<option value="${esc(s.id)}" data-part="${s.participants}">${esc(s.name)}</option>`).join('')
  const formatOpts = (Object.keys(FORMAT_LABEL) as (keyof typeof FORMAT_LABEL)[])
    .map((k) => `<option value="${k}"${k === 'groups+bracket' ? ' selected' : ''}>${FORMAT_LABEL[k]}</option>`).join('')
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
        <div class="pf-field"><label>Sport</label>
          <select name="sportId" id="sportId" required>${sports.length ? sportOpts : '<option value="" disabled selected>Nessuno sport in catalogo</option>'}</select>
          <p class="pf-muted" style="font-size:13px;margin:6px 0 0">Punteggio, punti e criteri di spareggio vengono dal profilo sport.</p>
        </div>
        <div class="pf-field" id="part-field" hidden><label>Tipo partecipante</label>
          <div class="pf-seg">
            <label class="pf-segopt on"><input type="radio" name="participantType" value="team" checked hidden/>Squadra</label>
            <label class="pf-segopt"><input type="radio" name="participantType" value="individual" hidden/>Individuale</label>
          </div>
        </div>
        <div class="pf-field"><label>Formato dell'evento</label>
          <select name="format">${formatOpts}</select>
        </div>
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
        <button class="pf-btn pf-btn--primary pf-btn--lg" type="submit" data-create>Crea evento</button>
      </form>
    </main>`
}

/** S20 Free plan cap: a FREE org may keep only 1 event → block with an upgrade link. */
export function renderCapBlocked(): string {
  return `${renderOrganizerTopbar('dashboard')}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">Nuovo</div><h1>Crea evento</h1></div>
      <div class="pf-card">
        <h2 class="pf-h3">Hai raggiunto il limite del piano Free</h2>
        <p class="pf-muted">Il piano Free include <b>1 evento</b>. Passa a Pro per crearne quanti vuoi.</p>
        <div class="pf-row" style="justify-content:flex-start;gap:var(--space-sm)">
          <a class="pf-btn pf-btn--primary" href="#/org/subscription">Passa a Pro</a>
          <a class="pf-btn" href="#/">← Torna ai tornei</a>
        </div>
      </div>
    </main>`
}

export interface CreateEventGate { capReached: boolean; sports: SportProfile[] }

export const createEventScreen: Screen<CreateEventGate> = {
  load: async (ctx) => {
    const [events, sports] = await Promise.all([
      ctx.client.o3.listEvents().catch(() => [] as unknown[]),
      ctx.client.o3.listSports().catch(() => [] as SportProfile[]),
    ])
    const max = ctx.entitlements.maxActiveEvents
    return { capReached: max !== null && events.length >= max, sports }
  },
  render: (data) => (data.capReached ? renderCapBlocked() : renderCreateEvent([], data.sports)),
  mount(root, ctx: ViewCtx, data) {
    if (data.capReached) return
    const categorie: string[] = []
    const cats = root.querySelector('#cats')!
    const catInput = root.querySelector<HTMLInputElement>('#cat')!
    const sportSel = root.querySelector<HTMLSelectElement>('#sportId')!
    const partField = root.querySelector<HTMLElement>('#part-field')!
    const err = root.querySelector('#err')!

    // Show the participant-type choice only when the selected sport allows both.
    const syncPart = () => {
      const opt = sportSel.selectedOptions[0]
      partField.hidden = (opt?.dataset.part ?? '') !== 'both'
    }
    sportSel.addEventListener('change', syncPart); syncPart()
    partField.querySelectorAll<HTMLInputElement>('input[name="participantType"]').forEach((r) =>
      r.addEventListener('change', () => partField.querySelectorAll('.pf-segopt').forEach((o) =>
        o.classList.toggle('on', (o.querySelector('input') as HTMLInputElement).checked))))

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
      const fd = new FormData(f)
      const trimmed = (k: string) => String(fd.get(k) ?? '').trim()
      const sportId = trimmed('sportId')
      const input: CreateEventInput = {
        sportId,
        categorie: [...categorie],
        dates: { from: String(fd.get('from') ?? ''), to: String(fd.get('to') ?? '') },
        format: (String(fd.get('format') ?? 'groups+bracket') as CreateEventInput['format']),
        playbook: (String(fd.get('playbook') ?? 'PB-1') as CreateEventInput['playbook']),
      }
      if (!partField.hidden) input.participantType = (String(fd.get('participantType') ?? 'team') as CreateEventInput['participantType'])
      const name = trimmed('name'); if (name) input.name = name
      const location = trimmed('location'); if (location) input.location = location
      const startTime = trimmed('startTime'); if (startTime) input.startTime = startTime
      if (!sportId || !input.categorie.length || !input.dates.from || !input.dates.to) {
        err.innerHTML = inlineError('Scegli lo sport, almeno una categoria e le date.'); return
      }
      const btn = f.querySelector<HTMLButtonElement>('[data-create]')!; btn.disabled = true
      try {
        const created = await ctx.client.o3.createEvent(input)
        ctx.navigate(`#/events/${encodeURIComponent(created.sportEventId)}`)
      } catch { err.innerHTML = inlineError('Creazione non riuscita. Riprova.'); btn.disabled = false }
    })
  },
}
