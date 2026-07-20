import { renderOrganizerWorkspace, renderCalendar, renderTabs } from '../../shared/chrome'
import { getCategories, getSchedule, getScheduledMatches, getEvent, generateSchedule, approveSchedule, publishSchedule } from '../../shared/mock/store'
import { openEditPanel, openResultPanel } from './panels'
import type { CategorySchedule, ScheduleConfig } from '../../shared/mock/types'

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const ev = getEvent(id)
if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, 'calendar')

const cats = getCategories(id)
const catName = (catId: string) => cats.find(c => c.id === catId)?.name ?? '—'
const schedule = () => getSchedule(id)!
const DEF: CategorySchedule = { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 }
const catCfg = (catId: string): CategorySchedule => schedule().config.byCategory[catId] ?? DEF

function locked(): boolean { const s = schedule().status; return s === 'APPROVED' || s === 'PUBLISHED' }
function sameCat(a: CategorySchedule, b: CategorySchedule): boolean {
  return a.fields.join(',') === b.fields.join(',') && a.periods === b.periods && a.periodMinutes === b.periodMinutes && a.breakMinutes === b.breakMinutes
}
function allSame(): boolean {
  const cs = cats.map(c => catCfg(c.id))
  return cs.length > 0 && cs.every(x => sameCat(x, cs[0]))
}
let uniform = allSame()

function flash(msg: string): void { document.getElementById('flash')!.innerHTML = `<div class="pf-flash">✓ ${msg}</div>` }

function catConfigForm(cs: CategorySchedule, dis: string): string {
  return `
    <div class="pf-field"><label>Campi (separati da virgola)</label><input class="js-fields" value="${cs.fields.join(', ')}" ${dis} /></div>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>N. tempi</label><input class="js-periods" type="number" min="1" value="${cs.periods}" ${dis} /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Durata tempo (min)</label><input class="js-periodMinutes" type="number" min="1" value="${cs.periodMinutes}" ${dis} /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Pausa (min)</label><input class="js-breakMinutes" type="number" min="0" value="${cs.breakMinutes}" ${dis} /></div>
    </div>`
}
function readCat(scope: HTMLElement): CategorySchedule {
  return {
    fields: (scope.querySelector('.js-fields') as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean),
    periods: Number((scope.querySelector('.js-periods') as HTMLInputElement).value),
    periodMinutes: Number((scope.querySelector('.js-periodMinutes') as HTMLInputElement).value),
    breakMinutes: Number((scope.querySelector('.js-breakMinutes') as HTMLInputElement).value),
  }
}

function buildConfig(): ScheduleConfig {
  const dailyStart = (document.getElementById('dailyStart') as HTMLInputElement).value
  const slotsPerDay = Number((document.getElementById('slotsPerDay') as HTMLInputElement).value)
  const finalsDate = (document.getElementById('finalsDate') as HTMLInputElement).value
  const byCategory: Record<string, CategorySchedule> = {}
  if (uniform) {
    const cs = readCat(document.getElementById('shared')!)
    for (const c of cats) byCategory[c.id] = cs
  } else {
    document.querySelectorAll<HTMLElement>('.js-catcfg').forEach(el => { byCategory[el.dataset.cat!] = readCat(el) })
  }
  return { dailyStart, slotsPerDay, finalsDate, byCategory }
}

function renderWindow(): void {
  const cfg = schedule().config
  const dis = locked() ? 'disabled' : ''
  document.getElementById('window')!.innerHTML = `
    <h2>Finestra oraria</h2>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Inizio giornata</label><input id="dailyStart" type="time" value="${cfg.dailyStart}" ${dis} /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Slot per giornata</label><input id="slotsPerDay" type="number" min="1" value="${cfg.slotsPerDay}" ${dis} /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Data finali</label><input id="finalsDate" type="date" value="${cfg.finalsDate}" ${dis} /></div>
    </div>`
}

function renderConfigArea(): void {
  const area = document.getElementById('configarea')!
  if (locked()) { area.innerHTML = `<div class="pf-card pf-muted">Calendario approvato: configurazione bloccata.</div>`; return }
  if (uniform) {
    area.innerHTML = `<div class="pf-card" id="shared"><h2>Config di gioco (tutte le categorie)</h2>${catConfigForm(catCfg(cats[0].id), '')}</div>
      <button class="pf-btn pf-btn--primary" id="generate">Genera calendario</button>`
  } else {
    area.innerHTML = cats.map(c =>
      `<div class="pf-card js-catcfg" data-cat="${c.id}"><div class="pf-cat__label" style="margin-bottom:var(--space-3)">${c.name}</div>${catConfigForm(catCfg(c.id), '')}</div>`).join('')
      + `<button class="pf-btn pf-btn--primary" id="generate">Genera calendario</button>`
  }
  document.getElementById('generate')!.addEventListener('click', () => { generateSchedule(id, buildConfig()); render(); flash('Calendario generato') })
}

