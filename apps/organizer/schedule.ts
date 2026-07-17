import { renderOrganizerTopbar, renderCalendar, renderStandings, renderTabs, renderBracket } from '../../shared/chrome'
import { getCategories, getSchedule, getScheduledMatches, getStandings, getFinals, getEvent, generateSchedule, approveSchedule, publishSchedule, rescheduleMatch, recordResult, recordFinalResult, getTieOverrides, setTieOverride } from '../../shared/mock/store'
import { rankStanding } from '../../shared/mock/ranking'
import type { CategorySchedule, ScheduleConfig } from '../../shared/mock/types'

document.getElementById('topbar')!.innerHTML = renderOrganizerTopbar('dashboard')
const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
document.getElementById('back')!.setAttribute('href', `/apps/organizer/event-hub.html?event=${id}`)

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

// Derive tabs from standings (the superset: every group has standing rows even
// when it has <2 teams and thus no matches), so no girone/category is unreachable.
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

function openEditPanel(matchId: string): void {
  const m = getScheduledMatches(id).find(x => x.id === matchId)
  if (!m) return
  const fields = schedule().config.byCategory[m.categoryId]?.fields ?? [...new Set(getScheduledMatches(id).map(x => x.field))]
  const panel = document.getElementById('editmatch')!
  panel.innerHTML = `<div class="pf-card">
    <h2>Sposta partita</h2>
    <p class="pf-muted">${m.home} vs ${m.away}</p>
    <div class="pf-field"><label>Campo</label><select id="em-field">${fields.map(f => `<option value="${f}"${f === m.field ? ' selected' : ''}>${f}</option>`).join('')}</select></div>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Giorno</label><input id="em-day" type="date" value="${m.day}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Ora</label><input id="em-time" type="time" value="${m.time}" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="em-save">Salva</button><button class="pf-btn" id="em-cancel">Annulla</button></div>
  </div>`
  document.getElementById('em-save')!.addEventListener('click', () => {
    rescheduleMatch(matchId, {
      day: (document.getElementById('em-day') as HTMLInputElement).value,
      time: (document.getElementById('em-time') as HTMLInputElement).value,
      field: (document.getElementById('em-field') as HTMLSelectElement).value,
    })
    renderViews()
  })
  document.getElementById('em-cancel')!.addEventListener('click', () => { panel.innerHTML = '' })
}

function openResultPanel(matchId: string): void {
  const m = getScheduledMatches(id).find(x => x.id === matchId)
  if (!m) return
  const panel = document.getElementById('editmatch')!
  panel.innerHTML = `<div class="pf-card">
    <h2>Risultato</h2>
    <p class="pf-muted">${m.home} vs ${m.away}</p>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${m.home}</label><input id="rs-home" type="number" min="0" value="${m.homeScore ?? 0}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${m.away}</label><input id="rs-away" type="number" min="0" value="${m.awayScore ?? 0}" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="rs-save">Salva</button><button class="pf-btn" id="rs-cancel">Annulla</button></div>
  </div>`
  document.getElementById('rs-save')!.addEventListener('click', () => {
    recordResult(matchId, Number((document.getElementById('rs-home') as HTMLInputElement).value), Number((document.getElementById('rs-away') as HTMLInputElement).value))
    renderViews()
  })
  document.getElementById('rs-cancel')!.addEventListener('click', () => { panel.innerHTML = '' })
}

