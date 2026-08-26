import type { CategoryFinalStanding, EventDetail, Playbook, FinalsType, GironiMap, RegistrationView, RegistrationWindowView, ScheduledMatchView, ScheduleView } from '@playfusion/rest-client'
import { renderOrganizerWorkspace, esc, type WorkspaceTab } from '@playfusion/app-shell'
import type { Screen } from '../view.js'
import { criterionLabel } from './tiebreak.js'
import { derivePhase, enrollmentByCategory, eventSummary, matchProgress, progressByDay, progressByField, type EventPhase } from './dashboard-data.js'
import { capacityBars, dayColumns, donut, statTiles } from './dashboard-charts.js'

const FINALS_LABEL: Record<FinalsType, string> = {
  PLACEMENT: 'Tabellone eliminazione',
  SINGLE_GROUP_CROSSOVER: 'Girone unico · coppie',
  SPLIT_GROUP_FINALS: 'Gironi + girone finale',
}
const SCHEDULE_LABEL: Record<ScheduleView['status'], string> = {
  NONE: 'Da generare', GENERATED: 'Generato', APPROVED: 'Approvato', PUBLISHED: 'Pubblicato',
}

export const workspaceTabs = (id: string): WorkspaceTab[] => {
  const e = encodeURIComponent(id)
  return [
    { key: 'overview', label: 'Panoramica', href: `#/events/${e}` },
    { key: 'competition', label: 'Competizione', href: `#/events/${e}/competition` },
    { key: 'categorie', label: 'Categorie', href: `#/events/${e}/categorie` },
    { key: 'gironi', label: 'Gironi', href: `#/events/${e}/gironi` },
    { key: 'schedule', label: 'Calendario', href: `#/events/${e}/schedule` },
    { key: 'standings', label: 'Classifiche', href: `#/events/${e}/standings` },
    { key: 'finals', label: 'Finali', href: `#/events/${e}/finals` },
    { key: 'resources', label: 'Risorse', href: `#/events/${e}/resources` },
    { key: 'announcements', label: 'Avvisi', href: `#/events/${e}/announcements` },
    { key: 'enroll', label: 'Iscrizioni', href: `#/events/${e}/enroll` },
    { key: 'participants', label: 'Partecipanti', href: `#/events/${e}/participants` },
  ]
}

const PLAYBOOK_LABEL: Record<Playbook, string> = {
  'PB-1': 'PB-1 · Iscrizione con inviti',
  'PB-2': 'PB-2 · Inserimento diretto squadre',
}

/** Hero title = the event name when set, else the legacy `sport · categorie` composite. */
export function eventTitle(e: EventDetail): string {
  return e.name ?? `${e.sport} · ${e.categorie.join(', ')}`
}

const heroMeta = (e: EventDetail): string => {
  const start = e.startTime ? `${e.dates.from} ${e.startTime}` : e.dates.from
  return `${e.sport} · ${start} → ${e.dates.to}`
}

const PHASE_LABEL: Record<EventPhase, string> = { PREP: 'In preparazione', LIVE: 'In corso', DONE: 'Concluso' }
const PHASE_MOD: Record<EventPhase, 'prep' | 'live' | 'done'> = { PREP: 'prep', LIVE: 'live', DONE: 'done' }

export function workspaceShell(event: EventDetail, activeTab: string, body: string, phase?: EventPhase): string {
  const hero = renderOrganizerWorkspace(
    { name: esc(eventTitle(event)), meta: esc(heroMeta(event)), phaseLabel: phase ? PHASE_LABEL[phase] : undefined, phaseMod: phase ? PHASE_MOD[phase] : undefined },
    workspaceTabs(event.sportEventId), activeTab,
  )
  return `${hero}<main class="pf-container">${body}</main>`
}
const shell = workspaceShell

const row = (label: string, value: string): string =>
  `<div class="pf-deflist__row"><dt>${esc(label)}</dt><dd>${value}</dd></div>`

