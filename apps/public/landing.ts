import { renderPublicTopbar } from '../../shared/chrome'
import { getCategories, getEvent } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const event = getEvent(id)

document.getElementById('title')!.textContent = event?.name ?? 'Evento non trovato'
document.getElementById('meta')!.textContent = event ? `${event.sport} · ${event.startDate} → ${event.endDate}` : ''
document.getElementById('cats')!.innerHTML = getCategories(id).map(c => `<li>${c.name}</li>`).join('')
document.getElementById('participants')!.setAttribute('href', `/apps/public/participants.html?event=${id}`)

document.getElementById('cta')!.innerHTML = event?.registrationsOpen
  ? `<a class="pf-btn pf-btn--primary" href="/apps/public/enroll.html?event=${id}">Iscrivi la squadra</a>`
  : `<p class="pf-muted">Le iscrizioni sono chiuse.</p>`
