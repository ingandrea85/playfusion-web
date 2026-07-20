import '../../shared/mock/store'
import { renderOrganizerTopbar, applyOrgBrand } from '../../shared/chrome'
import { getEvents, getRegistrations, getCurrentOrgId } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')

const orgId = getCurrentOrgId()
applyOrgBrand(orgId)
const events = getEvents().filter(e => e.organizationId === orgId)
const eventsEl = document.getElementById('events')!
if (!events.length) {
  eventsEl.innerHTML = `<div class="pf-card pf-muted">Nessun torneo. <a href="/apps/organizer/create-event.html">Crea il primo →</a></div>`
} else {
  eventsEl.innerHTML = events.map(e => {
    const count = getRegistrations(e.id).length
    return `<a class="pf-card pf-card--link" style="display:block;text-decoration:none;color:inherit"
        href="/apps/organizer/event-hub.html?event=${e.id}">
      <div class="pf-eyebrow">${e.sport} · ${e.playbook}</div>
      <h2 style="margin:6px 0 10px">${e.name}</h2>
      <div class="pf-mono">${e.startDate} → ${e.endDate} · ${e.location} · ${count} iscrizioni</div>
    </a>`
  }).join('')
}