/** Read-only tie-break policy display: active criteria in order, points implied first. */
function tieBreakList(event: EventDetail): string {
  const items = (event.tieBreak ?? []).map((c, i) => `<li>${i + 2}. ${esc(criterionLabel(c))}</li>`).join('')
  return `<ol class="pf-tbview"><li>1. Punti</li>${items}</ol>`
}

function configCard(event: EventDetail): string {
  return `<div class="pf-card">
    <dl class="pf-deflist">
      ${row('Nome', esc(event.name ?? '—'))}
      ${row('Sport', esc(event.sport))}
      ${row('Luogo', esc(event.location ?? '—'))}
      ${row('Inizio', esc(event.startTime ? `${event.dates.from} · ${event.startTime}` : event.dates.from))}
      ${row('Fine', esc(event.dates.to))}
      ${row('Playbook', `<span class="pf-badge">${esc(PLAYBOOK_LABEL[event.playbook])}</span>`)}
    </dl>
  </div>`
}

/** S16: data the phase-aware Panoramica dashboard band needs, gathered by the overview screen. */
export interface OverviewData {
  matches: ScheduledMatchView[]
  window: RegistrationWindowView | null
  finalStandings: CategoryFinalStanding[]
}

const dashCard = (title: string, body: string, wide = false): string =>
  `<div class="pf-card pf-dashcard${wide ? ' pf-dashcard--wide' : ''}"><h2 class="pf-h3">${esc(title)}</h2>${body}</div>`

/** Phase-aware chart band prepended to the Panoramica — only the current phase's charts. */
export function dashboardBand(data: OverviewData): { phase: EventPhase; html: string } {
  const phase = derivePhase(data.matches)
  let cards: string
  if (phase === 'PREP') {
    const rows = enrollmentByCategory(data.window).map((r) => ({
      label: r.categoria, value: r.count, max: r.cap,
      state: r.cap > 0 && r.count >= r.cap ? ('full' as const) : undefined,
    }))
    cards = dashCard('Iscrizioni per categoria', rows.length ? capacityBars(rows) : '<p class="pf-muted">Nessuna iscrizione ancora.</p>', true)
  } else if (phase === 'LIVE') {
    const mp = matchProgress(data.matches)
    const fields = progressByField(data.matches).map((f) => ({
      label: f.field, value: f.played, max: f.total,
      note: f.behind ? `${f.played}/${f.total} · indietro` : `${f.played}/${f.total}`,
      state: f.behind ? ('behind' as const) : undefined,
    }))
    cards = dashCard('Avanzamento partite', donut(mp.pct, `${mp.pct}%`, `${mp.played}/${mp.total} partite`))
      + dashCard('Partite per giornata', dayColumns(progressByDay(data.matches)))
      + dashCard('Avanzamento per campo', fields.length ? capacityBars(fields) : '<p class="pf-muted">Nessun campo assegnato.</p>')
  } else {
    const s = eventSummary(data.matches, data.finalStandings)
    const tiles = statTiles([
      { big: String(s.matches), label: 'Partite giocate' },
      { big: String(s.goals), label: 'Gol totali' },
      { big: String(s.champions.length), label: s.champions.length === 1 ? 'Campione' : 'Campioni' },
    ])
    const champs = s.champions.length
      ? `<p class="pf-dashchamp">🏆 ${s.champions.map((c) => `${esc(c.team)} <span class="pf-muted">(${esc(c.categoryId)})</span>`).join(' · ')}</p>`
      : ''
    cards = dashCard('Riepilogo', tiles + champs, true)
  }
  return { phase, html: `<section class="pf-dashband">${cards}</section>` }
}

export function renderWorkspace(event: EventDetail, activeTab: string, overview?: OverviewData): string {
  const band = overview ? dashboardBand(overview) : null
  return shell(event, activeTab, `${band?.html ?? ''}${configCard(event)}
    <div class="pf-card">
      <h2 class="pf-h3">Criteri di spareggio</h2>
      ${tieBreakList(event)}
    </div>`, band?.phase)
}

