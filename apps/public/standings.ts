import { renderPublicTopbar, renderStandings, renderTabs } from '../../shared/chrome'
import { getCategories, getEvent, getSchedule, getStandings, getScheduledMatches } from '../../shared/mock/store'

document.getElementById('topbar')!.innerHTML = renderPublicTopbar()
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)
document.getElementById('eyebrow')!.textContent = getEvent(id)?.name ?? 'Torneo'

const catName = (catId: string) => getCategories(id).find(c => c.id === catId)?.name ?? '—'
const published = getSchedule(id)?.status === 'PUBLISHED'

let selCat = ''
let selGir = 'ALL'

function presentCats(): string[] {
  const seen: string[] = []
  for (const s of getStandings(id)) if (!seen.includes(s.categoryId)) seen.push(s.categoryId)
  return seen
}
function gironiOf(catId: string): string[] {
  const seen: string[] = []
  for (const s of getStandings(id)) if (s.categoryId === catId && !seen.includes(s.groupLabel)) seen.push(s.groupLabel)
  return seen
}
function renderViews(): void {
  const catsPresent = presentCats()
  if (!catsPresent.length) { document.getElementById('standings')!.innerHTML = renderStandings([], [], [], catName); return }
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
  const rows = getStandings(id).filter(s => s.categoryId === selCat && (selGir === 'ALL' || s.groupLabel === selGir))
  document.getElementById('standings')!.innerHTML = renderStandings(rows, getScheduledMatches(id), getEvent(id)?.tieBreak ?? [], catName)
}

if (!published) {
  document.getElementById('standings')!.innerHTML = `<p class="pf-muted">Le classifiche non sono ancora state pubblicate.</p>`
} else {
  renderViews()
}
