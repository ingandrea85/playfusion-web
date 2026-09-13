import { renderOrganizerTopbar, esc } from '@playfusion/app-shell'
import type { Client, CreateEventInput, EventDraft, SportProfile } from '@playfusion/rest-client'
import { inlineError, type Screen, type ViewCtx } from '../view.js'

/** Task 8: applies an AI-generated draft — create the event, draw gironi per category (dependency
 *  order: gironi must exist before schedule generation reads group/pool composition), generate the
 *  schedule, then navigate to the new event. Pure w.r.t. the DOM so it's unit-testable without it. */
export async function applyDraft(client: Client, navigate: (h: string) => void, draft: EventDraft): Promise<void> {
  const created = await client.o3.createEvent(draft.event)
  const id = created.sportEventId
  if (draft.groupsByCategory) {
    for (const cat of draft.event.categorie) {
      const g = draft.groupsByCategory[cat]
      if (g && g.groups.length) await client.o3.drawGironi(id, cat, g.groups.length)
    }
  }
  await client.o7.generateSchedule(id, draft.schedule)
  navigate(`#/events/${encodeURIComponent(id)}`)
}

/** Chip markup for the category list — shared by the initial render and mount's redraw(). */
export function renderCatChips(categorie: string[]): string {
  return categorie.map((c, i) =>
    `<li class="pf-cat"><span class="pf-cat__label">${esc(c)}</span><button type="button" class="pf-btn pf-btn--ghost" data-cat-remove="${i}">✕</button></li>`).join('')
}

const FORMAT_LABEL: Record<NonNullable<CreateEventInput['format']>, string> = {
  'groups': 'Solo gironi',
  'groups+bracket': 'Gironi + Tabellone',
  'bracket': 'Solo tabellone',
  'festival': 'Festival (non competitivo)',
}

function assistantPanel(hasAi: boolean): string {
  if (!hasAi) {
    return `<div class="pf-card pf-aipanel pf-aipanel--locked">
      <h2 class="pf-h3">✨ Assistente AI</h2>
      <p class="pf-muted">Descrivi il torneo a parole e lascia che l'assistente configuri categorie, gironi, calendario e finali. <b>Disponibile con Club.</b></p>
      <a class="pf-btn" href="#/org/subscription">Passa a Club</a>
    </div>`
  }
  return `<div class="pf-card pf-aipanel">
    <h2 class="pf-h3">✨ Assistente AI</h2>
    <p class="pf-muted">Descrivi il torneo: squadre, campi, orari, formato. L'assistente prepara una bozza da rivedere.</p>
    <textarea id="pf-ai-desc" rows="4" class="pf-input" placeholder="Es. Festa dello sport, 24 squadre U10, 3 campi, domenica 9–18, partite da 15', tutti giocano, niente classifiche."></textarea>
    <button id="pf-ai-go" class="pf-btn pf-btn--primary" type="button">✨ Genera bozza</button>
    <div id="pf-ai-out"></div>
  </div>`
}

