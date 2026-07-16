import { renderOrganizerTopbar } from '../../shared/chrome'
import { confirmTeam, getCategories, getRegistrations } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

function catName(catId: string) { return getCategories(id).find(c => c.id === catId)?.name ?? '—' }

function render() {
  document.getElementById('rows')!.innerHTML = getRegistrations(id).map(r => `
    <tr>
      <td>${r.teamName}</td><td>${catName(r.categoryId)}</td><td>${r.contactName}<br><span class="pf-muted">${r.contactPhone}</span></td>
      <td><span class="pf-badge pf-badge--${r.status === 'CONFIRMED' ? 'paid' : 'pending'}">${r.status === 'CONFIRMED' ? 'Confermata' : 'In attesa'}</span></td>
      <td>${r.status === 'CONFIRMED' ? '' : `<button class="pf-btn pf-btn--primary" data-confirm="${r.id}">Conferma</button>`}</td>
    </tr>`).join('')
  document.querySelectorAll<HTMLButtonElement>('[data-confirm]').forEach(b =>
    b.addEventListener('click', () => { confirmTeam(b.dataset.confirm!); render() }))
}
render()
