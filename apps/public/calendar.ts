import { renderPublicTopbar, renderCalendar, renderTabs } from '../../shared/chrome'
import { getCategories, getEvent, getSchedule, getScheduledMatches, getAnnouncements } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)
document.getElementById('eyebrow')!.textContent = getEvent(id)?.name ?? 'Torneo'

const featured = getAnnouncements(id)[0]
if (featured) document.querySelector('.pf-pagehead')!.insertAdjacentHTML('afterend',
  `<div class="pf-card"><span class="pf-mono pf-muted">📣 Avviso</span> <b>${featured.title}</b> — ${featured.body}
   <a href="/apps/public/avvisi.html?event=${id}">Tutti gli avvisi →</a></div>`)

const catName = (catId: string) => getCategories(id).find(c => c.id === catId)?.name ?? '—'
const published = getSchedule(id)?.status === 'PUBLISHED'

let selCat = ''
let selGir = 'ALL'

function presentCats(): string[] {
  const seen: string[] = []
  for (const m of getScheduledMatches(id)) if (!seen.includes(m.categoryId)) seen.push(m.categoryId)
  return seen
}
function gironiOf(catId: string): string[] {
  const seen: string[] = []
  for (const m of getScheduledMatches(id)) if (m.categoryId === catId && !seen.includes(m.groupLabel)) seen.push(m.groupLabel)
  return seen
}
function renderViews(): void {
  const catsPresent = presentCats()
  if (!catsPresent.length) { document.getElementById('calendar')!.innerHTML = renderCalendar([], catName); return }
  if (!catsPresent.includes(selCat)) selCat = catsPresent[0]
  const gironi = gironiOf(selCat)
  if (selGir !== 'ALL' && !gironi.includes(selGir)) selGir = 'ALL'
  document.getElementById('viewtabs')!.innerHTML =
    renderTabs(catsPresent.map(c => ({ key: c, label: catName(c) })), selCat)
    + renderTabs([{ key: 'ALL', label: 'Tutti i gironi' }, ...gironi.map(g => ({ key: g, label: g }))], selGir)
  const bars = document.querySelectorAll<HTMLElement>('#viewtabs .pf-tabs')
  bars[0].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b =>
    b.addEventListener('click', () => { selCat = b.dataset.key!; selGir = 'ALL'; renderViews() }))
  bars[1].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b =>
    b.addEventListener('click', () => { selGir = b.dataset.key!; renderViews() }))
  const rows = getScheduledMatches(id).filter(m => m.categoryId === selCat && (selGir === 'ALL' || m.groupLabel === selGir))
  document.getElementById('calendar')!.innerHTML = renderCalendar(rows, catName)
}

if (!published) {
  document.getElementById('calendar')!.innerHTML = `<p class="pf-muted">Il calendario non è ancora stato pubblicato.</p>`
} else {
  renderViews()
}
