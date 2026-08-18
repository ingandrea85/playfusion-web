import type { EventDetail, Playbook } from '@playfusion/rest-client'
import { renderOrganizerWorkspace, esc, type WorkspaceTab } from '@playfusion/app-shell'
import type { Screen } from '../view.js'
import { criterionLabel } from './tiebreak.js'

export const workspaceTabs = (id: string): WorkspaceTab[] => {
  const e = encodeURIComponent(id)
  return [
    { key: 'overview', label: 'Panoramica', href: `#/events/${e}` },
    { key: 'competition', label: 'Competizione', href: `#/events/${e}/competition` },
    { key: 'categorie', label: 'Categorie', href: `#/events/${e}/categorie` },
    { key: 'schedule', label: 'Calendario', href: `#/events/${e}/schedule` },
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

export function workspaceShell(event: EventDetail, activeTab: string, body: string): string {
  const hero = renderOrganizerWorkspace(
    { name: esc(eventTitle(event)), meta: esc(heroMeta(event)) },
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

export function renderWorkspace(event: EventDetail, activeTab: string): string {
  return shell(event, activeTab, `${configCard(event)}
    <div class="pf-card">
      <h2 class="pf-h3">Criteri di spareggio</h2>
      ${tieBreakList(event)}
    </div>`)
}

export function renderCompetition(event: EventDetail, activeTab = 'competition'): string {
  return shell(event, activeTab, `<div class="pf-card">
    <h2 class="pf-h3">Configurazione competizione</h2>
    <dl class="pf-deflist">
      ${row('Playbook', `<span class="pf-badge">${esc(PLAYBOOK_LABEL[event.playbook])}</span>`)}
    </dl>
    <h3 class="pf-h4">Criteri di spareggio</h3>
    ${tieBreakList(event)}
    <p class="pf-muted">La modifica dei criteri avviene alla creazione dell'evento (o negli slice gironi/finali).</p>
  </div>`)
}

export function renderCategorie(event: EventDetail, activeTab = 'categorie'): string {
  const items = event.categorie.map(c => `<li class="pf-cat"><span class="pf-cat__label">${esc(c)}</span></li>`).join('')
  const body = event.categorie.length
    ? `<ul class="pf-catlist">${items}</ul>`
    : `<div class="pf-muted">Nessuna categoria.</div>`
  return shell(event, activeTab, `<div class="pf-card"><h2 class="pf-h3">Categorie</h2>${body}</div>`)
}

export const workspaceScreen: Screen<EventDetail> = {
  load: (ctx, p) => ctx.client.o3.getEvent(p.id),
  render: (e) => renderWorkspace(e, 'overview'),
}

export const competitionScreen: Screen<EventDetail> = {
  load: (ctx, p) => ctx.client.o3.getEvent(p.id),
  render: (e) => renderCompetition(e),
}

export const categorieScreen: Screen<EventDetail> = {
  load: (ctx, p) => ctx.client.o3.getEvent(p.id),
  render: (e) => renderCategorie(e),
}
