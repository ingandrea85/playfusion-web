import { esc, renderCalendar } from '@playfusion/app-shell'
import type { CategorySchedule, EventDetail, ScheduleConfig, ScheduleView, ScheduledMatchView } from '@playfusion/rest-client'
import { inlineError, type Screen, type ViewCtx } from '../view.js'
import { workspaceShell } from './workspace.js'

export interface ScheduleData {
  event: EventDetail
  schedule: ScheduleView
  matches: ScheduledMatchView[]
}

const STATUS_LABEL: Record<ScheduleView['status'], string> = {
  NONE: 'Da generare', GENERATED: 'Generato', APPROVED: 'Approvato', PUBLISHED: 'Pubblicato',
}
const isLocked = (s: ScheduleView['status']): boolean => s === 'APPROVED' || s === 'PUBLISHED'
const catName = (c: string): string => c

const defaultCat = (c: ScheduleConfig): CategorySchedule =>
  ({ fields: c.fields, periods: c.periods, periodMinutes: c.periodMinutes, breakMinutes: c.breakMinutes, legs: c.legs })
const textToFields = (s: string): string[] => s.split(',').map((f) => f.trim()).filter(Boolean)

/** One playing-config card (fields + match params + legs). `cat` present → per-category card
 *  tagged with data-cat; absent → the shared "same for all" card. */
function playCard(cc: CategorySchedule, locked: boolean, cat?: string): string {
  const dis = locked ? 'disabled' : ''
  return `<div class="pf-card js-playcard"${cat ? ` data-cat="${esc(cat)}"` : ''} style="background:var(--color-surface-sunken)">
    ${cat ? `<h3 class="pf-h4" style="margin-top:0">${esc(cat)}</h3>` : ''}
    <div class="pf-field"><label>Campi (separati da virgola)</label>
      <input class="cfg-fields" value="${esc(cc.fields.join(', '))}" placeholder="es. Campo A, Campo B" ${dis} /></div>
    <div class="pf-row" style="justify-content:flex-start;gap:var(--space-md)">
      <div class="pf-field" style="margin-bottom:0"><label>N. tempi</label><input class="cfg-periods" type="number" min="1" value="${cc.periods}" ${dis} /></div>
      <div class="pf-field" style="margin-bottom:0"><label>Durata (min)</label><input class="cfg-periodMinutes" type="number" min="1" value="${cc.periodMinutes}" ${dis} /></div>
      <div class="pf-field" style="margin-bottom:0"><label>Pausa (min)</label><input class="cfg-breakMinutes" type="number" min="0" value="${cc.breakMinutes}" ${dis} /></div>
      <div class="pf-field" style="margin-bottom:0"><label>Andata/ritorno</label><select class="cfg-legs" ${dis}>
        <option value="SINGLE" ${cc.legs === 'SINGLE' ? 'selected' : ''}>Solo andata</option>
        <option value="HOME_AWAY" ${cc.legs === 'HOME_AWAY' ? 'selected' : ''}>Andata e ritorno</option>
      </select></div>
    </div>
  </div>`
}

function renderConfigBody(mode: 'all' | 'per', config: ScheduleConfig, categorie: string[], locked: boolean): string {
  if (mode === 'all') return playCard(defaultCat(config), locked)
  return categorie.map((c) => playCard(config.byCategory?.[c] ?? defaultCat(config), locked, c)).join('')
}

function globalCard(config: ScheduleConfig, locked: boolean): string {
  const dis = locked ? 'disabled' : ''
  return `<div class="pf-card"><h2 class="pf-h3">Finestra impianto</h2>
    <div class="pf-row" style="justify-content:flex-start;gap:var(--space-md)">
      <div class="pf-field" style="margin-bottom:0"><label>Inizio giornata</label><input id="dailyStart" type="time" value="${esc(config.dailyStart)}" ${dis} /></div>
      <div class="pf-field" style="margin-bottom:0"><label>Slot per giornata</label><input id="slotsPerDay" type="number" min="1" value="${config.slotsPerDay}" ${dis} /></div>
      <div class="pf-field" style="margin-bottom:0"><label>Gironi per categoria (auto)</label><input id="groupsCount" type="number" min="1" value="${config.groupsCount}" ${dis} /></div>
    </div></div>`
}

