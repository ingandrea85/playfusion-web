import { renderPublicTopbar, renderCalendar } from '../../shared/chrome'
import { getCategories, getEvent, getSchedule, getScheduledMatches } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)
document.getElementById('eyebrow')!.textContent = getEvent(id)?.name ?? 'Torneo'

const catName = (catId: string) => getCategories(id).find(c => c.id === catId)?.name ?? '—'
const published = getSchedule(id)?.status === 'PUBLISHED'
document.getElementById('calendar')!.innerHTML = published
  ? renderCalendar(getScheduledMatches(id), catName)
  : `<p class="pf-muted">Il calendario non è ancora stato pubblicato.</p>`
