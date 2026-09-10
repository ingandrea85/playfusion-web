import { esc, renderCalendar, renderTabs, categoryKeys, renderStepper, wireSteppers, readStepper, displayStatus, matchStatusBadge, calendarGironeTabs, filterCalendarMatches, finalsPhaseTabs, FINALS_TAB, renderBracket, renderShareLink, wireShareLinks, withPending } from '@playfusion/app-shell'
import type { CategorySchedule, CustomFinalsFormat, EventDetail, FinalsType, ScheduleConfig, ScheduleView, ScheduledMatchView } from '@playfusion/rest-client'
import { previewDraws, formatExplainer, type FormulaInput } from '@playfusion/finals-format'

const FINALS_TYPE_LABEL: Record<FinalsType, string> = {
  PLACEMENT: 'Tabellone eliminazione (per fascia)',
  SINGLE_GROUP_CROSSOVER: 'Girone unico · coppie (1ª-2ª, 3ª-4ª…)',
  SPLIT_GROUP_FINALS: 'Gironi + girone finale',
  GROUP_KNOCKOUT: 'Tabellone da gironi (incroci + teste di serie)',
  FINAL_ROUND_ROBIN: 'Girone all\'italiana finale',
}
const FINALS_TYPES: FinalsType[] = ['PLACEMENT', 'SINGLE_GROUP_CROSSOVER', 'SPLIT_GROUP_FINALS', 'GROUP_KNOCKOUT', 'FINAL_ROUND_ROBIN']
import { inlineError, type Screen, type ViewCtx } from '../view.js'
import { workspaceShell } from './workspace.js'
import { calendarSheets } from './export.js'
import { downloadXls } from '@playfusion/app-shell'

export interface ScheduleData {
  event: EventDetail
  schedule: ScheduleView
  matches: ScheduledMatchView[]
  finalsFormats: CustomFinalsFormat[] // SP1: custom formats offered alongside the built-ins
  teamsByCat: Record<string, number> // SP-B1: confirmed team/player count per category (for the formula preview)
}

const STATUS_LABEL: Record<ScheduleView['status'], string> = {
  NONE: 'Da generare', GENERATED: 'Generato', APPROVED: 'Approvato', PUBLISHED: 'Pubblicato',
}
const isLocked = (s: ScheduleView['status']): boolean => s === 'APPROVED' || s === 'PUBLISHED'
const catName = (c: string): string => c

const defaultCat = (c: ScheduleConfig): CategorySchedule =>
  ({ fields: c.fields, periods: c.periods, periodMinutes: c.periodMinutes, breakMinutes: c.breakMinutes, legs: c.legs,
     finalsType: c.finalsType, finalsEnabled: c.finalsEnabled, finalsTeamsToBracket: c.finalsTeamsToBracket, finalsFormatId: c.finalsFormatId,
     festivalMatchesPerTeam: c.festivalMatchesPerTeam })
const textToFields = (s: string): string[] => s.split(',').map((f) => f.trim()).filter(Boolean)

/** finali-formule SP-B1: the config card's live "formula" — an explainer sentence + the structural
 *  bracket compiled from the current counts. Skipped for a custom finals format (its own editor
 *  previews it). `count` = confirmed team/player count for the card's category; `groups` = groupsCount. */
function formulaInput(cc: CategorySchedule, bracket: boolean, count: number, groups: number): FormulaInput {
  if (bracket) return { solo: true, participants: count, thirdPlace: cc.finalsThirdPlace }
  return {
    finalsType: cc.finalsType, groups, participants: count,
    qualifiersPerGroup: cc.finalsQualifiersPerGroup, finalsTeamsToBracket: cc.finalsTeamsToBracket, thirdPlace: cc.finalsThirdPlace,
  }
}
function renderFormula(cc: CategorySchedule, bracket: boolean, count: number, groups: number): string {
  if (cc.finalsFormatId) return `<div class="pf-formula"><p class="pf-muted">💡 Formato personalizzato — anteprima nell'editor dei formati.</p></div>`
  const input = formulaInput(cc, bracket, count, groups)
  const explain = `<p class="pf-formula__explain">💡 ${esc(formatExplainer(input))}</p>`
  const draws = previewDraws(input)
  const preview = draws.length ? renderBracket(draws.map((d) => ({ ...d, categoryId: 'preview' })), () => 'Anteprima') : ''
  return `<div class="pf-formula"><div class="pf-formula__cap pf-mono">Formula</div>${explain}${preview}</div>`
}

