import { renderOrganizerWorkspace, renderBracket, renderTabs } from '../../shared/chrome'
import { getCategories, getFinals, getEvent } from '../../shared/mock/store'
import { openFinalResultPanel } from './panels'

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const ev = getEvent(id)
if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, 'bracket')
const catName = (c: string) => getCategories(id).find(x => x.id === c)?.name ?? '—'
let selCat = ''

function catsWithFinals(): string[] { const s: string[] = []; for (const f of getFinals(id)) if (!s.includes(f.categoryId)) s.push(f.categoryId); return s }

function render(): void {
  document.getElementById('editmatch')!.innerHTML = ''
  const cats = catsWithFinals()
  if (!cats.length) { document.getElementById('finals')!.innerHTML = `<p class="pf-muted">Nessuna fase finale: genera prima il calendario.</p>`; return }
  if (!cats.includes(selCat)) selCat = cats[0]
  document.getElementById('viewtabs')!.innerHTML = renderTabs(cats.map(c => ({ key: c, label: catName(c) })), selCat)
  document.querySelectorAll<HTMLButtonElement>('#viewtabs .pf-tab').forEach(b => b.addEventListener('click', () => { selCat = b.dataset.key!; render() }))
  document.getElementById('finals')!.innerHTML = renderBracket(getFinals(id).filter(f => f.categoryId === selCat), true)
  document.querySelectorAll<HTMLButtonElement>('#finals button[data-final]').forEach(b =>
    b.addEventListener('click', () => openFinalResultPanel(id, b.dataset.final!, render)))
}
render()
