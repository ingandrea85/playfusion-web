import { renderPublicTopbar, renderBracket, renderTabs, applyOrgBrand } from '../../shared/chrome'
import { getCategories, getEvent, getSchedule, getFinals } from '../../shared/mock/store'

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const brandLogo = applyOrgBrand(getEvent(id)?.organizationId ?? 'org-1')
document.getElementById('topbar')!.innerHTML = renderPublicTopbar(brandLogo ?? undefined)
document.getElementById('back')!.setAttribute('href', `/apps/public/landing.html?event=${id}`)
document.getElementById('eyebrow')!.textContent = getEvent(id)?.name ?? 'Torneo'

const catName = (catId: string) => getCategories(id).find(c => c.id === catId)?.name ?? '—'
const published = getSchedule(id)?.status === 'PUBLISHED'
let selCat = ''

function presentCats(): string[] {
  const seen: string[] = []
  for (const f of getFinals(id)) if (!seen.includes(f.categoryId)) seen.push(f.categoryId)
  return seen
}
function renderViews(): void {
  const catsPresent = presentCats()
  if (!catsPresent.length) { document.getElementById('bracket')!.innerHTML = renderBracket([]); return }
  if (!catsPresent.includes(selCat)) selCat = catsPresent[0]
  document.getElementById('viewtabs')!.innerHTML = renderTabs(catsPresent.map(c => ({ key: c, label: catName(c) })), selCat)
  document.querySelectorAll<HTMLButtonElement>('#viewtabs .pf-tab').forEach(b =>
    b.addEventListener('click', () => { selCat = b.dataset.key!; renderViews() }))
  document.getElementById('bracket')!.innerHTML = renderBracket(getFinals(id).filter(f => f.categoryId === selCat))
}

if (!published) {
  document.getElementById('bracket')!.innerHTML = `<p class="pf-muted">Il tabellone non è ancora stato pubblicato.</p>`
} else {
  renderViews()
}
