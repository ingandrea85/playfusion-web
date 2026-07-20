import { renderOrganizerWorkspace } from '../../shared/chrome'
import { getEvent, getCategories, getRegistrations, addTeam, updateTeam, removeTeam } from '../../shared/mock/store'

const id = new URLSearchParams(location.search).get('event') ?? 'evt-1'
const ev = getEvent(id)
if (ev) document.getElementById('shell')!.innerHTML = renderOrganizerWorkspace(ev, 'enroll')

const cats = () => getCategories(id)

function renderAdd(): void {
  const opts = cats().map(c => `<option value="${c.id}">${c.name}</option>`).join('')
  document.getElementById('addform')!.innerHTML = `
    <div class="pf-row" style="gap:var(--space-3)">
      <div class="pf-field" style="width:160px;margin-bottom:0"><label>Categoria</label><select id="t-cat">${opts}</select></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Nome squadra</label><input id="t-name" placeholder="Es. ASD Aurora" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Referente (opz.)</label><input id="t-ref" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Telefono (opz.)</label><input id="t-phone" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Email (opz.)</label><input id="t-email" /></div>
    </div>
    <button class="pf-btn pf-btn--primary" id="t-add">Aggiungi squadra</button>`
  document.getElementById('t-add')!.addEventListener('click', () => {
    const name = (document.getElementById('t-name') as HTMLInputElement).value.trim()
    if (!name) return
    addTeam(id, (document.getElementById('t-cat') as HTMLSelectElement).value, name, {
      contactName: (document.getElementById('t-ref') as HTMLInputElement).value.trim(),
      contactPhone: (document.getElementById('t-phone') as HTMLInputElement).value.trim(),
      contactEmail: (document.getElementById('t-email') as HTMLInputElement).value.trim(),
    })
    render()
  })
}

function openEdit(regId: string): void {
  const r = getRegistrations(id).find(x => x.id === regId); if (!r) return
  const opts = cats().map(c => `<option value="${c.id}" ${c.id === r.categoryId ? 'selected' : ''}>${c.name}</option>`).join('')
  const panel = document.getElementById('teamedit')!
  panel.innerHTML = `<div class="pf-card"><h2>Modifica squadra</h2>
    <div class="pf-row" style="gap:var(--space-3)">
      <div class="pf-field" style="width:160px;margin-bottom:0"><label>Categoria</label><select id="e-cat">${opts}</select></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Nome</label><input id="e-name" value="${r.teamName}" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-3)">
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Referente</label><input id="e-ref" value="${r.contactName}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Telefono</label><input id="e-phone" value="${r.contactPhone}" /></div>
      <div class="pf-field" style="flex:1;margin-bottom:0"><label>Email</label><input id="e-email" value="${r.contactEmail}" /></div>
    </div>
    <div class="pf-row" style="gap:var(--space-2)"><button class="pf-btn pf-btn--primary" id="e-save">Salva</button><button class="pf-btn" id="e-cancel">Annulla</button></div>
  </div>`
  document.getElementById('e-save')!.addEventListener('click', () => {
    updateTeam(regId, {
      teamName: (document.getElementById('e-name') as HTMLInputElement).value.trim(),
      categoryId: (document.getElementById('e-cat') as HTMLSelectElement).value,
      contactName: (document.getElementById('e-ref') as HTMLInputElement).value.trim(),
      contactPhone: (document.getElementById('e-phone') as HTMLInputElement).value.trim(),
      contactEmail: (document.getElementById('e-email') as HTMLInputElement).value.trim(),
    })
    panel.innerHTML = ''; render()
  })
  document.getElementById('e-cancel')!.addEventListener('click', () => { panel.innerHTML = '' })
}

function render(): void {
  document.getElementById('title')!.textContent = `Squadre · ${getEvent(id)?.name ?? ''}`
  renderAdd()
  const regs = getRegistrations(id)
  const el = document.getElementById('teams')!
  if (!regs.length) { el.innerHTML = `<p class="pf-muted">Nessuna squadra inserita.</p>`; return }
  el.innerHTML = cats().map(c => {
    const rs = regs.filter(r => r.categoryId === c.id)
    if (!rs.length) return ''
    const rows = rs.map(r => `<li class="pf-rosterrow">
      <span class="pf-rosterrow__name">${r.teamName}</span>
      <span class="pf-mono">${[r.contactName, r.contactPhone, r.contactEmail].filter(Boolean).join(' · ') || '—'}</span>
      <span class="pf-rosterrow__act"><button class="pf-btn pf-btn--ghost" data-edit="${r.id}">Modifica</button><button class="pf-btn pf-btn--ghost" data-del="${r.id}">Rimuovi</button></span>
    </li>`).join('')
    return `<div class="pf-card"><div class="pf-cat__label" style="margin-bottom:var(--space-3)">${c.name}</div><ul class="pf-roster">${rows}</ul></div>`
  }).join('')
  el.querySelectorAll<HTMLButtonElement>('button[data-edit]').forEach(b => b.addEventListener('click', () => openEdit(b.dataset.edit!)))
  el.querySelectorAll<HTMLButtonElement>('button[data-del]').forEach(b => b.addEventListener('click', () => { if (confirm('Rimuovere la squadra?')) { removeTeam(b.dataset.del!); render() } }))
}

render()
