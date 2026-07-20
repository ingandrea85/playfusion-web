import { renderOrganizerWorkspace } from '../../shared/chrome'
import { getEvent } from '../../shared/mock/store'

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const ev = getEvent(id)
if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, 'settings')

const items = [
  { label: 'Competizione', desc: 'Formato, gironi, finali per categoria', href: `/apps/organizer/competition.html?event=${id}` },
  { label: 'Gironi', desc: 'Composizione dei gironi', href: `/apps/organizer/gironi.html?event=${id}` },
  { label: 'Categorie', desc: 'Categorie e capienza', href: `/apps/organizer/categories.html?event=${id}` },
  { label: 'Brand organizzazione', desc: 'Logo e colori del tuo brand (Pro)', href: `/apps/organizer/organizzazione.html?event=${id}` },
]
document.getElementById('links')!.innerHTML = items.map(i =>
  `<a class="pf-card pf-card--link" style="display:block;text-decoration:none;color:inherit" href="${i.href}">
    <h2 style="margin:0 0 4px">${i.label}</h2><p class="pf-muted" style="margin:0">${i.desc}</p></a>`).join('')
