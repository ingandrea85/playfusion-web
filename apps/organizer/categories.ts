import { renderOrganizerTopbar } from '../../shared/chrome'
import { addCategory, getCategories } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

function render() {
  document.getElementById('list')!.innerHTML =
    getCategories(id).map(c => `<li>${c.name}</li>`).join('') || '<li class="pf-muted">Nessuna categoria</li>'
}
render()

document.getElementById('form')!.addEventListener('submit', (ev) => {
  ev.preventDefault()
  const f = ev.target as HTMLFormElement
  const name = String(new FormData(f).get('name')).trim()
  if (name) { addCategory(id, name); f.reset(); render() }
})