function renderActions(): void {
  const s = schedule().status
  const el = document.getElementById('actions')!
  if (s === 'NONE') { el.innerHTML = '<p class="pf-muted">Genera il calendario per procedere.</p>'; return }
  el.innerHTML = `
    <div class="pf-row">
      <div><span class="pf-eyebrow">Stato calendario</span><h2 style="margin-top:4px">${{ GENERATED: 'Generato', APPROVED: 'Approvato', PUBLISHED: 'Pubblicato' }[s]}</h2></div>
      <div style="display:flex;gap:var(--space-2)">
        <button class="pf-btn pf-btn--primary" id="approve" ${s === 'GENERATED' ? '' : 'disabled'}>Approva</button>
        <button class="pf-btn pf-btn--primary" id="publish" ${s === 'APPROVED' ? '' : 'disabled'}>Pubblica</button>
      </div>
    </div>`
  const ap = document.getElementById('approve') as HTMLButtonElement
  const pb = document.getElementById('publish') as HTMLButtonElement
  if (!ap.disabled) ap.addEventListener('click', () => { approveSchedule(id); render(); flash('Calendario approvato') })
  if (!pb.disabled) pb.addEventListener('click', () => { publishSchedule(id); render(); flash('Calendario pubblicato') })
}

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
  document.getElementById('editmatch')!.innerHTML = ''
  const catsPresent = presentCats()
  if (!catsPresent.length) {
    document.getElementById('viewtabs')!.innerHTML = ''
    document.getElementById('calendar')!.innerHTML = ''
    return
  }
  if (!catsPresent.includes(selCat)) selCat = catsPresent[0]
  const gironi = gironiOf(selCat)
  if (selGir !== 'ALL' && !gironi.includes(selGir)) selGir = 'ALL'
  document.getElementById('viewtabs')!.innerHTML =
    renderTabs(catsPresent.map(c => ({ key: c, label: catName(c) })), selCat) +
    renderTabs([{ key: 'ALL', label: 'Tutti i gironi' }, ...gironi.map(g => ({ key: g, label: g }))], selGir)
  const bars = document.querySelectorAll<HTMLElement>('#viewtabs .pf-tabs')
  bars[0].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b =>
    b.addEventListener('click', () => { selCat = b.dataset.key!; selGir = 'ALL'; renderViews() }))
  bars[1].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b =>
    b.addEventListener('click', () => { selGir = b.dataset.key!; renderViews() }))
  const inSel = (categoryId: string, groupLabel: string) => categoryId === selCat && (selGir === 'ALL' || groupLabel === selGir)
  document.getElementById('calendar')!.innerHTML = renderCalendar(getScheduledMatches(id).filter(m => inSel(m.categoryId, m.groupLabel)), catName, true)
  document.querySelectorAll<HTMLButtonElement>('#calendar .js-editmatch').forEach(b =>
    b.addEventListener('click', () => openEditPanel(id, b.dataset.match!, renderViews)))
  document.querySelectorAll<HTMLButtonElement>('#calendar .js-resultmatch').forEach(b =>
    b.addEventListener('click', () => openResultPanel(id, b.dataset.match!, renderViews)))
}

function render(): void {
  document.getElementById('flash')!.innerHTML = ''
  if (cats.length === 0) {
    document.getElementById('window')!.innerHTML = ''
    document.getElementById('configarea')!.innerHTML = `<div class="pf-card pf-muted">Nessuna categoria. Aggiungile prima nello step Categorie.</div>`
    document.getElementById('actions')!.innerHTML = ''
    document.getElementById('viewtabs')!.innerHTML = ''
    document.getElementById('editmatch')!.innerHTML = ''
    document.getElementById('calendar')!.innerHTML = ''
    return
  }
  renderWindow()
  renderConfigArea()
  renderActions()
  if (schedule().status === 'NONE') {
    document.getElementById('viewtabs')!.innerHTML = ''
    document.getElementById('editmatch')!.innerHTML = ''
    document.getElementById('calendar')!.innerHTML = ''
  } else {
    renderViews()
  }
}

const toggle = document.getElementById('uniform') as HTMLInputElement
toggle.checked = uniform
toggle.addEventListener('change', () => { uniform = toggle.checked; render() })
render()
