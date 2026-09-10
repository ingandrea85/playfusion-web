import type { EventDetail, ScheduledMatchView, ResourceConfig, ResourcePlan } from '@playfusion/rest-client'
import { displayStatus, type XlsSheet, type XlsCell } from '@playfusion/app-shell'

/** Uniform, format-agnostic spreadsheet export of an event. Same columns for every event type
 *  (gironi / gironi+tabellone / solo tabellone / festival) — only what's filled changes. */

const STATO: Record<string, string> = { SCHEDULED: 'Programmata', LIVE: 'In corso', FINISHED: 'Terminata', CANCELLED: 'Annullata' }
const homeName = (m: ScheduledMatchView): string => m.homeResolved ?? m.home
const awayName = (m: ScheduledMatchView): string => m.awayResolved ?? m.away

/** Calendar export: a "Calendario" sheet (fixed columns) + a "Squadre iscritte" sheet when the
 *  confirmed teams are supplied. `teams` = confirmed registrations mapped to {categoria, name}. */
export function calendarSheets(event: EventDetail, matches: ScheduledMatchView[], teams: { categoria: string; name: string }[] = []): XlsSheet[] {
  const sorted = [...matches].sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time) || a.field.localeCompare(b.field))
  const rows: XlsCell[][] = sorted.map((m) => {
    const festival = m.phase === 'FESTIVAL'
    const fase = festival ? '' : m.phase === 'FINAL' ? `${m.bracketLabel ?? 'Finali'}${m.round ? ` · ${m.round}` : ''}` : m.groupLabel
    const st = displayStatus(m)
    const stato = festival ? (st === 'FINISHED' ? 'Giocata' : 'Da giocare') : (STATO[st] ?? '')
    const played = m.homeScore != null && m.awayScore != null
    const risultato = festival ? '' : (played ? `${m.homeScore}–${m.awayScore}` : '')
    return [m.day, m.time, m.field, m.categoryId, fase, homeName(m), awayName(m), risultato, stato]
  })
  const calendar: XlsSheet = { name: 'Calendario', headers: ['Giornata', 'Ora', 'Campo', 'Categoria', 'Fase', 'Casa', 'Ospite', 'Risultato', 'Stato'], rows }
  const sheets: XlsSheet[] = [calendar]
  if (teams.length) {
    const teamRows: XlsCell[][] = [...teams].sort((a, b) => a.categoria.localeCompare(b.categoria) || a.name.localeCompare(b.name)).map((t) => [t.categoria, t.name])
    sheets.push({ name: 'Squadre iscritte', headers: ['Categoria', 'Squadra'], rows: teamRows })
  }
  return sheets
}

/** Resources export: a "Turni" sheet (who's in which resource, when) + a "Risorse" config sheet + a
 *  "Gruppi e sequenza" sheet. Same shape whatever the event format. */
export function resourceSheets(_event: EventDetail, config: ResourceConfig, plan: ResourcePlan): XlsSheet[] {
  const nodeLabel = new Map((plan.nodes ?? []).map((n) => [n.nodeId, n.label]))
  const byId = new Map(config.resources.map((r) => [r.resourceId, r.name]))
  const nl = (id: string): string => nodeLabel.get(id) ?? byId.get(id) ?? id
  const served = (t: { served?: boolean; servedAt?: string }): string => (t.served ? `Servita ${t.servedAt ?? ''}`.trim() : '')

  const turni: XlsCell[][] = []
  for (const t of plan.turns) {
    const label = nl(t.nodeId)
    for (const s of t.slots) for (const tm of s.teams) turni.push([t.day, s.time, label, t.resourceName, tm.team, tm.size, served(tm)])
  }
  for (const f of plan.freeLists ?? []) {
    const label = nl(f.nodeId)
    for (const tm of f.teams) turni.push([f.day, '', label, '', tm.team, '', tm.served ? `Servita ${tm.servedAt ?? ''}`.trim() : 'Da servire'])
  }
  turni.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])) || String(a[2]).localeCompare(String(b[2])))
  const turniSheet: XlsSheet = { name: 'Turni', headers: ['Giornata', 'Ora', 'Nodo', 'Risorsa', 'Squadra', 'Persone', 'Stato'], rows: turni }

  const risorseSheet: XlsSheet = {
    name: 'Risorse', headers: ['Risorsa', 'Capienza (pers)', 'Occupazione (min)', 'Dopo (min)'],
    rows: config.resources.map((r) => [r.name, r.capacityPersons, r.occupancyMinutes, r.offsetMinutes]),
  }

  const seqRows: XlsCell[][] = []
  for (const g of config.groups ?? []) seqRows.push(['Gruppo', g.name, g.memberIds.map((id) => byId.get(id) ?? id).join(' · ')])
  for (const e of config.relations ?? []) seqRows.push(['Sequenza', `${nl(e.from)} → ${nl(e.to)}`, ''])
  const sequenzaSheet: XlsSheet = { name: 'Gruppi e sequenza', headers: ['Tipo', 'Elemento', 'Dettaglio'], rows: seqRows }

  return [turniSheet, risorseSheet, sequenzaSheet]
}
