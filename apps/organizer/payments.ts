import { renderOrganizerTopbar } from '../../shared/chrome'
import { getCategories, getRegistrations, markPaid } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

function catName(catId: string) { return getCategories(id).find(c => c.id === catId)?.name ?? '—' }

function render() {
  document.getElementById('rows')!.innerHTML = getRegistrations(id).map(r => `
    <tr>
      <td>${r.teamName}</td><td>${catName(r.categoryId)}</td>
      <td><span class="pf-badge pf-badge--${r.paymentStatus === 'PAID' ? 'paid' : 'unpaid'}">${r.paymentStatus === 'PAID' ? 'Pagata' : 'Da pagare'}</span></td>
      <td>${r.paymentStatus === 'PAID' ? '' : `<button class="pf-btn pf-btn--primary" data-pay="${r.id}">Segna pagata</button>`}</td>
    </tr>`).join('')
  document.querySelectorAll<HTMLButtonElement>('[data-pay]').forEach(b =>
    b.addEventListener('click', () => { markPaid(b.dataset.pay!); render() }))
}
render()