export function renderCompetition(event: EventDetail, activeTab = 'competition'): string {
  return shell(event, activeTab, `<div class="pf-card">
    <h2 class="pf-h3">Configurazione competizione</h2>
    <dl class="pf-deflist">
      ${row('Playbook', `<span class="pf-badge">${esc(PLAYBOOK_LABEL[event.playbook])}</span>`)}
    </dl>
    <h3 class="pf-h4">Criteri di spareggio</h3>
    ${tieBreakList(event)}
    <p class="pf-muted">La modifica dei criteri avviene alla creazione dell'evento. La <b>fase finale</b> si configura per categoria nel tab <b>Calendario</b>.</p>
  </div>`)
}

/** S13: Categorie is a per-category dashboard — confirmed teams, gironi, finals format — plus the
 *  global calendar status. Read-only summary; the actual work lives in Gironi/Calendario/Iscrizioni. */
export interface CategorieData { event: EventDetail; confirmed: RegistrationView[]; gironi: GironiMap; schedule: ScheduleView }

export function renderCategorie(data: CategorieData, activeTab = 'categorie'): string {
  const { event, confirmed, gironi, schedule } = data
  const teams = (c: string): number => confirmed.filter((r) => r.categoria === c && r.status === 'Confirmed').length
  const groups = (c: string): number => gironi[c]?.groups.filter((g) => g.teams.length).length ?? 0
  const finals = (c: string): string => {
    const t = schedule.config.byCategory?.[c]?.finalsType ?? schedule.config.finalsType
    return t ? esc(FINALS_LABEL[t]) : '<span class="pf-muted">—</span>'
  }
  const rows = event.categorie.map((c) => `<tr>
    <td>${esc(c)}</td><td>${teams(c)}</td><td>${groups(c) || '<span class="pf-muted">—</span>'}</td><td>${finals(c)}</td>
  </tr>`).join('')
  const body = event.categorie.length
    ? `<table class="pf-table"><thead><tr><th>Categoria</th><th>Squadre</th><th>Gironi</th><th>Formato finali</th></tr></thead><tbody>${rows}</tbody></table>
       <p class="pf-muted" style="margin-top:var(--space-sm)">Calendario: <b>${esc(SCHEDULE_LABEL[schedule.status])}</b>. Composizione gironi nel tab <b>Gironi</b>, formato finali nel tab <b>Calendario</b>.</p>`
    : `<div class="pf-muted">Nessuna categoria.</div>`
  return shell(event, activeTab, `<div class="pf-card"><h2 class="pf-h3">Categorie</h2>${body}</div>`)
}

/** Overview screen: the event is mandatory (its failure surfaces the error card); the dashboard
 *  inputs are best-effort — a schedule/window/finals that isn't ready yet must not blank the page. */
export const workspaceScreen: Screen<{ event: EventDetail; overview: OverviewData }> = {
  load: async (ctx, p) => {
    const event = await ctx.client.o3.getEvent(p.id)
    const [matches, window, finalStandings] = await Promise.all([
      ctx.client.o7.getMatches(p.id).catch(() => [] as ScheduledMatchView[]),
      ctx.client.o5.getRegistrationWindow(p.id).catch(() => null as RegistrationWindowView | null),
      ctx.client.o7.getFinalStandings(p.id).catch(() => [] as CategoryFinalStanding[]),
    ])
    return { event, overview: { matches, window, finalStandings } }
  },
  render: ({ event, overview }) => renderWorkspace(event, 'overview', overview),
}

export const competitionScreen: Screen<EventDetail> = {
  load: (ctx, p) => ctx.client.o3.getEvent(p.id),
  render: (e) => renderCompetition(e),
}

export const categorieScreen: Screen<CategorieData> = {
  load: async (ctx, p) => {
    const [event, confirmed, gironi, schedule] = await Promise.all([
      ctx.client.o3.getEvent(p.id), ctx.client.o5.listRegistrations(p.id, 'Confirmed'), ctx.client.o3.getGironi(p.id), ctx.client.o7.getSchedule(p.id),
    ])
    return { event, confirmed, gironi, schedule }
  },
  render: (d) => renderCategorie(d),
}
