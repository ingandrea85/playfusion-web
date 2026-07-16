import { renderOrganizerTopbar } from '../../shared/chrome'
import { getEvent, setRegistrationsOpen } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

const shareUrl = `${location.origin}/apps/public/landing.html?event=${id}`
;(document.getElementById('link') as HTMLInputElement).value = shareUrl
document.getElementById('open')!.setAttribute('href', shareUrl)

function render() {
  const open = !!getEvent(id)?.registrationsOpen
  document.getElementById('state')!.textContent = open ? 'Aperte' : 'Chiuse'
  document.getElementById('toggle')!.textContent = open ? 'Chiudi iscrizioni' : 'Apri iscrizioni'
  document.getElementById('linkcard')!.style.display = open ? 'block' : 'none'
}
render()

document.getElementById('toggle')!.addEventListener('click', () => {
  setRegistrationsOpen(id, !getEvent(id)?.registrationsOpen); render()
})