function configSection(config: ScheduleConfig, categorie: string[], status: ScheduleView['status']): string {
  const locked = isLocked(status)
  const mode = config.byCategory ? 'per' : 'all'
  return `${globalCard(config, locked)}
    <div class="pf-card">
      <h2 class="pf-h3">Config di gioco</h2>
      <label class="pf-switch"><input type="checkbox" id="sameForAll" ${mode === 'all' ? 'checked' : ''} ${locked ? 'disabled' : ''} /> Stessa config di gioco per tutte le categorie</label>
      <div id="cfgbody" style="margin-top:var(--space-md)">${renderConfigBody(mode, config, categorie, locked)}</div>
      ${locked
        ? '<p class="pf-muted" style="margin-top:var(--space-md)">Calendario approvato: configurazione bloccata.</p>'
        : '<button class="pf-btn pf-btn--primary" id="generate" style="margin-top:var(--space-md)">Genera calendario</button>'}
    </div>`
}

function actionsCard(status: ScheduleView['status']): string {
  if (status === 'NONE') return `<div class="pf-card pf-muted">Genera il calendario per poterlo approvare e pubblicare.</div>`
  return `<div class="pf-card"><div class="pf-row">
    <div><div class="pf-eyebrow">Stato calendario</div><h2 class="pf-h3" style="margin:4px 0 0">${STATUS_LABEL[status]}</h2></div>
    <div class="pf-row" style="gap:var(--space-sm)">
      <button class="pf-btn pf-btn--primary" id="approve" ${status === 'GENERATED' ? '' : 'disabled'}>Approva</button>
      <button class="pf-btn pf-btn--primary" id="publish" ${status === 'APPROVED' ? '' : 'disabled'}>Pubblica</button>
    </div>
  </div></div>`
}

export function renderSchedule(data: ScheduleData): string {
  const { event, schedule, matches } = data
  const calendar = schedule.status === 'NONE' ? ''
    : `<div class="pf-card"><h2 class="pf-h3">Calendario</h2><div id="editmatch"></div>${renderCalendar(matches, catName, true)}</div>`
  return workspaceShell(event, 'schedule',
    `<div id="err"></div>${configSection(schedule.config, event.categorie, schedule.status)}${actionsCard(schedule.status)}${calendar}`)
}

