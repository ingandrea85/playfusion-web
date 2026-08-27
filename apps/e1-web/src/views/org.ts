import { renderOrganizerTopbar, esc } from '@playfusion/app-shell'

// T2: the organization console — a surface ABOVE events. Panoramica (events) + org-level pages
// (Membri, Brand, Abbonamento) that were previously buried inside an event workspace.
// Per-role nav visibility (Owner vs Organizer) lands in T4; here every tab is shown and the
// content stays entitlement-gated (T1).
const ORG_TABS: Array<{ key: string; label: string; href: string }> = [
  { key: 'overview', label: 'Panoramica', href: '#/' },
  { key: 'members', label: 'Membri', href: '#/org/members' },
  { key: 'brand', label: 'Brand', href: '#/org/brand' },
  { key: 'subscription', label: 'Abbonamento', href: '#/org/subscription' },
]

/** Organization console shell: the organizer topbar + the org tab bar + a content container. */
export function renderOrgShell(activeKey: string, body: string): string {
  const nav = ORG_TABS.map((t) =>
    `<a class="pf-wtab${t.key === activeKey ? ' pf-wtab--active' : ''}" href="${t.href}">${esc(t.label)}</a>`).join('')
  return `${renderOrganizerTopbar('dashboard')}
    <div class="pf-orgnav"><nav class="pf-container pf-wtabs">${nav}</nav></div>
    <main class="pf-container">${body}</main>`
}
