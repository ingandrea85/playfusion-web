import '../../shared/mock/store'
import { renderOrganizerTopbar } from '../../shared/chrome'
import { getEvents, getRegistrations } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')

const events = getEvents()
document.getElementById('events')!.innerHTML = events.map(e => {
  const count = getRegistrations(e.id).length
  return `<a class="pf-card" style="display:block;text-decoration:none;color:inherit"
      href="/apps/organizer/event-hub.html?event=${e.id}">
    <h2 style="margin:0 0 8px">${e.name}</h2>
    <div class="pf-muted">${e.sport} · ${e.startDate} → ${e.endDate} · ${count} iscrizioni</div>
  </a>`
}).join('')
