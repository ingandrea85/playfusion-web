import { renderPublicTopbar, renderTabs } from '../../shared/chrome'
import { getCategories, getEvent, getAnnouncements } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)
document.getElementById('eyebrow')!.textContent = getEvent(id)?.name ?? 'Torneo'

const cats = () => getCategories(id)
const catName = (catId: string | null) => catId === null ? 'Tutte le categorie' : (cats().find(c => c.id === catId)?.name ?? '—')
let sel = 'ALL'

function render(): void {
  const all = getAnnouncements(id)
  document.getElementById('viewtabs')!.innerHTML = renderTabs(
    [{ key: 'ALL', label: 'Tutte' }, ...cats().map(c => ({ key: c.id, label: c.name }))], sel)
  document.querySelectorAll<HTMLButtonElement>('#viewtabs .pf-tab').forEach(b =>
    b.addEventListener('click', () => { sel = b.dataset.key!; render() }))
  // event-wide (null) sempre mostrati; una categoria selezionata mostra null + quella categoria
  const rows = all.filter(a => sel === 'ALL' || a.categoryId === null || a.categoryId === sel)
  const el = document.getElementById('list')!
  if (!rows.length) { el.innerHTML = `<p class="pf-muted">Nessun avviso pubblicato.</p>`; return }
  el.innerHTML = rows.map(a => `<div class="pf-card">
    <div class="pf-cat__label" style="margin-bottom:var(--space-2)">${a.pinned ? '<span class="pf-badge pf-badge--paid">In evidenza</span> ' : ''}${a.title}
      <span class="pf-mono pf-muted"> · ${catName(a.categoryId)}</span></div>
    <p>${a.body}</p>
  </div>`).join('')
}
render()
