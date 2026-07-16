import { renderPublicTopbar } from '../../shared/chrome'
import { getCategories, getRegistrations } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)

const cats = getCategories(id)
const confirmed = getRegistrations(id).filter(r => r.status === 'CONFIRMED')
document.getElementById('list')!.innerHTML = cats.map(c => {
  const teams = confirmed.filter(r => r.categoryId === c.id)
  return `<h3>${c.name}</h3>` + (teams.length
    ? `<ul>${teams.map(t => `<li>${t.teamName}</li>`).join('')}</ul>`
    : `<p class="pf-muted">Nessuna squadra confermata.</p>`)
}).join('')
