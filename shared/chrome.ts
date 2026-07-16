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
