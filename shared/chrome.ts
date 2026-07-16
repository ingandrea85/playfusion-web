export function renderOrganizerTopbar(active: string): string {
  const link = (href: string, label: string, key: string) =>
    `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`
  return `<strong>PlayFusion · Organizer</strong>
    <nav>
      ${link('/apps/organizer/dashboard.html', 'Eventi', 'dashboard')}
      <a href="/index.html">Esci demo</a>
    </nav>`
}

export function renderPublicTopbar(): string {
  return `<strong>PlayFusion</strong>`
}
