import { renderOrganizerTopbar, renderCategoryTag } from '../../shared/chrome'
import { addCategory, getCategories, getRegistrations } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

function countsByCategory(): Record<string, number> {
  const map: Record<string, number> = {}
  for (const r of getRegistrations(id)) map[r.categoryId] = (map[r.categoryId] ?? 0) + 1
  return map
}

function render() {
  const counts = countsByCategory()
  const cats = getCategories(id)
  document.getElementById('list')!.innerHTML = cats.length
    ? cats.map(c => renderCategoryTag(c.name, counts[c.id] ?? 0, c.maxTeams)).join('')
    : '<li class="pf-muted">Nessuna categoria</li>'
}
render()

document.getElementById('form')!.addEventListener('submit', (ev) => {
  ev.preventDefault()
  const f = ev.target as HTMLFormElement
  const data = new FormData(f)
  const name = String(data.get('name')).trim()
  const maxTeams = Number(data.get('maxTeams'))
  if (name && maxTeams > 0) { addCategory(id, name, maxTeams); f.reset(); render() }
})
