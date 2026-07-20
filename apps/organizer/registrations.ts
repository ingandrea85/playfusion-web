import { renderOrganizerWorkspace } from '../../shared/chrome'
import { getEvent, setRegistrationsOpen } from '../../shared/mock/store'

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const ev = getEvent(id)
if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, 'enroll')

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
