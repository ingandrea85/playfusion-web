import { esc, renderCalendar, renderTabs, categoryKeys, groupKeys } from '@playfusion/app-shell'
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
    </div>
    <p class="pf-muted" style="margin:var(--space-sm) 0 0">Gli slot per giornata sono calcolati automaticamente per far stare tutte le partite nei giorni dell'evento. I gironi si compongono nel tab <b>Gironi</b>.</p></div>`
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

const filterMatches = (matches: ScheduledMatchView[], selCat: string, selGir: string): ScheduledMatchView[] =>
  matches.filter((m) => m.categoryId === selCat && (selGir === 'ALL' || m.groupLabel === selGir))

/** Calendar card with Category + Girone filter tabs (S23). Default: first category, all gironi. */
function calendarCard(matches: ScheduledMatchView[], selCat: string, selGir: string): string {
  const gtabs = [{ key: 'ALL', label: 'Tutti' }, ...groupKeys(matches, selCat).map((g) => ({ key: g, label: g }))]
  return `<div class="pf-card"><h2 class="pf-h3">Calendario</h2>
    <div id="cal-cattabs">${renderTabs(categoryKeys(matches).map((c) => ({ key: c, label: c })), selCat)}</div>
    <div id="cal-girtabs">${renderTabs(gtabs, selGir)}</div>
    <div id="editmatch"></div>
    <div id="calbody">${renderCalendar(filterMatches(matches, selCat, selGir), catName, true)}</div>
  </div>`
}

