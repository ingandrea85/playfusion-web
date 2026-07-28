import { renderPublicTopbar, applyOrgBrand } from '../../shared/chrome'
import { addRegistration, getCategories, getEvent, getRegistrations } from '../../shared/mock/store'

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const brandLogo = applyOrgBrand(getEvent(id)?.organizationId ?? 'org-1')
document.getElementById('topbar')!.innerHTML = renderPublicTopbar(brandLogo ?? undefined)
document.getElementById('backlink')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)

const counts: Record<string, number> = {}
for (const r of getRegistrations(id)) counts[r.categoryId] = (counts[r.categoryId] ?? 0) + 1
document.getElementById('cat')!.innerHTML =
  getCategories(id).map(c => {
    const n = counts[c.id] ?? 0
    const full = n >= c.maxTeams
    return `<option value="${c.id}"${full ? ' disabled' : ''}>${c.name} — ${n}/${c.maxTeams}${full ? ' (completa)' : ''}</option>`
  }).join('')

document.getElementById('form')!.addEventListener('submit', (ev) => {
  ev.preventDefault()
  const data = new FormData(ev.target as HTMLFormElement)
  addRegistration({
    eventId: id, categoryId: String(data.get('categoryId')), teamName: String(data.get('teamName')),
    contactName: String(data.get('contactName')), contactPhone: String(data.get('contactPhone')),
    contactEmail: String(data.get('contactEmail')),
  })
  ;(document.getElementById('form') as HTMLElement).style.display = 'none'
  ;(document.getElementById('done') as HTMLElement).style.display = 'block'
})