/** One playing-config card (fields + match params + legs). `cat` present → per-category card
 *  tagged with data-cat; absent → the shared "same for all" card. Epic #143 (S4): a `bracket`
 *  (solo tabellone) event hides the group-only inputs — Andata/ritorno + the finals-format row
 *  (its bracket is auto-seeded from the participants, not from gironi). SP-B1: appends the live formula. */
function playCard(cc: CategorySchedule, locked: boolean, formats: CustomFinalsFormat[], cat: string | undefined, bracket: boolean, count: number, groups: number, festival = false): string {
  const dis = locked ? 'disabled' : ''
  const legsField = (bracket || festival) ? '' : `<div class="pf-field" style="margin-bottom:0"><label>Andata/ritorno</label><select class="cfg-legs" ${dis}>
        <option value="SINGLE" ${cc.legs === 'SINGLE' ? 'selected' : ''}>Solo andata</option>
        <option value="HOME_AWAY" ${cc.legs === 'HOME_AWAY' ? 'selected' : ''}>Andata e ritorno</option>
      </select></div>`
  // finali-formule SP-A2: 3rd/4th-place toggle for knockout brackets.
  const thirdPlace = `<label class="pf-switch cfg-thirdplace-w" style="margin-top:var(--space-sm)"><input type="checkbox" class="cfg-thirdplace" ${cc.finalsThirdPlace ? 'checked' : ''} ${dis} /> Includi finale 3º/4º posto</label>`
  // Festival: a single "matches per team" input, no finals config.
  const festivalField = festival ? `<div class="pf-field" style="margin-bottom:0"><label>Incontri per squadra</label><input class="cfg-festivalMatchesPerTeam" type="number" min="1" value="${cc.festivalMatchesPerTeam ?? 3}" ${dis} /></div>` : ''
  const finalsRow = festival
    ? ''
    : bracket
    ? thirdPlace // solo tabellone: the bracket auto-seeds from participants; only the 3rd-place option applies
    : `<div class="pf-row" style="justify-content:flex-start;gap:var(--space-md)">
      <div class="pf-field" style="margin-bottom:0"><label>Fase finale</label><select class="cfg-finalsType" ${dis}>
        <option value=""${!cc.finalsType && !cc.finalsFormatId ? ' selected' : ''}>Nessuna</option>
        ${FINALS_TYPES.map((t) => `<option value="${t}" ${cc.finalsType === t && !cc.finalsFormatId ? 'selected' : ''}>${esc(FINALS_TYPE_LABEL[t])}</option>`).join('')}
        ${formats.length ? `<optgroup label="Personalizzati">${formats.map((f) => `<option value="format:${esc(f.id)}" ${cc.finalsFormatId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</optgroup>` : ''}
      </select></div>
      <div class="pf-field" style="margin-bottom:0"><label>Squadre al tabellone</label><input class="cfg-finalsTeamsToBracket" type="number" min="2" step="2" value="${cc.finalsTeamsToBracket ?? ''}" placeholder="Gironi + girone finale" ${dis} /></div>
      <div class="pf-field" style="margin-bottom:0"><label>Qualificati per girone</label><input class="cfg-qualPerGroup" type="number" min="1" max="4" value="${cc.finalsQualifiersPerGroup ?? ''}" placeholder="Tabellone da gironi" ${dis} /></div>
    </div>
    ${thirdPlace}`
  return `<div class="pf-card js-playcard"${cat ? ` data-cat="${esc(cat)}"` : ''} style="background:var(--color-surface-sunken)">
    ${cat ? `<h3 class="pf-h4" style="margin-top:0">${esc(cat)}</h3>` : ''}
    <div class="pf-field"><label>Campi (separati da virgola)</label>
      <input class="cfg-fields" value="${esc(cc.fields.join(', '))}" placeholder="es. Campo A, Campo B" ${dis} /></div>
    <div class="pf-row" style="justify-content:flex-start;gap:var(--space-md)">
      <div class="pf-field" style="margin-bottom:0"><label>N. tempi</label><input class="cfg-periods" type="number" min="1" value="${cc.periods}" ${dis} /></div>
      <div class="pf-field" style="margin-bottom:0"><label>Durata (min)</label><input class="cfg-periodMinutes" type="number" min="1" value="${cc.periodMinutes}" ${dis} /></div>
      <div class="pf-field" style="margin-bottom:0"><label>Pausa (min)</label><input class="cfg-breakMinutes" type="number" min="0" value="${cc.breakMinutes}" ${dis} /></div>
      ${legsField}
      ${festivalField}
    </div>
    ${finalsRow}
    ${festival ? '' : `<div class="js-formula">${renderFormula(cc, bracket, count, groups)}</div>`}
  </div>`
}

/** A representative team count for the shared "same for all" card = the busiest category. */
const repCount = (teamsByCat: Record<string, number>): number => Math.max(0, ...Object.values(teamsByCat))

function renderConfigBody(mode: 'all' | 'per', config: ScheduleConfig, categorie: string[], locked: boolean, formats: CustomFinalsFormat[], bracket: boolean, teamsByCat: Record<string, number>, festival = false): string {
  const groups = config.groupsCount || 1
  if (mode === 'all') return playCard(defaultCat(config), locked, formats, undefined, bracket, repCount(teamsByCat), groups, festival)
  return categorie.map((c) => playCard(config.byCategory?.[c] ?? defaultCat(config), locked, formats, c, bracket, teamsByCat[c] ?? 0, groups, festival)).join('')
}

function globalCard(config: ScheduleConfig, locked: boolean, bracket: boolean, festival = false): string {
  const dis = locked ? 'disabled' : ''
  const hint = festival
    ? 'Gli slot per giornata sono calcolati automaticamente. Ogni squadra gioca il numero di incontri impostato, senza classifiche né finali.'
    : bracket
    ? 'Gli slot per giornata sono calcolati automaticamente. Il <b>tabellone</b> è generato dai partecipanti iscritti (eliminazione diretta).'
    : 'Gli slot per giornata sono calcolati automaticamente per far stare tutte le partite nei giorni dell\'evento. I gironi si compongono nel tab <b>Gironi</b>.'
  // Festival has no finals — hide the finals/bracket date field.
  const dateField = festival ? '' : `<div class="pf-field" style="margin-bottom:0"><label>Data ${bracket ? 'tabellone' : 'finali'}</label><input id="finalsDate" type="date" value="${esc(config.finalsDate ?? '')}" ${dis} /></div>`
  return `<div class="pf-card"><h2 class="pf-h3">Finestra impianto</h2>
    <div class="pf-row" style="justify-content:flex-start;gap:var(--space-md)">
      <div class="pf-field" style="margin-bottom:0"><label>Inizio giornata</label><input id="dailyStart" type="time" value="${esc(config.dailyStart)}" ${dis} /></div>
      ${dateField}
    </div>
    ${festival ? `<label class="pf-switch" style="margin-top:var(--space-sm)"><input type="checkbox" id="festivalUsePools" ${config.festivalUsePools ? 'checked' : ''} ${dis} /> Suddividi in pool (le squadre giocano dentro il pool — componili nel tab <b>Pool</b>)</label>` : ''}
    <p class="pf-muted" style="margin:var(--space-sm) 0 0">${hint}</p></div>`
}

function configSection(config: ScheduleConfig, categorie: string[], status: ScheduleView['status'], formats: CustomFinalsFormat[], bracket: boolean, teamsByCat: Record<string, number>, festival = false): string {
  const locked = isLocked(status)
  const mode = config.byCategory ? 'per' : 'all'
  return `${globalCard(config, locked, bracket, festival)}
    <div class="pf-card">
      <h2 class="pf-h3">Config di gioco</h2>
      <label class="pf-switch"><input type="checkbox" id="sameForAll" ${mode === 'all' ? 'checked' : ''} ${locked ? 'disabled' : ''} /> Stessa config di gioco per tutte le categorie</label>
      <div id="cfgbody" style="margin-top:var(--space-md)">${renderConfigBody(mode, config, categorie, locked, formats, bracket, teamsByCat, festival)}</div>
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

const filterMatches = (matches: ScheduledMatchView[], selCat: string, selGir: string, selPhase = 'ALL'): ScheduledMatchView[] =>
  filterCalendarMatches(matches, selCat, selGir, selPhase)

/** Calendar card with Category + (Gironi | Finali) + dynamic phase filter tabs — shared UX with E3/director. */
function calendarCard(matches: ScheduledMatchView[], selCat: string, selGir: string): string {
  // Festival (non-competitive): no gironi/finali — plain list, no phase filter.
  const isFestival = matches.some((m) => m.phase === 'FESTIVAL')
  const gtabs = calendarGironeTabs(matches, selCat)
  return `<div class="pf-card"><div class="pf-row" style="justify-content:space-between;align-items:center"><h2 class="pf-h3" style="margin:0">Calendario</h2>
      <button type="button" class="pf-btn pf-btn--ghost js-dl-cal">⬇ Scarica calendario (.xls)</button></div>
    <div id="cal-cattabs">${renderTabs(categoryKeys(matches).map((c) => ({ key: c, label: c })), selCat)}</div>
    <div id="cal-girtabs">${isFestival ? '' : renderTabs(gtabs, selGir)}</div>
    <div id="cal-phasetabs"></div>
    <div id="editmatch"></div>
    <div id="calbody">${renderCalendar(filterMatches(matches, selCat, selGir), catName, true)}</div>
  </div>`
}

/** Per-field director links (S25): the organizer shares one link per field; that director
 *  reports only that field's results from the phone. */
/** One director link PER CATEGORY (was per field). Each link is pre-generated on mount and shown in
 *  the shared share-link control (URL + Copia + Apri), the same graphic as the enrollment link. */
function directorCard(event: EventDetail, matches: ScheduledMatchView[]): string {
  const cats = event.categorie?.length ? event.categorie : [...new Set(matches.map((m) => m.categoryId))]
  if (!cats.length) return ''
  const rows = cats.map((c) => `<div class="js-dirlink-row" data-cat="${esc(c)}">${renderShareLink({ label: `Categoria ${c}` , url: '' })}</div>`).join('')
  return `<div class="pf-card"><h2 class="pf-h3">Direttori</h2>
    <p class="pf-muted">Un link per categoria: invialo al direttore, che dal telefono inserirà i risultati di quella categoria (con filtro per campo).</p>
    ${rows}</div>`
}

export function renderSchedule(data: ScheduleData): string {
  const { event, schedule, matches } = data
  const bracket = event.format === 'bracket'
  const festival = event.format === 'festival'
  const calendar = schedule.status === 'NONE' ? '' : calendarCard(matches, categoryKeys(matches)[0] ?? '', 'ALL')
  const directors = schedule.status === 'NONE' ? '' : directorCard(event, matches)
  return workspaceShell(event, 'schedule',
    `<div id="err"></div>${configSection(schedule.config, event.categorie, schedule.status, data.finalsFormats, bracket, data.teamsByCat, festival)}${actionsCard(schedule.status)}${calendar}${directors}`)
}

export const scheduleScreen: Screen<ScheduleData> = {
  load: async (ctx, p) => {
    const [event, schedule, matches, finalsFormats, confirmed] = await Promise.all([
      ctx.client.o3.getEvent(p.id), ctx.client.o7.getSchedule(p.id), ctx.client.o7.getMatches(p.id),
      ctx.client.o7.listFinalsFormats().catch(() => [] as CustomFinalsFormat[]),
      ctx.client.o5.listRegistrations(p.id, 'Confirmed').catch(() => []),
    ])
    // SP-B1: confirmed team/player count per category — drives the formula preview's numbers.
    const teamsByCat: Record<string, number> = {}
    for (const c of event.categorie) teamsByCat[c] = confirmed.filter((r) => r.categoria === c).length
    return { event, schedule, matches, finalsFormats, teamsByCat }
  },
  render: renderSchedule,
  mount(root, ctx: ViewCtx, data) {
    const id = data.event.sportEventId
    const err = root.querySelector('#err')!

    // Calendar with category/girone filter tabs (S23); its redraw rewires the per-match
    // Risultato/Modifica buttons. Works in every status (incl. APPROVED/PUBLISHED).
    wireCalendar()
    wireDirectorLinks()
    // Download the calendar as .xls (also pulls the confirmed teams for the "Squadre iscritte" sheet).
    root.querySelector<HTMLButtonElement>('.js-dl-cal')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLButtonElement
      void withPending(btn, async () => {
        const regs = await ctx.client.o5.listRegistrations(id, 'Confirmed').catch(() => [])
        const teams = regs.map((r) => ({ categoria: r.categoria, name: r.teamName ?? r.participantRef }))
        downloadXls(`${data.event.name ?? data.event.sport}-calendario`, calendarSheets(data.event, data.matches, teams))
      })
    })
    if (isLocked(data.schedule.status)) { wireStatus(); return }

    const categorie = data.event.categorie
    const bracket = data.event.format === 'bracket'
    const festival = data.event.format === 'festival'
    const groups = data.schedule.config.groupsCount || 1
    const cfgbody = root.querySelector('#cfgbody')!
    const sameForAll = root.querySelector<HTMLInputElement>('#sameForAll')
    const mode = (): 'all' | 'per' => (sameForAll?.checked ? 'all' : 'per')

    // SP-B1: recompute a card's live formula preview whenever any of its inputs change.
    const wireFormula = () => {
      cfgbody.querySelectorAll<HTMLElement>('.js-playcard').forEach((card) => {
        const redraw = () => {
          const holder = card.querySelector('.js-formula'); if (!holder) return
          const cat = card.getAttribute('data-cat')
          const count = cat ? (data.teamsByCat[cat] ?? 0) : repCount(data.teamsByCat)
          holder.innerHTML = renderFormula(readCard(card), bracket, count, groups)
        }
        card.addEventListener('input', redraw)
        card.addEventListener('change', redraw)
      })
    }
    sameForAll?.addEventListener('change', () => { cfgbody.innerHTML = renderConfigBody(mode(), data.schedule.config, categorie, false, data.finalsFormats, bracket, data.teamsByCat, festival); wireFormula() })

    const readCard = (el: Element): CategorySchedule => {
      const val = (s: string) => el.querySelector<HTMLInputElement>(s)?.value ?? ''
      const num = (s: string, fb: number) => { const v = Number(val(s)); return Number.isFinite(v) && v > 0 ? v : fb }
      // The "Fase finale" select mixes built-ins (value = FinalsType) and custom formats (value =
      // `format:<id>`). A custom format sets finalsFormatId and overrides finalsType.
      const finalsSel = el.querySelector<HTMLSelectElement>('.cfg-finalsType')?.value || ''
      const finalsFormatId = finalsSel.startsWith('format:') ? finalsSel.slice('format:'.length) : undefined
      const finalsType = (!finalsFormatId && finalsSel ? finalsSel : undefined) as FinalsType | undefined
      const bracket = Number(val('.cfg-finalsTeamsToBracket'))
      const qualPerGroup = Number(val('.cfg-qualPerGroup'))
      const thirdPlace = el.querySelector<HTMLInputElement>('.cfg-thirdplace')?.checked
      return {
        fields: textToFields(val('.cfg-fields')),
        periods: num('.cfg-periods', 2), periodMinutes: num('.cfg-periodMinutes', 20),
        breakMinutes: Number(val('.cfg-breakMinutes')) || 0,
        legs: el.querySelector<HTMLSelectElement>('.cfg-legs')?.value === 'HOME_AWAY' ? 'HOME_AWAY' : 'SINGLE',
        ...(el.querySelector<HTMLInputElement>('.cfg-festivalMatchesPerTeam') ? { festivalMatchesPerTeam: num('.cfg-festivalMatchesPerTeam', 3) } : {}),
        // Finals format per category; only include the fields that are set (avoid undefined noise).
        ...(finalsFormatId ? { finalsFormatId } : {}),
        ...(finalsType ? { finalsType, finalsEnabled: true } : {}),
        ...(Number.isFinite(bracket) && bracket >= 2 ? { finalsTeamsToBracket: Math.floor(bracket) } : {}),
        ...(Number.isFinite(qualPerGroup) && qualPerGroup >= 1 ? { finalsQualifiersPerGroup: Math.floor(qualPerGroup) } : {}),
        ...(thirdPlace ? { finalsThirdPlace: true } : {}),
      }
    }
    const buildConfig = (): { config?: ScheduleConfig; error?: string } => {
      const dailyStart = root.querySelector<HTMLInputElement>('#dailyStart')?.value || '09:00'
      // S12: empty → undefined so the o7 generator defaults finalsDate to the event's last day.
      const finalsDate = root.querySelector<HTMLInputElement>('#finalsDate')?.value || undefined
      // slotsPerDay is derived automatically by the o7 generator (fits all matches across the
      // event days) — no longer a form input.
      // groupsCount is only the auto-split fallback for events with no composed gironi (set in
      // the Gironi tab); it's no longer a calendar-screen input. Preserve the stored value.
      const groupsCount = data.schedule.config.groupsCount || 1
      // Slice B (festival pools) + Slice C (finalissima field) — event-level extras.
      const upEl = root.querySelector<HTMLInputElement>('#festivalUsePools')
      const extra = {
        ...(upEl ? { festivalUsePools: upEl.checked } : {}),
        ...(root.querySelector<HTMLInputElement>('#finalissimaField')?.value ? { finalissimaField: root.querySelector<HTMLInputElement>('#finalissimaField')!.value } : {}),
      }
      if (mode() === 'all') {
        const cc = readCard(cfgbody.querySelector('.js-playcard')!)
        if (!cc.fields.length) return { error: 'Indica almeno un campo.' }
        return { config: { ...cc, dailyStart, groupsCount, finalsDate, ...extra } }
      }
      const byCategory: Record<string, CategorySchedule> = {}
      for (const card of Array.from(cfgbody.querySelectorAll('.js-playcard'))) {
        const c = card.getAttribute('data-cat')!
        const cc = readCard(card)
        if (!cc.fields.length) return { error: `Indica almeno un campo per la categoria ${c}.` }
        byCategory[c] = cc
      }
      const first = Object.values(byCategory)[0] ?? defaultCat(data.schedule.config)
      return { config: { ...first, dailyStart, groupsCount, byCategory, finalsDate, ...extra } }
    }

    root.querySelector('#generate')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement
      const { config, error } = buildConfig()
      if (error || !config) { err.innerHTML = inlineError(error ?? 'Configurazione non valida.'); return }
      try { await withPending(btn, () => ctx.client.o7.generateSchedule(id, config)); ctx.refresh() }
      catch { err.innerHTML = inlineError('Generazione non riuscita. Riprova.') }
    })
    wireFormula()
    wireStatus()

    function wireStatus() {
      const approve = root.querySelector<HTMLButtonElement>('#approve')
      const publish = root.querySelector<HTMLButtonElement>('#publish')
      if (approve && !approve.disabled) approve.addEventListener('click', async () => {
        try { await withPending(approve, () => ctx.client.o7.approveSchedule(id)); ctx.refresh() }
        catch { err.innerHTML = inlineError('Approvazione non riuscita.') }
      })
      if (publish && !publish.disabled) publish.addEventListener('click', async () => {
        try { await withPending(publish, () => ctx.client.o7.publishSchedule(id)); ctx.refresh() }
        catch { err.innerHTML = inlineError('Pubblicazione non riuscita.') }
      })
    }

    /** Director links, one per category, PRE-GENERATED on mount: mint each category's token, fill its
     *  share-link control (URL + Copia + Apri), then wire the copy buttons. */
    async function wireDirectorLinks() {
      const rows = [...root.querySelectorAll<HTMLElement>('.js-dirlink-row')]
      await Promise.all(rows.map(async (row) => {
        const cat = row.dataset.cat!
        const input = row.querySelector<HTMLInputElement>('.pf-sharelink__url')
        const copyBtn = row.querySelector<HTMLButtonElement>('.js-sharelink-copy')
        const openA = row.querySelector<HTMLAnchorElement>('.js-sharelink-open')
        try {
          const { token } = await ctx.client.o7.getDirectorToken(id, cat)
          const url = `${ctx.e3BaseUrl}/e3/?token=${encodeURIComponent(token)}#/events/${encodeURIComponent(id)}/director`
          if (input) { input.value = url; input.placeholder = '' }
          if (copyBtn) { copyBtn.dataset.url = url; copyBtn.disabled = false }
          if (openA) { openA.href = url; openA.removeAttribute('aria-disabled'); openA.removeAttribute('tabindex') }
        } catch { if (input) input.placeholder = 'Errore, ricarica la pagina' }
      }))
      wireShareLinks(root)
    }

    /** S23: category + girone filter tabs above the calendar. Redraws the tab bars and the
     *  calendar body on each change, then rewires the per-match Risultato/Modifica buttons. */
    function wireCalendar() {
      const calbody = root.querySelector('#calbody'); if (!calbody) return
      const catbar = root.querySelector('#cal-cattabs')!
      const girbar = root.querySelector('#cal-girtabs')!
      const phasebar = root.querySelector('#cal-phasetabs')!
      let selCat = categoryKeys(data.matches)[0] ?? ''
      let selGir = 'ALL'
      let selPhase = 'ALL'
      // Festival (non-competitive): no gironi/finali — plain list, no phase filter.
      const isFestival = data.matches.some((m) => m.phase === 'FESTIVAL')
      function draw() {
        catbar.innerHTML = renderTabs(categoryKeys(data.matches).map((c) => ({ key: c, label: c })), selCat)
        catbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
          b.addEventListener('click', () => { selCat = b.dataset.key!; selGir = 'ALL'; selPhase = 'ALL'; draw() }))
        if (isFestival) {
          girbar.innerHTML = ''; phasebar.innerHTML = ''
        } else {
          const gtabs = calendarGironeTabs(data.matches, selCat)
          girbar.innerHTML = renderTabs(gtabs, selGir)
          girbar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
            b.addEventListener('click', () => { selGir = b.dataset.key!; selPhase = 'ALL'; draw() }))
          const phaseTabs = selGir === FINALS_TAB ? finalsPhaseTabs(data.matches, selCat) : []
          phasebar.innerHTML = phaseTabs.length ? `<div class="pf-tabs--sub">${renderTabs(phaseTabs, selPhase)}</div>` : ''
          phasebar.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) =>
            b.addEventListener('click', () => { selPhase = b.dataset.key!; draw() }))
        }
        calbody!.innerHTML = renderCalendar(filterMatches(data.matches, selCat, selGir, selPhase), catName, true)
        wireResult(); wireReschedule()
      }
      draw()
    }

    /** S10 + S26: per-match result entry & lifecycle. "Risultato" opens a panel showing the
     *  match status, a score stepper, and lifecycle actions: Inizia (SCHEDULED→LIVE), Salva
     *  (record, stays live), Salva e termina (record + finish → counts in standings), and the
     *  organizer-only Annulla gara. A cancelled match is read-only. Each action → refresh. */
    function wireResult() {
      const panel = root.querySelector('#editmatch')
      if (!panel) return
      root.querySelectorAll<HTMLButtonElement>('.js-resultmatch').forEach((btn) =>
        btn.addEventListener('click', () => openResult(btn.dataset.match!)))

      async function run(fn: () => Promise<unknown>, btn: HTMLButtonElement) {
        btn.disabled = true
        try { await fn(); ctx.refresh() }
        catch (e2: unknown) {
          const status = (e2 as { status?: number })?.status
          err.innerHTML = inlineError(status === 409 ? 'Operazione non valida per lo stato della partita.' : 'Operazione non riuscita. Riprova.')
          btn.disabled = false
        }
      }

      function openResult(matchId: string) {
        const m = data.matches.find((x) => x.id === matchId)
        if (!m) return
        const st = displayStatus(m)
        const head = `<h3 class="pf-h4" style="margin-top:0">Risultato · ${esc(m.home)} vs ${esc(m.away)} ${matchStatusBadge(m)}</h3>`
        if (st === 'CANCELLED') {
          panel!.innerHTML = `<div class="pf-card">${head}<p class="pf-muted">Gara annullata.</p>
            <div class="pf-row" style="justify-content:center;margin-top:var(--space-md)"><button type="button" class="pf-btn" id="rr-cancel">Chiudi</button></div></div>`
          panel!.querySelector('#rr-cancel')!.addEventListener('click', () => { panel!.innerHTML = '' })
          return
        }
        const finishLabel = st === 'FINISHED' ? 'Salva correzione' : 'Salva e termina'
        // Decree who advances when a knockout (FINAL) match ended level (rules applied offline).
        const isDrawnFinal = m.phase === 'FINAL' && st === 'FINISHED' && (m.homeScore ?? 0) === (m.awayScore ?? 0)
        const hn = esc(m.homeResolved ?? m.home), an = esc(m.awayResolved ?? m.away)
        const decideBlock = isDrawnFinal ? `<div style="margin-top:var(--space-md);text-align:center">
          <div class="pf-eyebrow" style="justify-content:center">Pareggio — chi passa?</div>
          <div class="pf-row" style="justify-content:center;gap:var(--space-sm);margin-top:var(--space-xs);flex-wrap:wrap">
            <button type="button" class="pf-btn${m.decidedWinner === 'HOME' ? ' pf-btn--primary' : ''}" id="rr-pass-home">${hn}</button>
            <button type="button" class="pf-btn${m.decidedWinner === 'AWAY' ? ' pf-btn--primary' : ''}" id="rr-pass-away">${an}</button>
          </div></div>` : ''
        panel!.innerHTML = `<div class="pf-card">${head}
          <div class="pf-row" style="justify-content:center;gap:var(--space-2xl);align-items:flex-end">
            ${renderStepper('home', m.homeResolved ?? m.home, m.homeScore ?? 0)}
            ${renderStepper('away', m.awayResolved ?? m.away, m.awayScore ?? 0)}
          </div>
          <div class="pf-row" style="justify-content:center;gap:var(--space-sm);margin-top:var(--space-md);flex-wrap:wrap">
            ${st === 'SCHEDULED' ? '<button type="button" class="pf-btn" id="rr-start">Inizia</button>' : ''}
            <button type="button" class="pf-btn pf-btn--primary" id="rr-finish">${finishLabel}</button>
            ${st === 'FINISHED' ? '' : '<button type="button" class="pf-btn" id="rr-save">Salva</button>'}
            <button type="button" class="pf-btn pf-btn--ghost" id="rr-void">Annulla gara</button>
            <button type="button" class="pf-btn" id="rr-cancel">Chiudi</button>
          </div>${decideBlock}</div>`
        wireSteppers(panel!)
        panel!.querySelector('#rr-pass-home')?.addEventListener('click', (e) => run(() => ctx.client.o7.decideWinner(id, matchId, 'HOME'), e.currentTarget as HTMLButtonElement))
        panel!.querySelector('#rr-pass-away')?.addEventListener('click', (e) => run(() => ctx.client.o7.decideWinner(id, matchId, 'AWAY'), e.currentTarget as HTMLButtonElement))
        const scores = () => ({ homeScore: readStepper(panel!, 'home'), awayScore: readStepper(panel!, 'away') })
        panel!.querySelector('#rr-cancel')!.addEventListener('click', () => { panel!.innerHTML = '' })
        panel!.querySelector('#rr-start')?.addEventListener('click', (e) => run(() => ctx.client.o7.startMatch(id, matchId), e.currentTarget as HTMLButtonElement))
        panel!.querySelector('#rr-save')?.addEventListener('click', (e) => run(() => ctx.client.o7.recordResult(id, matchId, scores()), e.currentTarget as HTMLButtonElement))
        panel!.querySelector('#rr-finish')!.addEventListener('click', (e) =>
          run(async () => { await ctx.client.o7.recordResult(id, matchId, scores()); await ctx.client.o7.finishMatch(id, matchId) }, e.currentTarget as HTMLButtonElement))
        panel!.querySelector('#rr-void')!.addEventListener('click', (e) => {
          if (!window.confirm(`Annullare la gara ${m.home} vs ${m.away}? Non conterà in classifica.`)) return
          run(() => ctx.client.o7.cancelMatch(id, matchId), e.currentTarget as HTMLButtonElement)
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