export function renderCreateEvent(categorie: string[] = [], sports: SportProfile[] = [], hasAi = false): string {
  const sportOpts = sports.map((s) => `<option value="${esc(s.id)}" data-part="${s.participants}">${esc(s.name)}</option>`).join('')
  const formatOpts = (Object.keys(FORMAT_LABEL) as (keyof typeof FORMAT_LABEL)[])
    .map((k) => `<option value="${k}"${k === 'groups+bracket' ? ' selected' : ''}>${FORMAT_LABEL[k]}</option>`).join('')
  return `${renderOrganizerTopbar('dashboard')}
    <main class="pf-container pf-container--narrow">
      <div class="pf-pagehead"><div class="pf-eyebrow">Nuovo</div><h1>Crea evento</h1></div>
      ${assistantPanel(hasAi)}
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

export interface CreateEventGate { capReached: boolean; sports: SportProfile[]; hasAi: boolean }

export const createEventScreen: Screen<CreateEventGate> = {
  load: async (ctx) => {
    const [events, sports] = await Promise.all([
      ctx.client.o3.listEvents().catch(() => [] as unknown[]),
      ctx.client.o3.listSports().catch(() => [] as SportProfile[]),
    ])
    const max = ctx.entitlements.maxActiveEvents
    return { capReached: max !== null && events.length >= max, sports, hasAi: ctx.entitlements.hasAiAssistant }
  },
  render: (data) => (data.capReached ? renderCapBlocked() : renderCreateEvent([], data.sports, data.hasAi)),
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

    // Task 8: AI assistant interaction (only wired when the panel is rendered — entitled orgs).
    const desc = root.querySelector<HTMLTextAreaElement>('#pf-ai-desc')
    const go = root.querySelector<HTMLButtonElement>('#pf-ai-go')
    const out = root.querySelector<HTMLElement>('#pf-ai-out')
    let answers: Record<string, string> = {}

    async function requestDraft(): Promise<void> {
      if (!desc || !out) return
      const description = desc.value.trim()
      if (!description) { out.innerHTML = inlineError('Descrivi prima il torneo.'); return }
      if (go) go.disabled = true
      out.innerHTML = '<p class="pf-muted">Genero la bozza…</p>'
      try {
        const resp = await ctx.client.o13.draftEvent(ctx.orgId, { description, answers, sportId: undefined })
        if (resp.openQuestions?.length) renderQuestions(resp.openQuestions)
        else if (resp.draft) renderDraft(resp.draft)
        else out.innerHTML = inlineError('Nessuna bozza. Riprova o configura a mano.')
      } catch (e: unknown) {
        const status = (e as { status?: number }).status
        if (status === 429) out.innerHTML = inlineError('Hai esaurito le generazioni di questo mese. Passa a Enterprise per generazioni illimitate.')
        else out.innerHTML = inlineError('Non sono riuscito a generare una bozza. Configura pure a mano.')
      } finally { if (go) go.disabled = false }
    }

    function renderQuestions(qs: { field: string; question: string }[]): void {
      if (!out) return
      out.innerHTML = `<div class="pf-aiqs">${qs.map((q) =>
        `<label class="pf-field"><span>${esc(q.question)}</span><input class="pf-input" data-qfield="${esc(q.field)}"></label>`).join('')}
        <button class="pf-btn pf-btn--primary" id="pf-ai-answer" type="button">Completa la bozza</button></div>`
      out.querySelector('#pf-ai-answer')!.addEventListener('click', () => {
        answers = { ...answers }
        out.querySelectorAll<HTMLInputElement>('[data-qfield]').forEach((i) => { answers[i.dataset.qfield!] = i.value })
        void requestDraft()
      })
    }

    function renderDraft(draft: EventDraft): void {
      if (!out) return
      const cats = draft.event.categorie.map((cat) => {
        const g = draft.groupsByCategory?.[cat]
        const gtxt = g ? ` → ${g.groups.length} gruppi` : ''
        return `<li>${esc(cat)}${gtxt}</li>`
      }).join('')
      out.innerHTML = `<div class="pf-aidraft">
        <h3 class="pf-h4">${esc(draft.event.name)}</h3>
        <p class="pf-muted">${esc(draft.event.format)} · ${esc(draft.event.dates.from)} → ${esc(draft.event.dates.to)}</p>
        <ul>${cats}</ul>
        <p class="pf-muted">${esc(draft.rationale)}</p>
        <div class="pf-row">
          <button class="pf-btn" id="pf-ai-edit" type="button">✎ Modifica a mano</button>
          <button class="pf-btn pf-btn--primary" id="pf-ai-apply" type="button">Applica configurazione</button>
        </div></div>`
      out.querySelector('#pf-ai-apply')!.addEventListener('click', async () => {
        const btn = out.querySelector<HTMLButtonElement>('#pf-ai-apply')!; btn.disabled = true
        try { await applyDraft(ctx.client, ctx.navigate, draft) }
        catch { out.innerHTML = inlineError('Evento creato solo in parte. Controlla dal workspace.'); btn.disabled = false }
      })
      // "Modifica a mano" prefill is best-effort: fill the name field if present.
      out.querySelector('#pf-ai-edit')!.addEventListener('click', () => {
        const nameInput = root.querySelector<HTMLInputElement>('input[name="name"]')
        if (nameInput) nameInput.value = draft.event.name
        desc?.scrollIntoView({ behavior: 'smooth' })
      })
    }

    if (go) go.addEventListener('click', () => void requestDraft())
  },
}
