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