function openFinalResultPanel(finalMatchId: string): void {
  const f = getFinals(id).find(x => x.id === finalMatchId)
  if (!f) return
  const home = f.homeResolved ?? f.home
  const away = f.awayResolved ?? f.away
  const panel = document.getElementById('editmatch')!
  panel.innerHTML = `<div class="pf-card">
    <h2>Risultato · ${f.round}</h2>
    <p class="pf-muted">${home} vs ${away}</p>
    <div class="pf-row" style="align-items:flex-end;gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${home}</label><input id="ff-home" type="number" min="0" value="${f.homeScore ?? 0}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>${away}</label><input id="ff-away" type="number" min="0" value="${f.awayScore ?? 0}" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="ff-save">Salva</button><button class="pf-btn" id="ff-cancel">Annulla</button></div>
  </div>`
  document.getElementById('ff-save')!.addEventListener('click', () => {
    recordFinalResult(finalMatchId, Number((document.getElementById('ff-home') as HTMLInputElement).value), Number((document.getElementById('ff-away') as HTMLInputElement).value))
    panel.innerHTML = ''
    renderViews()
  })
  document.getElementById('ff-cancel')!.addEventListener('click', () => { panel.innerHTML = '' })
}

function openTiePanel(categoryId: string, groupLabel: string, teams: string[]): void {
  const panel = document.getElementById('editmatch')!
  const order = [...teams]
  const draw = (): void => {
    panel.innerHTML = `<div class="pf-card">
      <h2>Risolvi parità</h2>
      <p class="pf-muted">${groupLabel} · ordina le squadre a pari merito</p>
      <ol class="pf-tblist">${order.map((t, i) => `<li class="pf-tbrow">
        <span>${i + 1}. ${t}</span>
        <span class="pf-tbmove">
          <button type="button" class="pf-btn pf-btn--ghost" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="pf-btn pf-btn--ghost" data-down="${i}" ${i === order.length - 1 ? 'disabled' : ''}>↓</button>
        </span></li>`).join('')}</ol>
      <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="tie-save">Salva</button><button class="pf-btn" id="tie-cancel">Annulla</button></div>
    </div>`
    panel.querySelectorAll<HTMLButtonElement>('button[data-up]').forEach(b =>
      b.addEventListener('click', () => { const i = Number(b.dataset.up); [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw() }))
    panel.querySelectorAll<HTMLButtonElement>('button[data-down]').forEach(b =>
      b.addEventListener('click', () => { const i = Number(b.dataset.down); [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw() }))
    document.getElementById('tie-save')!.addEventListener('click', () => { setTieOverride(id, categoryId, groupLabel, order); panel.innerHTML = ''; renderViews() })
    document.getElementById('tie-cancel')!.addEventListener('click', () => { panel.innerHTML = '' })
  }
  draw()
}

function renderViews(): void {
  document.getElementById('editmatch')!.innerHTML = ''
  const catsPresent = presentCats()
  if (!catsPresent.length) {
    document.getElementById('viewtabs')!.innerHTML = ''
    document.getElementById('calendar')!.innerHTML = ''
    document.getElementById('standings')!.innerHTML = ''
    document.getElementById('tieactions')!.innerHTML = ''
    document.getElementById('finals')!.innerHTML = ''
    return
  }
  if (!catsPresent.includes(selCat)) selCat = catsPresent[0]
  const gironi = gironiOf(selCat)
  if (selGir !== 'ALL' && !gironi.includes(selGir)) selGir = 'ALL'
  const catTabs = renderTabs(catsPresent.map(c => ({ key: c, label: catName(c) })), selCat)
  const girTabs = renderTabs([{ key: 'ALL', label: 'Tutti i gironi' }, ...gironi.map(g => ({ key: g, label: g }))], selGir)
  document.getElementById('viewtabs')!.innerHTML = catTabs + girTabs
  const bars = document.querySelectorAll<HTMLElement>('#viewtabs .pf-tabs')
  bars[0].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b =>
    b.addEventListener('click', () => { selCat = b.dataset.key!; selGir = 'ALL'; renderViews() }))
  bars[1].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b =>
    b.addEventListener('click', () => { selGir = b.dataset.key!; renderViews() }))
  const inSel = (categoryId: string, groupLabel: string) => categoryId === selCat && (selGir === 'ALL' || groupLabel === selGir)
  document.getElementById('calendar')!.innerHTML = renderCalendar(getScheduledMatches(id).filter(m => inSel(m.categoryId, m.groupLabel)), catName, true)
  document.querySelectorAll<HTMLButtonElement>('#calendar .js-editmatch').forEach(b =>
    b.addEventListener('click', () => openEditPanel(b.dataset.match!)))
  document.querySelectorAll<HTMLButtonElement>('#calendar .js-resultmatch').forEach(b =>
    b.addEventListener('click', () => openResultPanel(b.dataset.match!)))
  document.getElementById('standings')!.innerHTML =
    `<div class="pf-pagehead" style="margin:var(--space-6) 0 var(--space-4)"><div class="pf-eyebrow">Classifiche</div><h2>Classifiche di girone</h2></div>`
    + `<p class="pf-muted" style="margin-top:calc(-1*var(--space-2));margin-bottom:var(--space-4)">Classifica iniziale · nessuna partita giocata.</p>`
    + renderStandings(getStandings(id).filter(s => inSel(s.categoryId, s.groupLabel)), getScheduledMatches(id), getEvent(id)?.tieBreak ?? [], getTieOverrides(id), catName)
  // Manual tie resolution (E1 only): a button per still-unresolved group in view.
  const tieEl = document.getElementById('tieactions')!
  const visRows = getStandings(id).filter(s => inSel(s.categoryId, s.groupLabel))
  const ovAll = getTieOverrides(id)
  const seenG: Array<{ cat: string; g: string }> = []
  for (const s of visRows) if (!seenG.some(x => x.cat === s.categoryId && x.g === s.groupLabel)) seenG.push({ cat: s.categoryId, g: s.groupLabel })
  const tieGroups: Array<{ cat: string; g: string; teams: string[] }> = []
  for (const { cat, g } of seenG) {
    const grows = visRows.filter(s => s.categoryId === cat && s.groupLabel === g)
    const gms = getScheduledMatches(id).filter(m => m.categoryId === cat && m.groupLabel === g)
    const ov = ovAll.filter(o => o.categoryId === cat && o.groupLabel === g).map(o => o.order)
    const res = rankStanding(grows, gms, getEvent(id)?.tieBreak ?? [], ov)
    for (const grp of res.unresolved) tieGroups.push({ cat, g, teams: grp })
  }
  tieEl.innerHTML = tieGroups.map((u, i) => `<button class="pf-btn" data-tie="${i}">Risolvi parità · ${u.g}: ${u.teams.join(', ')}</button>`).join('')
  tieEl.querySelectorAll<HTMLButtonElement>('button[data-tie]').forEach(b =>
    b.addEventListener('click', () => { const u = tieGroups[Number(b.dataset.tie)]; openTiePanel(u.cat, u.g, u.teams) }))
  document.getElementById('finals')!.innerHTML = getFinals(id).some(f => f.categoryId === selCat)
    ? `<div class="pf-pagehead" style="margin:var(--space-6) 0 var(--space-4)"><div class="pf-eyebrow">Finali</div><h2>Fase finale</h2></div>`
      + renderBracket(getFinals(id).filter(f => f.categoryId === selCat), true)
    : ''
  document.querySelectorAll<HTMLButtonElement>('#finals button[data-final]').forEach(b =>
    b.addEventListener('click', () => openFinalResultPanel(b.dataset.final!)))
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
    document.getElementById('standings')!.innerHTML = ''
    document.getElementById('tieactions')!.innerHTML = ''
    document.getElementById('finals')!.innerHTML = ''
    return
  }
  renderWindow()
  renderConfigArea()
  renderActions()
  if (schedule().status === 'NONE') {
    document.getElementById('viewtabs')!.innerHTML = ''
    document.getElementById('editmatch')!.innerHTML = ''
    document.getElementById('calendar')!.innerHTML = ''
    document.getElementById('standings')!.innerHTML = ''
    document.getElementById('tieactions')!.innerHTML = ''
    document.getElementById('finals')!.innerHTML = ''
  } else {
    renderViews()
  }
}

const toggle = document.getElementById('uniform') as HTMLInputElement
toggle.checked = uniform
toggle.addEventListener('change', () => { uniform = toggle.checked; render() })
render()
