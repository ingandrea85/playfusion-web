import { renderOrganizerWorkspace, requireRole } from '../../shared/chrome'
import { getEvent, currentRole } from '../../shared/mock/store'
import { canEditBilling, canManageMembers } from '../../shared/mock/roles'

// Settings tab is hidden for the director; guard direct URL access too.
if (requireRole(['OWNER', 'ORGANIZER'])) {
  const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
  const ev = getEvent(id)
  if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, 'settings')

  const role = currentRole()
  const items = [
    { label: 'Competizione', desc: 'Formato, gironi, finali per categoria', href: `/apps/organizer/competition.html?event=${id}` },
    { label: 'Gironi', desc: 'Composizione dei gironi', href: `/apps/organizer/gironi.html?event=${id}` },
    { label: 'Categorie', desc: 'Categorie e capienza', href: `/apps/organizer/categories.html?event=${id}` },
  ]
  if (canEditBilling(role)) items.push(
    { label: 'Abbonamento', desc: 'Piano, prova, fatturazione', href: `/apps/organizer/abbonamento.html` },
    { label: 'Brand organizzazione', desc: 'Logo e colori del tuo brand (Pro)', href: `/apps/organizer/organizzazione.html?event=${id}` },
  )
  if (canManageMembers(role)) items.push(
    { label: 'Membri', desc: 'Ruoli e inviti dell\'organizzazione', href: `/apps/organizer/membri.html?event=${id}` },
  )
  document.getElementById('links')!.innerHTML = items.map(i =>
    `<a class="pf-card pf-card--link" style="display:block;text-decoration:none;color:inherit" href="${i.href}">
      <h2 style="margin:0 0 4px">${i.label}</h2><p class="pf-muted" style="margin:0">${i.desc}</p></a>`).join('')
}
