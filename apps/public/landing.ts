import { renderPublicTopbar } from '../../shared/chrome'
import { getCategories, getEvent } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const event = getEvent(id)

const open = !!event?.registrationsOpen
document.getElementById('eyebrow')!.textContent =
  event ? `${event.sport} · Iscrizioni ${open ? 'aperte' : 'chiuse'}` : 'Evento'
document.getElementById('title')!.textContent = event?.name ?? 'Evento non trovato'
document.getElementById('meta')!.textContent = event ? `${event.startDate} → ${event.endDate}` : ''
document.getElementById('cats')!.innerHTML =
  getCategories(id).map(c => `<li class="pf-chip"><b>${c.name}</b></li>`).join('')
document.getElementById('participants')!.setAttribute('href', `/apps/public/participants.html?event=${id}`)

document.getElementById('cta')!.innerHTML = open
  ? `<a class="pf-btn pf-btn--primary pf-btn--lg" href="/apps/public/enroll.html?event=${id}">Iscrivi la squadra</a>`
  : `<p class="pf-muted">Le iscrizioni sono chiuse.</p>`
