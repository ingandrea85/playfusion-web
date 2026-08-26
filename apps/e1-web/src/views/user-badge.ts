import { esc } from '@playfusion/app-shell'
import type { Auth0Port, Auth0User } from '../auth/auth0.js'

/** Display label for the badge role chip — the first Auth0 role, capitalised, or "Organizer"
 *  (every E1 user is an organizer: it's the login gate). */
export function roleLabel(user: Auth0User): string {
  const r = user.roles[0]
  if (!r) return 'Organizer'
  return r.charAt(0).toUpperCase() + r.slice(1)
}

function initials(user: Auth0User): string {
  const base = (user.name ?? user.email ?? '?').trim()
  const parts = base.split(/[\s@._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}

/** A floating account badge: avatar/initials + name + role, opening a menu with change-password
 *  and logout. Rendered once into a fixed container at boot (persists across all E1 routes). */
export function renderUserBadge(user: Auth0User): string {
  const name = user.name ?? user.email ?? 'Account'
  const avatar = user.picture
    ? `<img class="pf-userbadge__avatar" src="${esc(user.picture)}" alt="" referrerpolicy="no-referrer" />`
    : `<span class="pf-userbadge__avatar">${esc(initials(user))}</span>`
  return `<div class="pf-userbadge">
    <button class="pf-userbadge__btn" id="ub-toggle" aria-haspopup="menu" aria-expanded="false">
      ${avatar}
      <span class="pf-userbadge__meta"><b>${esc(name)}</b><span class="pf-userbadge__role">${esc(roleLabel(user))}</span></span>
    </button>
    <div class="pf-userbadge__menu" id="ub-menu" role="menu" hidden>
      ${user.email ? `<div class="pf-userbadge__email">${esc(user.email)}</div>` : ''}
      <button class="pf-menuitem" id="ub-pwd" role="menuitem">🔑 Cambia password</button>
      <button class="pf-menuitem" id="ub-logout" role="menuitem">↩ Esci</button>
      <div class="pf-userbadge__status" id="ub-status" hidden></div>
    </div>
  </div>`
}

/** Wire the badge: toggle the menu, change-password (Auth0 reset email), logout. */
export function mountUserBadge(root: ParentNode, port: Auth0Port): void {
  const toggle = root.querySelector<HTMLButtonElement>('#ub-toggle')
  const menu = root.querySelector<HTMLElement>('#ub-menu')
  const status = root.querySelector<HTMLElement>('#ub-status')
  if (!toggle || !menu || !status) return

  const setOpen = (open: boolean) => { menu.hidden = !open; toggle.setAttribute('aria-expanded', String(open)) }
  toggle.addEventListener('click', (e) => { e.stopPropagation(); setOpen(menu.hidden) })
  // Click outside closes the menu.
  document.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('.pf-userbadge')) setOpen(false) })

  const flash = (msg: string, ok = true) => {
    status.hidden = false
    status.textContent = msg
    status.classList.toggle('pf-userbadge__status--err', !ok)
  }

  root.querySelector<HTMLButtonElement>('#ub-pwd')!.addEventListener('click', async () => {
    flash('Invio in corso…')
    try { await port.changePassword(); flash('📧 Ti abbiamo inviato un\'email per reimpostare la password.') }
    catch { flash('Non è stato possibile avviare il cambio password.', false) }
  })
  root.querySelector<HTMLButtonElement>('#ub-logout')!.addEventListener('click', () => { void port.logout() })
}
