import { renderPublicTopbar } from '../../shared/chrome'
import { addRegistration, getCategories } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('backlink')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)

document.getElementById('cat')!.innerHTML =
  getCategories(id).map(c => `<option value="${c.id}">${c.name}</option>`).join('')

document.getElementById('form')!.addEventListener('submit', (ev) => {
  ev.preventDefault()
  const data = new FormData(ev.target as HTMLFormElement)
  addRegistration({
    eventId: id, categoryId: String(data.get('categoryId')), teamName: String(data.get('teamName')),
    coachName: String(data.get('coachName')), contactPhone: String(data.get('contactPhone')),
  })
  ;(document.getElementById('form') as HTMLElement).style.display = 'none'
  ;(document.getElementById('done') as HTMLElement).style.display = 'block'
})