export function renderSchedule(data: ScheduleData): string {
  const { event, schedule, matches } = data
  const calendar = schedule.status === 'NONE' ? '' : calendarCard(matches, categoryKeys(matches)[0] ?? '', 'ALL')
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

    // Calendar with category/girone filter tabs (S23); its redraw rewires the per-match
    // Risultato/Modifica buttons. Works in every status (incl. APPROVED/PUBLISHED).
    wireCalendar()
    if (isLocked(data.schedule.status)) { wireStatus(); return }

    const categorie = data.event.categorie
    const cfgbody = root.querySelector('#cfgbody')!
    const sameForAll = root.querySelector<HTMLInputElement>('#sameForAll')
    const mode = (): 'all' | 'per' => (sameForAll?.checked ? 'all' : 'per')
    sameForAll?.addEventListener('change', () => { cfgbody.innerHTML = renderConfigBody(mode(), data.schedule.config, categorie, false) })

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
      // slotsPerDay is derived automatically by the o7 generator (fits all matches across the
      // event days) — no longer a form input.
      // groupsCount is only the auto-split fallback for events with no composed gironi (set in
      // the Gironi tab); it's no longer a calendar-screen input. Preserve the stored value.
      const groupsCount = data.schedule.config.groupsCount || 1
      if (mode() === 'all') {
        const cc = readCard(cfgbody.querySelector('.js-playcard')!)
        if (!cc.fields.length) return { error: 'Indica almeno un campo.' }
        return { config: { ...cc, dailyStart, groupsCount } }
      }
      const byCategory: Record<string, CategorySchedule> = {}
      for (const card of Array.from(cfgbody.querySelectorAll('.js-playcard'))) {
        const c = card.getAttribute('data-cat')!
        const cc = readCard(card)
        if (!cc.fields.length) return { error: `Indica almeno un campo per la categoria ${c}.` }
        byCategory[c] = cc
      }
      const first = Object.values(byCategory)[0] ?? defaultCat(data.schedule.config)
      return { config: { ...first, dailyStart, groupsCount, byCategory } }
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

    /** S23: category + girone filter tabs above the calendar. Redraws the tab bars and the
     *  calendar body on each change, then rewires the per-match Risultato/Modifica buttons. */
    function wireCalendar() {
      const calbody = root.querySelector('#calbody'); if (!calbody) return
      const catbar = root.querySelector('#cal-cattabs')!
      const girbar = root.querySelector('#cal-girtabs')!
      let selCat = categoryKeys(data.matches)[0] ?? ''
      let selGir = 'ALL'
      function draw() {
        catbar.innerHTML = renderTabs(categoryKeys(data.matches).map((c) => ({ key: c, label: c })), selCat)
        catbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
          b.addEventListener('click', () => { selCat = b.dataset.key!; selGir = 'ALL'; draw() }))
        const gtabs = [{ key: 'ALL', label: 'Tutti' }, ...groupKeys(data.matches, selCat).map((g) => ({ key: g, label: g }))]
        girbar.innerHTML = renderTabs(gtabs, selGir)
        girbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
          b.addEventListener('click', () => { selGir = b.dataset.key!; draw() }))
        calbody!.innerHTML = renderCalendar(filterMatches(data.matches, selCat, selGir), catName, true)
        wireResult(); wireReschedule()
      }
      draw()
    }

    /** S10: per-match result entry. "Risultato" opens a panel (home/away score, prefilled if
     *  played); Salva → o7.recordResult → refresh (calendar shows the score, standings recompute). */
    function wireResult() {
      const panel = root.querySelector('#editmatch')
      if (!panel) return
      root.querySelectorAll<HTMLButtonElement>('.js-resultmatch').forEach((btn) =>
        btn.addEventListener('click', () => openResult(btn.dataset.match!)))

      function openResult(matchId: string) {
        const m = data.matches.find((x) => x.id === matchId)
        if (!m) return
        const hs = m.homeScore ?? '', as = m.awayScore ?? ''
        panel!.innerHTML = `<div class="pf-card"><h3 class="pf-h4" style="margin-top:0">Risultato · ${esc(m.home)} vs ${esc(m.away)}</h3>
          <div class="pf-row" style="justify-content:flex-start;gap:var(--space-md);align-items:flex-end">
            <div class="pf-field" style="margin-bottom:0;width:110px"><label>${esc(m.home)}</label><input id="rr-home" type="number" min="0" value="${esc(hs)}" /></div>
            <div class="pf-field" style="margin-bottom:0;width:110px"><label>${esc(m.away)}</label><input id="rr-away" type="number" min="0" value="${esc(as)}" /></div>
            <button type="button" class="pf-btn pf-btn--primary" id="rr-save">Salva</button>
            <button type="button" class="pf-btn" id="rr-cancel">Annulla</button>
          </div></div>`
        panel!.querySelector('#rr-cancel')!.addEventListener('click', () => { panel!.innerHTML = '' })
        panel!.querySelector('#rr-save')!.addEventListener('click', async (e) => {
          const b = e.currentTarget as HTMLButtonElement
          const homeScore = Number((panel!.querySelector('#rr-home') as HTMLInputElement).value)
          const awayScore = Number((panel!.querySelector('#rr-away') as HTMLInputElement).value)
          if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
            err.innerHTML = inlineError('Inserisci due punteggi validi (interi ≥ 0).'); return
          }
          b.disabled = true
          try { await ctx.client.o7.recordResult(id, matchId, { homeScore, awayScore }); ctx.refresh() }
          catch { err.innerHTML = inlineError('Salvataggio risultato non riuscito. Riprova.'); b.disabled = false }
        })
      }
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
        // Team options (S24): the teams of this match's category (across its gironi) — level B
        // allows moving a team between gironi of the same category. Ensure current teams are present.
        const teamOpts = [...new Set(data.matches.filter((x) => x.categoryId === m.categoryId).flatMap((x) => [x.home, x.away]).concat([m.home, m.away]))]
        const teamSelect = (idAttr: string, sel: string) =>
          `<select id="${idAttr}">${teamOpts.map((t) => `<option ${t === sel ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`
        panel!.innerHTML = `<div class="pf-card"><h3 class="pf-h4" style="margin-top:0">Modifica partita</h3>
          <div class="pf-row" style="justify-content:flex-start;gap:var(--space-md);align-items:flex-end">
            <div class="pf-field" style="margin-bottom:0"><label>Casa</label>${teamSelect('rs-home', m.home)}</div>
            <div class="pf-field" style="margin-bottom:0"><label>Ospite</label>${teamSelect('rs-away', m.away)}</div>
            <div class="pf-field" style="margin-bottom:0"><label>Campo</label><select id="rs-field">${fieldOpts.map((f) => `<option ${f === m.field ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></div>
            <div class="pf-field" style="margin-bottom:0"><label>Giorno</label><input id="rs-day" type="date" value="${esc(m.day)}" /></div>
            <div class="pf-field" style="margin-bottom:0"><label>Ora</label><input id="rs-time" type="time" value="${esc(m.time)}" /></div>
            <button type="button" class="pf-btn pf-btn--primary" id="rs-save">Salva</button>
            <button type="button" class="pf-btn" id="rs-cancel">Annulla</button>
          </div>
          <p class="pf-muted" style="margin:var(--space-sm) 0 0">Cambiare le squadre azzera l'eventuale risultato.</p></div>`
        panel!.querySelector('#rs-cancel')!.addEventListener('click', () => { panel!.innerHTML = '' })
        panel!.querySelector('#rs-save')!.addEventListener('click', async (e) => {
          const b = e.currentTarget as HTMLButtonElement
          const home = (panel!.querySelector('#rs-home') as HTMLSelectElement).value
          const away = (panel!.querySelector('#rs-away') as HTMLSelectElement).value
          if (home === away) { err.innerHTML = inlineError('Casa e Ospite devono essere squadre diverse.'); return }
          b.disabled = true
          const patch = {
            home, away,
            field: (panel!.querySelector('#rs-field') as HTMLSelectElement).value,
            day: (panel!.querySelector('#rs-day') as HTMLInputElement).value,
            time: (panel!.querySelector('#rs-time') as HTMLInputElement).value,
          }
          try { await ctx.client.o7.rescheduleMatch(id, matchId, patch); ctx.refresh() }
          catch (e2: unknown) {
            const status = (e2 as { status?: number })?.status
            err.innerHTML = inlineError(status === 409 ? 'Slot già occupato: scegli un altro campo o orario.'
              : status === 422 ? 'Squadre non valide.' : 'Modifica non riuscita. Riprova.')
            b.disabled = false
          }
        })
      }
    }
  },
}
