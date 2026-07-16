import { renderOrganizerTopbar } from '../../shared/chrome'
import { createEvent } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')

document.getElementById('form')!.addEventListener('submit', (ev) => {
  ev.preventDefault()
  const f = ev.target as HTMLFormElement
  const data = new FormData(f)
  const event = createEvent({
    name: String(data.get('name')), sport: String(data.get('sport')),
    startDate: String(data.get('startDate')), endDate: String(data.get('endDate')),
  })
  location.href = `/apps/organizer/event-hub.html?event=${event.id}`
})
