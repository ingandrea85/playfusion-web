import { renderPublicTopbar, renderStandings } from '../../shared/chrome'
import { getCategories, getEvent, getSchedule, getStandings } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)
document.getElementById('eyebrow')!.textContent = getEvent(id)?.name ?? 'Torneo'

const catName = (catId: string) => getCategories(id).find(c => c.id === catId)?.name ?? '—'
const published = getSchedule(id)?.status === 'PUBLISHED'
document.getElementById('standings')!.innerHTML = published
  ? renderStandings(getStandings(id), catName)
  : `<p class="pf-muted">Le classifiche non sono ancora state pubblicate.</p>`
