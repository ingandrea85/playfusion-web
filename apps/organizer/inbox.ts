import { renderOrganizerWorkspace } from '../../shared/chrome'
import { confirmTeam, getCategories, getRegistrations, getEvent } from '../../shared/mock/store'

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const ev = getEvent(id)
if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, 'enroll')

function catName(catId: string) { return getCategories(id).find(c => c.id === catId)?.name ?? '—' }

function render() {
  document.getElementById('rows')!.innerHTML = getRegistrations(id).map(r => `
    <tr>
      <td>${r.teamName}</td><td>${catName(r.categoryId)}</td><td>${r.contactName}<br><span class="pf-muted">${r.contactPhone} · ${r.contactEmail}</span></td>
      <td><span class="pf-badge pf-badge--${r.status === 'CONFIRMED' ? 'paid' : 'pending'}">${r.status === 'CONFIRMED' ? 'Confermata' : 'In attesa'}</span></td>
      <td>${r.status === 'CONFIRMED' ? '' : `<button class="pf-btn pf-btn--primary" data-confirm="${r.id}">Conferma</button>`}</td>
    </tr>`).join('')
  document.querySelectorAll<HTMLButtonElement>('[data-confirm]').forEach(b =>
    b.addEventListener('click', () => { confirmTeam(b.dataset.confirm!); render() }))
}
render()
