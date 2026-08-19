import { esc } from './html.js'

export function renderOrganizerTopbar(active: string): string {
  const link = (href: string, label: string, key: string) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`
  return `<header class="pf-topbar">
    <a class="pf-brand" href="#/">play<b>fusion</b><small>Organizer</small></a>
    <nav>${link('#/', 'Eventi', 'dashboard')}</nav>
  </header>`
}

export interface WorkspaceHeader { name: string; meta: string; phaseLabel?: string; phaseMod?: 'prep' | 'live' | 'done' }
export interface WorkspaceTab { key: string; label: string; href: string }

export function renderOrganizerWorkspace(h: WorkspaceHeader, tabs: WorkspaceTab[], activeKey: string): string {
  const phase = h.phaseLabel ? `<span class="pf-wphase pf-wphase--${h.phaseMod ?? 'prep'}">${h.phaseLabel}</span>` : ''
  const nav = tabs.map((t) => `<a class="pf-wtab${t.key === activeKey ? ' pf-wtab--active' : ''}" href="${t.href}">${t.label}</a>`).join('')
  return `<div class="pf-whero">
    <div class="pf-whero__inner">${phase}<h1>${h.name}</h1><div class="pf-mono pf-muted">${h.meta}</div></div>
    <nav class="pf-wtabs">${nav}</nav>
  </div>`
}

export function renderPublicTopbar(brandHtml?: string): string {
  return `<header class="pf-publicbar"><a class="pf-brand" href="#/">${brandHtml ?? 'play<b>fusion</b>'}</a></header>`
}

/** Structural shape of a scheduled match for rendering — kept local so app-shell needs
 *  no dependency on rest-client (rest-client's ScheduledMatchView satisfies it). `id` is
 *  only needed in editable mode (E1 reschedule — S9). */
export interface CalendarMatch { id?: string; categoryId: string; groupLabel: string; day: string; time: string; field: string; home: string; away: string; homeScore?: number | null; awayScore?: number | null }

const played = (m: CalendarMatch): boolean =>
  m.homeScore !== null && m.homeScore !== undefined && m.awayScore !== null && m.awayScore !== undefined

/** Calendar rendering — grouped by day, matches sorted by time then field. Shared by the E1
 *  organizer schedule screen and the E3 public calendar so the two never drift. `editable`
 *  (S9) adds a per-match "Modifica" button for the E1 reschedule editor; it defaults off so
 *  E3 stays read-only. */
export function renderCalendar(matches: CalendarMatch[], catName: (id: string) => string, editable = false): string {
  if (!matches.length) return `<p class="pf-muted">Nessuna partita in calendario.</p>`
  const days = [...new Set(matches.map((m) => m.day))].sort()
  return days.map((day) => {
    const rows = matches.filter((m) => m.day === day)
      .sort((a, b) => a.time.localeCompare(b.time) || a.field.localeCompare(b.field))
      .map((m) => `<li class="pf-match">
        <span class="pf-match__time pf-mono">${esc(m.time)}</span>
        <span class="pf-match__field pf-mono">${esc(m.field)}</span>
        <span class="pf-match__cat">${esc(catName(m.categoryId))} · ${esc(m.groupLabel)}</span>
        <span class="pf-match__teams">${esc(m.home)} <b>${played(m) ? `${esc(m.homeScore)}–${esc(m.awayScore)}` : 'vs'}</b> ${esc(m.away)}</span>
        ${editable ? `<span class="pf-match__actions"><button type="button" class="pf-btn pf-btn--ghost js-resultmatch" data-match="${esc(m.id ?? '')}">Risultato</button><button type="button" class="pf-btn pf-btn--ghost js-editmatch" data-match="${esc(m.id ?? '')}">Modifica</button></span>` : ''}
      </li>`).join('')
    return `<div class="pf-calday"><div class="pf-calday__head pf-mono">${esc(day)}</div><ul class="pf-callist">${rows}</ul></div>`
  }).join('')
}

/** Category/girone filter tabs (S23) — shared by the calendar & standings surfaces (E1+E3).
 *  Stateless: screens read `data-key` on click and re-render. Scrollable on mobile. */
export interface Tab { key: string; label: string }
export function renderTabs(items: Tab[], activeKey: string): string {
  if (!items.length) return ''
  return `<nav class="pf-tabs">${items.map((t) =>
    `<button type="button" class="pf-tab${t.key === activeKey ? ' pf-tab--active' : ''}" data-key="${esc(t.key)}" aria-selected="${t.key === activeKey}">${esc(t.label)}</button>`).join('')}</nav>`
}
/** Distinct categoryIds in first-seen order (from matches or standings groups). */
export function categoryKeys(items: Array<{ categoryId: string }>): string[] {
  const out: string[] = []
  for (const i of items) if (!out.includes(i.categoryId)) out.push(i.categoryId)
  return out
}
/** Distinct groupLabels of one category, first-seen order. */
export function groupKeys(items: Array<{ categoryId: string; groupLabel: string }>, categoryId: string): string[] {
  const out: string[] = []
  for (const i of items) if (i.categoryId === categoryId && !out.includes(i.groupLabel)) out.push(i.groupLabel)
  return out
}

/** Structural standings shapes (app-shell stays free of rest-client; its DTOs satisfy these). */
export interface StandingRowView { team: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; goalDiff: number; points: number }
export interface GroupStandingView { categoryId: string; groupLabel: string; rows: StandingRowView[] }

/** Standings tables, one per group (S10). Shared by the E1 Classifiche tab and the E3 public
 *  standings — read-only in both. Rows are pre-sorted by the caller (o7 standings engine). */
export function renderStandings(groups: GroupStandingView[], catName: (id: string) => string): string {
  if (!groups.length) return `<p class="pf-muted">Nessuna classifica: genera il calendario e inserisci i risultati.</p>`
  return groups.map((g) => {
    const rows = g.rows.map((r, i) => `<tr>
      <td class="pf-mono">${i + 1}</td><td>${esc(r.team)}</td>
      <td>${r.played}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td>
      <td>${r.goalsFor}</td><td>${r.goalsAgainst}</td><td>${r.goalDiff}</td><td><b>${r.points}</b></td>
    </tr>`).join('')
    return `<div class="pf-standings">
      <div class="pf-calday__head pf-mono">${esc(catName(g.categoryId))} · ${esc(g.groupLabel)}</div>
      <table class="pf-table"><thead><tr>
        <th>#</th><th>Squadra</th><th>PG</th><th>V</th><th>N</th><th>P</th><th>GF</th><th>GS</th><th>DR</th><th>Pti</th>
      </tr></thead><tbody>${rows}</tbody></table>
    </div>`
  }).join('')
}

export function renderCategoryTag(name: string, count: number, maxTeams: number): string {
  const full = maxTeams > 0 && count >= maxTeams
  // Only the enrolled-teams count (with the total when a cap is set); no progress bar.
  const cap = maxTeams > 0 ? `${count}/${maxTeams} squadre${full ? ' · completa' : ''}` : `${count} squadre`
  return `<li class="pf-cat${full ? ' pf-cat--full' : ''}">
    <span class="pf-cat__label">${esc(name)}</span>
    <div class="pf-cat__body"><div class="pf-cat__cap">${cap}</div></div>
  </li>`
}
