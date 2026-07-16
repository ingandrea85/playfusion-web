import '../../shared/mock/store'
import { renderOrganizerTopbar } from '../../shared/chrome'
import { getEvents, getRegistrations } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')

const events = getEvents()
document.getElementById('events')!.innerHTML = events.map(e => {
  const count = getRegistrations(e.id).length
  return `<a class="pf-card pf-card--link" style="display:block;text-decoration:none;color:inherit"
      href="/apps/organizer/event-hub.html?event=${e.id}">
    <div class="pf-eyebrow">${e.sport} · ${e.template}</div>
    <h2 style="margin:6px 0 10px">${e.name}</h2>
    <div class="pf-mono">${e.startDate} → ${e.endDate} · ${e.location} · ${count} iscrizioni</div>
  </a>`
}).join('')
