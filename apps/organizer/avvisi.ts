import { renderOrganizerTopbar } from '../../shared/chrome'
import { getEvent, getCategories, getAnnouncements, addAnnouncement, removeAnnouncement, togglePin, announcementReach } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

const cats = () => getCategories(id)
const catName = (catId: string | null) => catId === null ? 'Tutte le categorie' : (cats().find(c => c.id === catId)?.name ?? '—')

function selectedScope(): string | null {
  const v = (document.getElementById('a-cat') as HTMLSelectElement).value
  return v === '' ? null : v
}
function updateReach(): void {
  document.getElementById('a-reach')!.textContent = `Sarà visibile a ${announcementReach(id, selectedScope())} squadre confermate.`
}

function renderAdd(): void {
  const opts = `<option value="">Tutte le categorie</option>` + cats().map(c => `<option value="${c.id}">${c.name}</option>`).join('')
  document.getElementById('addform')!.innerHTML = `
    <div class="pf-field"><label>Titolo</label><input id="a-title" placeholder="Es. Cambio campo" /></div>
    <div class="pf-field"><label>Testo</label><textarea id="a-body" rows="3" placeholder="Dettagli dell'avviso"></textarea></div>
    <div class="pf-row" style="gap:var(--space-3);align-items:flex-end">
      <div class="pf-field" style="width:200px;margin-bottom:0"><label>Destinatari</label><select id="a-cat">${opts}</select></div>
      <label class="pf-switch" style="margin-bottom:0"><input type="checkbox" id="a-pin" /> In evidenza</label>
    </div>
    <p class="pf-muted" id="a-reach"></p>
    <button class="pf-btn pf-btn--primary" id="a-pub">Pubblica</button>`
  document.getElementById('a-cat')!.addEventListener('change', updateReach)
  updateReach()
  document.getElementById('a-pub')!.addEventListener('click', () => {
    const title = (document.getElementById('a-title') as HTMLInputElement).value.trim()
    const body = (document.getElementById('a-body') as HTMLTextAreaElement).value.trim()
    if (!title || !body) return
    addAnnouncement({ eventId: id, categoryId: selectedScope(), title, body, pinned: (document.getElementById('a-pin') as HTMLInputElement).checked })
    render()
  })
}

function render(): void {
  document.getElementById('title')!.textContent = `Avvisi · ${getEvent(id)?.name ?? ''}`
  renderAdd()
  const list = getAnnouncements(id)
  const el = document.getElementById('list')!
  if (!list.length) { el.innerHTML = `<p class="pf-muted">Nessun avviso pubblicato.</p>`; return }
  el.innerHTML = `<div class="pf-card"><ul class="pf-roster">` + list.map(a => `
    <li class="pf-rosterrow">
      <span class="pf-rosterrow__name">${a.pinned ? '<span class="pf-badge pf-badge--paid">In evidenza</span> ' : ''}${a.title}
        <span class="pf-mono pf-muted"> · ${catName(a.categoryId)}</span>
        <br><span class="pf-muted">${a.body}</span></span>
      <span class="pf-rosterrow__act">
        <button class="pf-btn pf-btn--ghost" data-pin="${a.id}">${a.pinned ? 'Togli evidenza' : 'In evidenza'}</button>
        <button class="pf-btn pf-btn--ghost" data-del="${a.id}">Elimina</button>
      </span>
    </li>`).join('') + `</ul></div>`
  el.querySelectorAll<HTMLButtonElement>('button[data-pin]').forEach(b => b.addEventListener('click', () => { togglePin(b.dataset.pin!); render() }))
  el.querySelectorAll<HTMLButtonElement>('button[data-del]').forEach(b => b.addEventListener('click', () => { if (confirm('Eliminare l\'avviso?')) { removeAnnouncement(b.dataset.del!); render() } }))
}

render()
