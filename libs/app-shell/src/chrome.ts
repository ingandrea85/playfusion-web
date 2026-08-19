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
export interface CalendarMatch { id?: string; categoryId: string; groupLabel: string; day: string; time: string; field: string; home: string; away: string }

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
        <span class="pf-match__teams">${esc(m.home)} <b>vs</b> ${esc(m.away)}</span>
        ${editable ? `<button type="button" class="pf-btn pf-btn--ghost js-editmatch" data-match="${esc(m.id ?? '')}">Modifica</button>` : ''}
      </li>`).join('')
    return `<div class="pf-calday"><div class="pf-calday__head pf-mono">${esc(day)}</div><ul class="pf-callist">${rows}</ul></div>`
  }).join('')
}

export function renderCategoryTag(name: string, count: number, maxTeams: number): string {
  const full = maxTeams > 0 && count >= maxTeams
  const pct = maxTeams > 0 ? Math.min(100, Math.round((count / maxTeams) * 100)) : 0
  return `<li class="pf-cat${full ? ' pf-cat--full' : ''}">
    <span class="pf-cat__label">${esc(name)}</span>
    <div class="pf-cat__body">
      <div class="pf-cat__cap">${count}/${maxTeams} squadre${full ? ' · completa' : ''}</div>
      <div class="pf-cat__bar"><i style="width:${pct}%"></i></div>
    </div>
  </li>`
}
