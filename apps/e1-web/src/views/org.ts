import { renderOrganizerTopbar, esc } from '@playfusion/app-shell'

// T2: the organization console — a surface ABOVE events. Panoramica (events) + org-level pages
// (Membri, Brand, Abbonamento) that were previously buried inside an event workspace.
// Per-role nav visibility (Owner vs Organizer) lands in T4; here every tab is shown and the
// content stays entitlement-gated (T1).
// T4: Membri/Brand/Abbonamento are owner-only surfaces; ORGANIZER sees only Panoramica.
const ORG_TABS: Array<{ key: string; label: string; href: string; ownerOnly?: boolean }> = [
  { key: 'overview', label: 'Panoramica', href: '#/' },
  { key: 'members', label: 'Membri', href: '#/org/members', ownerOnly: true },
  { key: 'brand', label: 'Brand', href: '#/org/brand', ownerOnly: true },
  { key: 'subscription', label: 'Abbonamento', href: '#/org/subscription', ownerOnly: true },
]

// Session-constant: set once at boot from the user's org role. Defaults to owner so the shell shows
// the full nav unless explicitly restricted (keeps pure render() call sites unchanged).
let navIsOwner = true
export function setOrgNavOwner(isOwner: boolean): void { navIsOwner = isOwner }

/** Organization console shell: the organizer topbar + the (role-gated) org tab bar + a container. */
export function renderOrgShell(activeKey: string, body: string): string {
  const nav = ORG_TABS.filter((t) => navIsOwner || !t.ownerOnly).map((t) =>
    `<a class="pf-wtab${t.key === activeKey ? ' pf-wtab--active' : ''}" href="${t.href}">${esc(t.label)}</a>`).join('')
  return `${renderOrganizerTopbar('dashboard')}
    <div class="pf-orgnav"><nav class="pf-container pf-wtabs">${nav}</nav></div>
    <main class="pf-container">${body}</main>`
}
