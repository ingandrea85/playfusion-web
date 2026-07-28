import { renderOrganizerWorkspace, renderTabs, requireRole } from '../../shared/chrome'
import {
  getEvent, getCategories, getResources, addResource, updateResource, removeResource,
  getEventTeams, getTeamSize, setTeamSize, getEventDays, getResourceTurns, setResourceAssignment,
} from '../../shared/mock/store'

// Owner + organizer only (director has no Risorse tab).
if (requireRole(['OWNER', 'ORGANIZER'])) {
  const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
  const ev = getEvent(id)
  if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, 'resources')

  const cats = () => getCategories(id)
  const catName = (c: string) => cats().find(x => x.id === c)?.name ?? '—'
  const flash = (msg: string) => { document.getElementById('flash')!.innerHTML = `<div class="pf-flash">✓ ${msg}</div>` }

  let selDay = getEventDays(id)[0] ?? ''
  let selRes = getResources(id)[0]?.id ?? ''

  function renderResources(): void {
    const rows = getResources(id).map(r => `<tr>
        <td><b>${r.name}</b></td>
        <td>${r.occupancyMinutes}′</td>
        <td>${r.capacityPersons} pers.</td>
        <td>+${r.offsetMinutes}′</td>
        <td><button class="pf-btn pf-btn--ghost js-resrm" data-res="${r.id}">Rimuovi</button></td>
      </tr>`).join('')
    document.getElementById('resources')!.innerHTML = getResources(id).length
      ? `<div class="pf-tablewrap"><table class="pf-restable">
          <thead><tr><th>Risorsa</th><th>Occupazione</th><th>Capacità</th><th>Offset</th><th></th></tr></thead>
          <tbody>${rows}</tbody></table></div>`
      : `<p class="pf-muted">Nessuna risorsa. Aggiungine una qui sotto.</p>`
    document.querySelectorAll<HTMLButtonElement>('.js-resrm').forEach(b =>
      b.addEventListener('click', () => { removeResource(b.dataset.res!); if (selRes === b.dataset.res) selRes = getResources(id)[0]?.id ?? ''; flash('Risorsa rimossa'); render() }))

    document.getElementById('resform')!.innerHTML = `
      <div class="pf-row" style="align-items:flex-end;gap:var(--space-3);flex-wrap:wrap;margin-top:var(--space-3)">
        <div class="pf-field" style="margin-bottom:0"><label>Nome</label><input id="r-name" placeholder="es. Docce, Terzo tempo" /></div>
        <div class="pf-field" style="margin-bottom:0;max-width:120px"><label>Occup. (min)</label><input id="r-occ" type="number" min="1" value="30" /></div>
        <div class="pf-field" style="margin-bottom:0;max-width:130px"><label>Capacità (pers.)</label><input id="r-cap" type="number" min="1" value="16" /></div>
        <div class="pf-field" style="margin-bottom:0;max-width:110px"><label>Offset (min)</label><input id="r-off" type="number" min="0" value="0" /></div>
        <button class="pf-btn pf-btn--primary" id="r-add">+ Aggiungi</button>
      </div>`
    document.getElementById('r-add')!.addEventListener('click', () => {
      const name = (document.getElementById('r-name') as HTMLInputElement).value.trim()
      if (!name) { flash('Serve un nome per la risorsa'); return }
      const res = addResource(id, {
        name,
        occupancyMinutes: Number((document.getElementById('r-occ') as HTMLInputElement).value) || 30,
        capacityPersons: Number((document.getElementById('r-cap') as HTMLInputElement).value) || 16,
        offsetMinutes: Number((document.getElementById('r-off') as HTMLInputElement).value) || 0,
      })
      selRes = res.id; flash('Risorsa aggiunta'); render()
    })
  }

  function renderSizes(): void {
    const teams = getEventTeams(id)
    const def = ev?.defaultTeamSize ?? 14
    document.getElementById('sizes')!.innerHTML = teams.length
      ? `<p class="pf-muted" style="margin-top:0">Default ${def} persone · modifica solo le eccezioni.</p>
         <div class="pf-tablewrap"><table class="pf-restable"><thead><tr><th>Squadra</th><th>Persone</th></tr></thead>
         <tbody>${teams.map(t => `<tr><td>${t}</td><td><input class="pf-sizein js-size" data-team="${t}" type="number" min="1" value="${getTeamSize(id, t)}" /></td></tr>`).join('')}</tbody></table></div>`
      : `<p class="pf-muted">Nessuna squadra: componi prima i gironi.</p>`
    document.querySelectorAll<HTMLInputElement>('.js-size').forEach(inp =>
      inp.addEventListener('change', () => { setTeamSize(id, inp.dataset.team!, Number(inp.value) || def); render() }))
  }

  function renderTurns(): void {
    const days = getEventDays(id)
    const resources = getResources(id)
    if (!days.length || !resources.length) {
      document.getElementById('turncontrols')!.innerHTML = ''
      document.getElementById('turns')!.innerHTML = `<p class="pf-muted">${!resources.length ? 'Aggiungi una risorsa' : 'Genera prima il calendario'} per vedere i turni.</p>`
      return
    }
    if (!days.includes(selDay)) selDay = days[0]
    if (!resources.some(r => r.id === selRes)) selRes = resources[0].id
    document.getElementById('turncontrols')!.innerHTML =
      renderTabs(days.map(d => ({ key: d, label: `${d.slice(8, 10)}/${d.slice(5, 7)}` })), selDay) +
      renderTabs(resources.map(r => ({ key: r.id, label: r.name })), selRes)
    const bars = document.querySelectorAll<HTMLElement>('#turncontrols .pf-tabs')
    bars[0].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b => b.addEventListener('click', () => { selDay = b.dataset.key!; renderTurns() }))
    bars[1].querySelectorAll<HTMLButtonElement>('.pf-tab').forEach(b => b.addEventListener('click', () => { selRes = b.dataset.key!; renderTurns() }))

    const slots = getResourceTurns(id, selRes, selDay)
    const times = slots.map(s => s.time)
    document.getElementById('turns')!.innerHTML = slots.length
      ? slots.map(s => {
          const pct = s.capacity > 0 ? Math.min(100, Math.round((s.persons / s.capacity) * 100)) : 0
          const cls = s.overflow ? 'over' : pct >= 100 ? '' : 'warn'
          const teams = s.teams.map(t => `<span class="pf-slotteam">${t.team} <small>${t.size}</small> <span class="pf-slotcat">${catName(t.categoryId)}</span>
            <select class="pf-move js-move" data-team="${t.team}">
              ${times.map(tm => `<option value="${tm}"${tm === s.time ? ' selected' : ''}>slot ${tm}</option>`).join('')}
              <option value="">(auto)</option>
            </select></span>`).join('')
          return `<div class="pf-slot${s.overflow ? ' pf-slot--over' : ''}">
            <span class="pf-slot__time">${s.time}</span>
            <div class="pf-slot__teams">${teams}</div>
            <div class="pf-slot__gauge"><div class="pf-gauge"><div class="pf-gauge__fill pf-gauge__fill--${cls}" style="width:${pct}%"></div></div>
              <div class="pf-gauge__n">${s.overflow ? `<span class="pf-over">${s.persons}/${s.capacity} · overflow +${s.persons - s.capacity}</span>` : `${s.persons}/${s.capacity}`}</div></div>
          </div>`
        }).join('') + `<p class="pf-muted">Il motore riempie per ordine di fine gara; sposta una squadra col menù. Rosso = oltre capacità.</p>`
      : `<p class="pf-muted">Nessuna squadra ha ancora un orario di fine per questa giornata.</p>`
    document.querySelectorAll<HTMLSelectElement>('.js-move').forEach(sel =>
      sel.addEventListener('change', () => { setResourceAssignment(id, selRes, selDay, sel.dataset.team!, sel.value || null); renderTurns() }))
  }

  function render(): void { renderResources(); renderSizes(); renderTurns() }
  render()
}