export const scheduleScreen: Screen<ScheduleData> = {
  load: async (ctx, p) => {
    const [event, schedule, matches] = await Promise.all([
      ctx.client.o3.getEvent(p.id), ctx.client.o7.getSchedule(p.id), ctx.client.o7.getMatches(p.id),
    ])
    return { event, schedule, matches }
  },
  render: renderSchedule,
  mount(root, ctx: ViewCtx, data) {
    const id = data.event.sportEventId
    const err = root.querySelector('#err')!

    // Reschedule works in every status (incl. APPROVED/PUBLISHED — D-O7-3).
    wireReschedule()
    if (isLocked(data.schedule.status)) { wireStatus(); return }

    const categorie = data.event.categorie
    const cfgbody = root.querySelector('#cfgbody')!
    const sameForAll = root.querySelector<HTMLInputElement>('#sameForAll')
    const mode = (): 'all' | 'per' => (sameForAll?.checked ? 'all' : 'per')
    sameForAll?.addEventListener('change', () => { cfgbody.innerHTML = renderConfigBody(mode(), data.schedule.config, categorie, false) })

    const numAt = (sel: string, fb: number): number => {
      const v = Number(root.querySelector<HTMLInputElement>(sel)?.value)
      return Number.isFinite(v) && v > 0 ? v : fb
    }
    const readCard = (el: Element): CategorySchedule => {
      const val = (s: string) => el.querySelector<HTMLInputElement>(s)?.value ?? ''
      const num = (s: string, fb: number) => { const v = Number(val(s)); return Number.isFinite(v) && v > 0 ? v : fb }
      return {
        fields: textToFields(val('.cfg-fields')),
        periods: num('.cfg-periods', 2), periodMinutes: num('.cfg-periodMinutes', 20),
        breakMinutes: Number(val('.cfg-breakMinutes')) || 0,
        legs: el.querySelector<HTMLSelectElement>('.cfg-legs')?.value === 'HOME_AWAY' ? 'HOME_AWAY' : 'SINGLE',
      }
    }
    const buildConfig = (): { config?: ScheduleConfig; error?: string } => {
      const dailyStart = root.querySelector<HTMLInputElement>('#dailyStart')?.value || '09:00'
      const slotsPerDay = numAt('#slotsPerDay', 8)
      const groupsCount = numAt('#groupsCount', 1)
      if (mode() === 'all') {
        const cc = readCard(cfgbody.querySelector('.js-playcard')!)
        if (!cc.fields.length) return { error: 'Indica almeno un campo.' }
        return { config: { ...cc, dailyStart, slotsPerDay, groupsCount } }
      }
      const byCategory: Record<string, CategorySchedule> = {}
      for (const card of Array.from(cfgbody.querySelectorAll('.js-playcard'))) {
        const c = card.getAttribute('data-cat')!
        const cc = readCard(card)
        if (!cc.fields.length) return { error: `Indica almeno un campo per la categoria ${c}.` }
        byCategory[c] = cc
      }
      const first = Object.values(byCategory)[0] ?? defaultCat(data.schedule.config)
      return { config: { ...first, dailyStart, slotsPerDay, groupsCount, byCategory } }
    }

    root.querySelector('#generate')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement
      const { config, error } = buildConfig()
      if (error || !config) { err.innerHTML = inlineError(error ?? 'Configurazione non valida.'); return }
      btn.disabled = true
      try { await ctx.client.o7.generateSchedule(id, config); ctx.refresh() }
      catch { err.innerHTML = inlineError('Generazione non riuscita. Riprova.'); btn.disabled = false }
    })
    wireStatus()

    function wireStatus() {
      const approve = root.querySelector<HTMLButtonElement>('#approve')
      const publish = root.querySelector<HTMLButtonElement>('#publish')
      if (approve && !approve.disabled) approve.addEventListener('click', async () => {
        approve.disabled = true
        try { await ctx.client.o7.approveSchedule(id); ctx.refresh() }
        catch { err.innerHTML = inlineError('Approvazione non riuscita.'); approve.disabled = false }
      })
      if (publish && !publish.disabled) publish.addEventListener('click', async () => {
        publish.disabled = true
        try { await ctx.client.o7.publishSchedule(id); ctx.refresh() }
        catch { err.innerHTML = inlineError('Pubblicazione non riuscita.'); publish.disabled = false }
      })
    }

    /** S9: per-match reschedule. "Modifica" opens a panel (field/day/time prefilled); Salva →
     *  o7.rescheduleMatch → refresh; a 409 slot conflict keeps the panel and shows the clash. */
    function wireReschedule() {
      const panel = root.querySelector('#editmatch')
      if (!panel) return
      root.querySelectorAll<HTMLButtonElement>('.js-editmatch').forEach((btn) =>
        btn.addEventListener('click', () => openPanel(btn.dataset.match!)))

      function openPanel(matchId: string) {
        const m = data.matches.find((x) => x.id === matchId)
        if (!m) return
        // Field options: the match's category config fields, else the fields seen in the calendar.
        const catFields = data.schedule.config.byCategory?.[m.categoryId]?.fields ?? data.schedule.config.fields
        const fieldOpts = catFields.length ? catFields : [...new Set(data.matches.map((x) => x.field))]
        panel!.innerHTML = `<div class="pf-card"><h3 class="pf-h4" style="margin-top:0">${esc(m.home)} vs ${esc(m.away)}</h3>
          <div class="pf-row" style="justify-content:flex-start;gap:var(--space-md);align-items:flex-end">
            <div class="pf-field" style="margin-bottom:0"><label>Campo</label><select id="rs-field">${fieldOpts.map((f) => `<option ${f === m.field ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
            <div class="pf-field" style="margin-bottom:0"><label>Giorno</label><input id="rs-day" type="date" value="${esc(m.day)}" /></div>
            <div class="pf-field" style="margin-bottom:0"><label>Ora</label><input id="rs-time" type="time" value="${esc(m.time)}" /></div>
            <button type="button" class="pf-btn pf-btn--primary" id="rs-save">Salva</button>
            <button type="button" class="pf-btn" id="rs-cancel">Annulla</button>
          </div></div>`
        panel!.querySelector('#rs-cancel')!.addEventListener('click', () => { panel!.innerHTML = '' })
        panel!.querySelector('#rs-save')!.addEventListener('click', async (e) => {
          const b = e.currentTarget as HTMLButtonElement; b.disabled = true
          const patch = {
            field: (panel!.querySelector('#rs-field') as HTMLSelectElement).value,
            day: (panel!.querySelector('#rs-day') as HTMLInputElement).value,
            time: (panel!.querySelector('#rs-time') as HTMLInputElement).value,
          }
          try { await ctx.client.o7.rescheduleMatch(id, matchId, patch); ctx.refresh() }
          catch (e2: unknown) {
            const conflict = (e2 as { status?: number })?.status === 409
            err.innerHTML = inlineError(conflict ? 'Slot già occupato: scegli un altro campo o orario.' : 'Riprogrammazione non riuscita. Riprova.')
            b.disabled = false
          }
        })
      }
    }
  },
}
