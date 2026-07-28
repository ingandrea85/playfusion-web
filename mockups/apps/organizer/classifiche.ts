import { renderOrganizerWorkspace, renderStandings, renderTabs } from '../../shared/chrome'
import { getCategories, getStandings, getScheduledMatches, getEvent, getTieOverrides, currentRole } from '../../shared/mock/store'
import { rankStanding } from '../../shared/mock/ranking'
import { openTiePanel } from './panels'

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const ev = getEvent(id)
if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, 'standings')
const director = currentRole() === 'DIRECTOR'  // read-only standings: no tie resolution
const catName = (c: string) => getCategories(id).find(x => x.id === c)?.name ?? '—'
let selCat = ''; let selGir = 'ALL'

function presentCats(): string[] { const s: string[] = []; for (const r of getStandings(id)) if (!s.includes(r.categoryId)) s.push(r.categoryId); return s }
function gironiOf(cat: string): string[] { const s: string[] = []; for (const r of getStandings(id)) if (r.categoryId === cat && !s.includes(r.groupLabel)) s.push(r.groupLabel); return s }

function render(): void {
  document.getElementById('editmatch')!.innerHTML = ''
  const cats = presentCats()
  if (!cats.length) { document.getElementById('standings')!.innerHTML = `<p class="pf-muted">Nessuna classifica: genera prima il calendario.</p>`; return }
  if (!cats.includes(selCat)) selCat = cats[0]
  const gironi = gironiOf(selCat)
  if (selGir !== 'ALL' && !gironi.includes(selGir)) selGir = 'ALL'
  document.getElementById('viewtabs')!.innerHTML =
    renderTabs(cats.map(c => ({ key: c, label: catName(c) })), selCat) +
    renderTabs([{ key: 'ALL', label: 'Tutti i gironi' }, ...gironi.map(g => ({ key: g, label: g }))], selGir)
  const bars = document.querySelectorAll<HTMLElement>('#viewtabs .pf-tabs')
  bars[0].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b => b.addEventListener('click', () => { selCat = b.dataset.key!; selGir = 'ALL'; render() }))
  bars[1].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b => b.addEventListener('click', () => { selGir = b.dataset.key!; render() }))
  const inSel = (c: string, g: string) => c === selCat && (selGir === 'ALL' || g === selGir)
  const policy = getEvent(id)?.tieBreak ?? []
  document.getElementById('standings')!.innerHTML = renderStandings(getStandings(id).filter(s => inSel(s.categoryId, s.groupLabel)), getScheduledMatches(id), policy, getTieOverrides(id), catName)
  const visRows = getStandings(id).filter(s => inSel(s.categoryId, s.groupLabel))
  const ovAll = getTieOverrides(id)
  const seen: Array<{ cat: string; g: string }> = []
  for (const s of visRows) if (!seen.some(x => x.cat === s.categoryId && x.g === s.groupLabel)) seen.push({ cat: s.categoryId, g: s.groupLabel })
  if (director) { document.getElementById('tieactions')!.innerHTML = ''; return }
  const tieGroups: Array<{ cat: string; g: string; teams: string[] }> = []
  for (const { cat, g } of seen) {
    const grows = visRows.filter(s => s.categoryId === cat && s.groupLabel === g)
    const gms = getScheduledMatches(id).filter(m => m.categoryId === cat && m.groupLabel === g)
    const ov = ovAll.filter(o => o.categoryId === cat && o.groupLabel === g).map(o => o.order)
    for (const grp of rankStanding(grows, gms, policy, ov).unresolved) tieGroups.push({ cat, g, teams: grp })
  }
  document.getElementById('tieactions')!.innerHTML = tieGroups.map((u, i) => `<button class="pf-btn" data-tie="${i}">Risolvi parità · ${u.g}: ${u.teams.join(', ')}</button>`).join('')
  document.getElementById('tieactions')!.querySelectorAll<HTMLButtonElement>('button[data-tie]').forEach(b =>
    b.addEventListener('click', () => { const u = tieGroups[Number(b.dataset.tie)]; openTiePanel(id, u.cat, u.g, u.teams, render) }))
}
render()
