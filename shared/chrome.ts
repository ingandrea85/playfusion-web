// Fonts (self-hosted via npm, no external CDN). Imported here because every
// screen imports from this module, so importing it loads the type system once.
import '@fontsource-variable/archivo'
import '@fontsource-variable/hanken-grotesk'
import '@fontsource-variable/spline-sans-mono'

export function renderOrganizerTopbar(active: string): string {
  const link = (href: string, label: string, key: string) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`
  return `<a class="pf-brand" href="/apps/organizer/dashboard.html">play<b>fusion</b><small>Organizer</small></a>
    <nav>
      ${link('/apps/organizer/dashboard.html', 'Eventi', 'dashboard')}
      <a href="/index.html">Esci demo</a>
    </nav>`
}

export function renderPublicTopbar(): string {
  return `<a class="pf-brand" href="/index.html">play<b>fusion</b></a>`
}

// Category tag: age bracket + registration capacity meter. Shared by E1 and E3.
export function renderCategoryTag(name: string, count: number, maxTeams: number): string {
  const full = count >= maxTeams
  const pct = maxTeams > 0 ? Math.min(100, Math.round((count / maxTeams) * 100)) : 0
  return `<li class="pf-cat${full ? ' pf-cat--full' : ''}">
    <span class="pf-cat__label">${name}</span>
    <div class="pf-cat__body">
      <div class="pf-cat__cap">${count}/${maxTeams} squadre${full ? ' · completa' : ''}</div>
      <div class="pf-cat__bar"><i style="width:${pct}%"></i></div>
    </div>
  </li>`
}
